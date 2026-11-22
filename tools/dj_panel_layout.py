"""Build selectable, continuous sheets from the developed panel register.

The register supplies each surviving facet boundary in the original Blender
world coordinates. Joined faces retain their individual planes and UV mapping.
"""
import copy
import csv
import json
from pathlib import Path
import numpy as np
from glb_bounds import transform
from dj_booth import PANEL_IDS, cross2, read_accessor, signed_area

ASSETS = Path(__file__).resolve().parents[1] / 'site/assets'


def node_matrix(node):
    origin = np.asarray(transform([0.,0.,0.],node))
    matrix = np.eye(4)
    matrix[:3, 3] = origin
    matrix[:3, :3] = np.column_stack([np.asarray(transform(axis,node))-origin for axis in np.eye(3)])
    return matrix


def transform_points(points, matrix):
    return np.asarray(points) @ matrix[:3,:3].T + matrix[:3,3]


def gltf_coordinates(points):
    points = np.asarray(points, dtype=float)[:, [0,2,1]].copy()
    points[:,2] *= -1
    return points


def sheet_sources(model):
    doc = model.doc
    parents = {c: i for i,n in enumerate(doc['nodes']) for c in n.get('children', [])}
    result = {}
    for i,n in enumerate(doc['nodes']):
        if 'mesh' not in n:
            continue
        primitives = doc['meshes'][n['mesh']]['primitives']
        mat = primitives[0]['material']
        prefix, separator, rest = doc['materials'][mat]['name'].partition('_')
        if prefix != 'Panel' or not separator:
            continue
        pid = rest.split('_')[0]
        if pid in result:
            raise ValueError(f'Multiple source objects for {pid}')
        world = node_matrix(n)
        j = i
        while j in parents:
            j = parents[j]
            world = node_matrix(doc['nodes'][j]) @ world
        result[pid] = dict(node=i, parent=parents.get(i), world=world, material=mat,
                           extras=copy.deepcopy(n.get('extras',{})), prim=primitives[0])
    return result


def triangulate(points):
    """Ear clip a simple contour; keep intermediate points on shared fold lines."""
    p = np.asarray(points)
    normal = np.cross(p,np.roll(p,-1,axis=0)).sum(axis=0)
    axis = int(np.argmax(abs(normal)))
    uv = np.delete(p,axis,axis=1)
    sense = np.sign(signed_area(uv))
    def turn(i,j,k):
        return sense * cross2(uv[j]-uv[i],uv[k]-uv[i])
    ix = list(range(len(p)))
    faces = []
    while len(ix)>3:
        for j,b in enumerate(ix):
            a,c = ix[j-1],ix[(j+1)%len(ix)]
            if turn(a,b,c)<=1.e-11:
                continue
            if any(min(turn(a,b,k),turn(b,c,k),turn(c,a,k)) >= -1.e-11
                   for k in ix if k not in (a,b,c)):
                continue
            faces.append([a,b,c])
            ix.pop(j)
            break
        else:
            raise ValueError(f'Invalid sheet contour {points}')
    if turn(*ix)<=1.e-11:
        raise ValueError('Zero-area or reversed final sheet triangle')
    return np.array(faces+[ix])


def uv_map(model, source, outline):
    """Interpolate the original perforation UVs on the registered outer face."""
    prim = source['prim']
    coords = transform_points(read_accessor(model,prim['attributes']['POSITION']),source['world'])
    uvs = read_accessor(model,prim['attributes']['TEXCOORD_0'])
    tri = read_accessor(model,prim['indices']).reshape(-1,3)
    normal = np.cross(outline,np.roll(outline,-1,axis=0)).sum(axis=0)
    normal /= np.linalg.norm(normal)
    triangle_normals = np.cross(coords[tri[:,1]]-coords[tri[:,0]],coords[tri[:,2]]-coords[tri[:,0]])
    areas = np.linalg.norm(triangle_normals,axis=1)
    alignment = np.abs(triangle_normals @ normal) / np.maximum(areas,1.e-20)
    offsets = np.max(abs((coords[tri]-outline[0]) @ normal),axis=1)
    valid = np.where(alignment>.98)[0]
    if not len(valid):
        raise ValueError('Cannot map sheet surface to source UVs')
    # Both front and back faces may exist on the original thin sheet. Use the
    # face closest to the registered outline, favoring a large triangle when tied.
    nearest = valid[offsets[valid]<=offsets[valid].min()+1.e-5]
    idx = tri[nearest[np.argmax(areas[nearest])]]
    a,b,c = coords[idx]
    frame = np.column_stack((b-a,c-a))
    weights = np.linalg.pinv(frame)
    def interpolate(points):
        pair = (points-a) @ weights.T
        return uvs[idx[0]] + pair @ (uvs[idx[1:]]-uvs[idx[0]])
    # Keep the original direction even when the register lists reverse winding.
    orientation = np.cross(b-a,c-a)
    orientation /= np.linalg.norm(orientation)
    return interpolate, orientation


def align_crease_vertices(faces):
    """Snap coincident source endpoints and split an edge at any shared endpoint."""
    vertices = []
    drafts = []
    for face in faces:
        arr = []
        for p in face:
            match = next((q for q in vertices if np.linalg.norm(q-p) < .00015),None)
            if match is None:
                match = np.asarray(p)
                vertices.append(match)
            arr.append(match)
        drafts.append(np.asarray(arr))
    result = []
    for face in drafts:
        filled = []
        for a,b in zip(face,np.roll(face,-1,axis=0)):
            filled.append(a)
            ab = b-a
            distances = []
            for p in vertices:
                t = np.dot(p-a,ab)/np.dot(ab,ab)
                if 1.e-6 < t < 1-1.e-6 and np.linalg.norm(a+t*ab-p) < .00015:
                    distances.append((t,p))
            filled.extend(p for t,p in sorted(distances,key=lambda v:v[0]))
        result.append(np.asarray(filled))
    return result


def join_facet(points, face_uv, face_normal, faces, pos, normals, uv, indices, lookup):
    """Use a single indexed edge and a continuous repeat pattern at the fold."""
    keys = [tuple(np.round(p, 8)) for p in points]
    shared = [j for j,k in enumerate(keys) if k in lookup]
    if shared:
        if len(shared) < 2:
            raise ValueError('Merged faces touch at a point instead of sharing a fold')
        # Align the existing perforation grids across the common edge. Reflect
        # one UV basis if necessary so the two faces develop onto opposite sides.
        a,b = max(((a,b) for a in shared for b in shared),key=lambda ab:
                  np.linalg.norm(points[ab[1]]-points[ab[0]]))
        target_a,target_b = np.asarray(uv[lookup[keys[a]]]), np.asarray(uv[lookup[keys[b]]])
        base = face_uv[b]-face_uv[a]
        target = target_b-target_a
        delta = face_uv-face_uv[a]
        along = delta @ base / np.dot(base,base)
        across = (base[0]*delta[:,1]-base[1]*delta[:,0]) / np.dot(base,base)
        prev_side = cross2(target,np.mean(uv,axis=0)-target_a)
        handed = -1 if prev_side*across.mean()>0 else 1
        perpendicular = handed * np.array([-target[1],target[0]])
        face_uv = target_a + np.outer(along,target) + np.outer(across,perpendicular)
    ids = []
    for key,point,texture in zip(keys,points,face_uv):
        if key in lookup:
            i = lookup[key]
            normals[i] += face_normal
        else:
            i = lookup[key] = len(pos)
            pos.append(point.tolist())
            normals.append(face_normal.copy())
            uv.append(texture.tolist())
        ids.append(i)
    indices.extend(np.asarray(ids)[faces].ravel().tolist())


def repack_panels(model):
    doc = model.doc
    layout = json.loads((ASSETS/'earl-panel-layout.json').read_text())
    with (ASSETS/'earl-symmetric-panel-register.csv').open(newline='') as stream:
        old = {r['Panel ID']:json.loads(r['Vertices (world meters)']) for r in csv.DictReader(stream)}
    sources = sheet_sources(model)
    pieces = {p['id']:p for p in layout['pieces']}
    if len(pieces)!=206 or set(old)!=set(sources):
        raise ValueError('Panel layout and source model IDs do not match')
    for pid, piece in pieces.items():
        face_defs = piece['faces']
        first = sources[face_defs[0]['source']]
        original = sources.get(pid)
        if len(face_defs) == 1 and face_defs[0]['source'] == pid and 'vertices_m' not in face_defs[0]:
            # Fix the two historical aft-hoof nodes, picked only by their materials.
            n = doc['nodes'][first['node']]
            if n.get('extras',{}).get('panel_id') != pid:
                n.setdefault('extras',{}).update(panel_id=pid,panel_name=piece['name'])
                n['name'] = pid+' | '+piece['name']
            continue
        if original is None:
            template = doc['nodes'][first['node']]
            n = {key:copy.deepcopy(template[key]) for key in ('matrix','scale','rotation','translation') if key in template}
            doc['nodes'].append(n)
            parent = first['parent']
            siblings = doc['scenes'][doc.get('scene',0)]['nodes'] if parent is None else doc['nodes'][parent]['children']
            siblings.append(len(doc['nodes'])-1)
            mat = copy.deepcopy(doc['materials'][first['material']])
            material = len(doc['materials'])
            mat['name'] = f'Panel_{pid}_{material}'
            doc['materials'].append(mat)
            world = first['world']
        else:
            n = doc['nodes'][original['node']]
            material = original['material']
            world = original['world']
        pos, normal, uv, indices, lookup = [], [], [], [], {}
        net_area = 0.
        inverse = np.linalg.inv(world)
        outlines = [gltf_coordinates(f.get('vertices_m',old[f['source']])) for f in face_defs]
        # A clipping line may pass through an existing corner exactly.
        outlines = [o[np.linalg.norm(o-np.roll(o,1,axis=0),axis=1)>1.e-7] for o in outlines]
        if len(outlines)>1:
            outlines = align_crease_vertices(outlines)
        reference_normal = None
        for f,points in zip(face_defs,outlines):
            src = f['source']
            interpolate, outward = uv_map(model,sources[src],gltf_coordinates(old[src]))
            if reference_normal is None:
                reference_normal = outward
            elif np.dot(reference_normal,outward)<0:
                outward = -outward
            area_vector = np.cross(points,np.roll(points,-1,axis=0)).sum(axis=0)
            if np.dot(area_vector,outward)<0:
                points = points[::-1]
            triangles = triangulate(points)
            crosses = np.cross(points[triangles[:,1]]-points[triangles[:,0]],points[triangles[:,2]]-points[triangles[:,0]])
            net_area += float(np.linalg.norm(crosses,axis=1).sum()/2)
            local_normal = world[:3,:3].T @ outward
            local_normal /= np.linalg.norm(local_normal)
            join_facet(transform_points(points,inverse), interpolate(points), local_normal, triangles,
                       pos, normal, uv, indices, lookup)
        normal = np.asarray(normal)
        normal = (normal / np.linalg.norm(normal,axis=1)[:,None]).tolist()
        name = pid+' | '+piece['name']
        mesh = len(doc['meshes'])
        doc['meshes'].append({'name':name,'primitives':[{
            'attributes':{'POSITION':model.accessor(pos,3),'NORMAL':model.accessor(normal,3),'TEXCOORD_0':model.accessor(uv,2)},
            'indices':model.accessor(indices,1,True),'material':material}]})
        n.update(name=name, mesh=mesh, extras={**first['extras'], 'panel_id':pid, 'panel_name':piece['name'],
            'net_area_m2':net_area,'source_panels':[f['source'] for f in face_defs],'sheet_layout_revision':1})
        if any(f['source'] in PANEL_IDS for f in face_defs):
            n['extras']['dj_booth_revision'] = 1
    for retired in set(sources)-set(pieces):
        source = sources[retired]
        n = doc['nodes'][source['node']]
        n.pop('mesh')
        n.pop('extras',None)
        n['name'] = 'Retired panel seam / '+retired
        # Keep source mesh/material indices stable for the historical GLB.
        mat = doc['materials'][source['material']]
        mat['name'] = 'Retired_'+mat['name']



def apply_sheet_spec(doc):
    """Describe provisional fabrication stock independently of the existing artwork."""
    material_name = 'Provisional McNICHOLS perforated mild steel'
    spec = {
        'material': material_name,
        'gauge': 20,
        'thickness_inches': .0359,
        'sheet_thickness_m': .0359 * .0254,
        'perforation_open_area_nominal': .40,
        'open_area_fraction': .40,
        'perforation_pattern': '1/8 in round holes on 3/16 in staggered centers',
        'specification_status': 'Working estimate for detachable exterior skin; confirm supplier stock.',
        'visual_approximation': 'The display shader, hole pattern and rendered thickness are illustrative.',
    }
    live_meshes = set()
    live_materials = set()

    def update(record, new):
        extras = record.setdefault('extras', {})
        prior = {key:extras[key] for key,value in new.items() if key in extras and extras[key] != value}
        if prior:
            extras.setdefault('legacy_sheet_spec', {}).update(prior)
        extras.update(new)

    for node in doc['nodes']:
        if node.get('extras', {}).get('panel_id') and 'mesh' in node:
            live_meshes.add(node['mesh'])
            update(node, {**spec, 'skin_material': material_name,
                          'schedule_revision': 'Earl DJ booth · 206 detachable panels'})
    for i in live_meshes:
        mesh = doc['meshes'][i]
        update(mesh, spec)
        live_materials.update(p['material'] for p in mesh['primitives'])
    for i in live_materials:
        update(doc['materials'][i], spec)
    scene = doc['scenes'][doc.get('scene',0)]['extras']
    scene.setdefault('legacy_panel_schedule', scene['panel_schedule'])
    scene['panel_schedule'] = 'earl-dj-panel-register.csv'

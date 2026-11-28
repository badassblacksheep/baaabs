"""Build one selectable planar glTF mesh per installed sheet in the cut register."""
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
    """Ear-clip a simple contour, preserving its boundary edges."""
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


def triangulate_surface(outer, holes):
    """Triangulate a convex blank with an optional interior aperture."""
    if not holes:
        return outer, triangulate(outer)
    if len(holes) != 1:
        raise ValueError('A sheet supports at most one interior aperture')
    inner = holes[0]
    normal = np.cross(outer,np.roll(outer,-1,axis=0)).sum(axis=0)
    normal_axis = int(np.argmax(abs(normal)))
    poly = np.delete(outer,normal_axis,axis=1)
    aperture = np.delete(inner,normal_axis,axis=1)
    if np.sign(signed_area(poly)) != np.sign(signed_area(aperture)):
        inner = inner[::-1]
        aperture = aperture[::-1]
    # The leftmost vertices of two nested convex contours see each other, as
    # do their rightmost vertices. Those two nonintersecting bridges cut the
    # annulus into simple polygons, with no extra vertices on the physical rim.
    axis = int(np.argmax(np.ptp(aperture,axis=0)))
    left, right = int(np.argmin(poly[:,axis])), int(np.argmax(poly[:,axis]))
    eye_left, eye_right = int(np.argmin(aperture[:,axis])), int(np.argmax(aperture[:,axis]))
    def arc(start, end, length):
        return (np.arange((end-start) % length + 1) + start) % length
    coords = np.vstack((outer,inner))
    triangles = []
    for a,b,i,j in [(left,right,eye_left,eye_right),(right,left,eye_right,eye_left)]:
        boundary = np.concatenate((arc(a,b,len(outer)),len(outer)+arc(i,j,len(inner))[::-1]))
        triangles.extend(boundary[triangulate(coords[boundary])])
    return coords, np.asarray(triangles)


def perforation_uv(material):
    texture = material['pbrMetallicRoughness']['baseColorTexture']
    return 'TEXCOORD_' + str(texture.get('texCoord',0))


def uv_map(model, source, outline):
    """Interpolate the original perforation UVs on the registered outer face."""
    prim = source['prim']
    coords = transform_points(read_accessor(model,prim['attributes']['POSITION']),source['world'])
    semantic = perforation_uv(model.doc['materials'][source['material']])
    uvs = read_accessor(model,prim['attributes'][semantic])
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


def install_piece(model, piece, first, original, source_outline):
    """Create or replace a pickable mesh from registered vertices in its source frame."""
    doc=model.doc
    pid=piece['id']
    face_defs=piece['faces']
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
    # Source facets provide placement and the original perforation map. Only
    # the installed cut polygon supplies geometry, including across old seams.
    outline = gltf_coordinates(piece['vertices_m'])
    holes = [gltf_coordinates(hole) for hole in piece['holes_m']]
    interpolate, outward = uv_map(model,first,source_outline)
    direction = np.cross(outline,np.roll(outline,-1,axis=0)).sum(axis=0)
    direction /= np.linalg.norm(direction)
    if np.dot(direction,outward)<0:
        outline = outline[::-1]
        direction = -direction
    points, triangles = triangulate_surface(outline,holes)
    deviation = np.max(abs((points-outline[0]) @ direction))
    if deviation > 2.e-6:
        raise ValueError(f'{pid} surface deviates {deviation*1000:.4f} mm from its plane')
    crosses = np.cross(points[triangles[:,1]]-points[triangles[:,0]],points[triangles[:,2]]-points[triangles[:,0]])
    net_area = float(np.linalg.norm(crosses,axis=1).sum()/2)
    local_normal = world[:3,:3].T @ direction
    local_normal /= np.linalg.norm(local_normal)
    pos = transform_points(points,np.linalg.inv(world)).tolist()
    normals = np.repeat(local_normal[None,:],len(pos),axis=0).tolist()
    indices = triangles.ravel().tolist()
    name = pid+' | '+piece['name']
    mesh = len(doc['meshes'])
    uv_index = model.accessor(interpolate(points).tolist(),2)
    attributes = {'POSITION':model.accessor(pos,3),'NORMAL':model.accessor(normals,3),'TEXCOORD_0':uv_index}
    attributes[perforation_uv(doc['materials'][material])] = uv_index
    doc['meshes'].append({'name':name,'primitives':[{
        'attributes':attributes,
        'indices':model.accessor(indices,1,True),'material':material}]})
    n.update(name=name, mesh=mesh, extras={**first['extras'], 'panel_id':pid, 'panel_name':piece['name'],
        'net_area_m2':net_area,'source_panels':[f['source'] for f in face_defs],'sheet_layout_revision':3})
    extras = n['extras']
    if 'surface_points' in extras:
        extras['source_surface_points'] = extras.pop('surface_points')
    if 'empty_eye_opening' in extras:
        extras['empty_eye_opening'] = bool(holes)
    if any(f['source'] in PANEL_IDS for f in face_defs):
        n['extras']['dj_booth_revision'] = 1


def repack_panels(model):
    doc = model.doc
    from survey_fit import ARCHIVE_LAYOUT
    layout = json.loads(ARCHIVE_LAYOUT.read_text())
    with (ASSETS/'earl-symmetric-panel-register.csv').open(newline='') as stream:
        old = {r['Panel ID']:json.loads(r['Vertices (world meters)']) for r in csv.DictReader(stream)}
    sources = sheet_sources(model)
    # Some historical split sheets inherited their donor's second UV channel
    # number, though the exported primitive contains the perforation map in UV0.
    for src in sources.values():
        material = doc['materials'][src['material']]
        attrs = src['prim']['attributes']
        for tex in (material['pbrMetallicRoughness'].get('baseColorTexture'),material.get('normalTexture')):
            if tex and 'TEXCOORD_' + str(tex.get('texCoord',0)) not in attrs and 'TEXCOORD_0' in attrs:
                tex['texCoord'] = 0
    pieces = {p['id']:p for p in layout['pieces']}
    if len(pieces)!=len(layout['pieces']) or len(pieces)!=layout['panel_count'] or set(old)!=set(sources):
        raise ValueError('Panel layout and source model IDs do not match')
    for pid, piece in pieces.items():
        face_defs = piece['faces']
        first = sources[face_defs[0]['source']]
        original = sources.get(pid)
        if pid.startswith('K-'):
            # Fix the two historical aft-hoof nodes, picked only by their materials.
            n = doc['nodes'][first['node']]
            if n.get('extras',{}).get('panel_id') != pid:
                n.setdefault('extras',{}).update(panel_id=pid,panel_name=piece['name'])
                n['name'] = pid+' | '+piece['name']
            continue
        install_piece(model,piece,first,original,gltf_coordinates(old[face_defs[0]['source']]))
    for retired in set(sources)-set(pieces):
        source = sources[retired]
        n = doc['nodes'][source['node']]
        n.pop('mesh')
        n.pop('extras',None)
        n['name'] = 'Retired panel seam / '+retired
        # Keep source mesh/material indices stable for the historical GLB.
        mat = doc['materials'][source['material']]
        mat['name'] = 'Retired_'+mat['name']
    return layout['pieces']



def apply_sheet_spec(doc, panel_count):
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
                          'schedule_revision': f'Earl flat shell · {panel_count} detachable panels'})
    for i in live_meshes:
        mesh = doc['meshes'][i]
        update(mesh, spec)
        live_materials.update(p['material'] for p in mesh['primitives'])
    for i in live_materials:
        update(doc['materials'][i], spec)
    scene = doc['scenes'][doc.get('scene',0)]['extras']
    scene.setdefault('legacy_panel_schedule', scene['panel_schedule'])
    scene['panel_schedule'] = 'earl-dj-panel-register.csv'

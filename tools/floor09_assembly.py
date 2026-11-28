"""Install the paired floor poses. The default glTF appearance is the event assembly."""
import json
from pathlib import Path
import subprocess

import numpy as np

from dj_booth import read_accessor
from dj_panel_layout import gltf_coordinates, node_matrix, transform_points
from survey_deck import member_matrix, mesh_bounds, set_matrix

RECIPE = Path(__file__).with_name('floor09-recipe.mjs')


def floor_recipe():
    return json.loads(subprocess.check_output(['node', str(RECIPE)]))


def part_matrix(part, thickness, bumper):
    points = np.array(part['points'])
    if part['kind'] == 'line':
        a, b = points
        # Keep horizontal member depth vertical. The analyzed portals retain their own axes.
        axis = part.get('axis') or np.cross([0, 0, 1], b-a).tolist()
        if np.linalg.norm(axis) < 1e-8:
            axis = [1, 0, 0]
        w, h = part['section']
        return member_matrix(dict(a=a, b=b, axis_y=axis, width=w, depth=h), bumper)
    pts = gltf_coordinates(points)
    matrix = np.eye(4)
    if part['kind'] == 'box':
        matrix[:3, :3] = np.diag(abs(pts[1]-pts[0]))
        matrix[:3, 3] = pts.mean(axis=0)
    else:
        down = gltf_coordinates([part.get('down', [0, 0, -1])])[0] * thickness
        matrix[:3, :3] = np.column_stack((pts[1]-pts[0], pts[3]-pts[0], down))
        matrix[:3, 3] = pts.mean(axis=0) + down/2
        if np.linalg.det(matrix[:3, :3]) < 0:
            matrix[:3, 2] *= -1
    matrix[0, 3] += bumper
    return matrix


# Materials communicate the same named poses to the workshop and native export.
FINISH = {
    'frame': ('deckframe', [.075,.18,.16]), 'shore': ('mounts', [.52,.19,.045]),
    'plywood': ('deck', [.035,.032,.032]), 'leaf frame': ('deckframe', [.24,.19,.095]),
    'receiver': ('deckframe', [.12,.22,.22]), 'slide arm': ('deckframe', [.60,.40,.10]),
    'saddle': ('deckframe', [.67,.38,.09]), 'lock pin': ('deckframe', [.55,.54,.50]),
    'guard': ('equipment', [.44,.46,.48])
}


def install_folding_floor(model, bumper):
    recipe = floor_recipe()
    doc, nodes = model.doc, model.doc['nodes']
    scene = doc['scenes'][doc.get('scene', 0)]
    floors = []
    access = []
    def revise(indices, parent):
        kept = []
        for i in indices:
            n = nodes[i]
            comp = n.get('extras', {}).get('component')
            world = parent @ node_matrix(n)
            if comp == 'deck':
                floors.append(mesh_bounds(model, n, world)[1, 1])
            if (comp in ('deck','rails') or n['name'].startswith(('Survey frame |','Interior post foot'))):
                continue
            if comp in ('ladder','access'):
                access.append((n,parent,world))
            # Only these chassis references / portal fittings and the donor travel with the floor.
            if n['name'].startswith(('Bus__','Reference •','Front post shoe','Transverse sill seat',
                                     'Rear study · mirror of Front post shoe','Rear study · mirror of Transverse sill seat')):
                n.setdefault('extras', {})['road_retained'] = True
            if 'children' in n:
                n['children'] = revise(n['children'], world)
            kept.append(i)
        return kept
    scene['nodes'] = revise(scene['nodes'], np.eye(4))
    if not floors or not access:
        raise ValueError('Expected the fitted deck and rear access')
    # The fixed-height stair and its casters stay rigid. Pitch the transfer
    # landing and its rails from the new deck edge to the existing stair end.
    landing,world = next((n,w) for n,_,w in access if n['name']=='Proposed_transfer_landing')
    primitive = doc['meshes'][landing['mesh']]['primitives'][0]
    pts = transform_points(read_accessor(model,primitive['attributes']['POSITION']), world)
    start,end = pts[:,0].min(),pts[:,0].max()
    def edge_height(x):
        return pts[np.isclose(pts[:,0],x,atol=.003,rtol=0),1].max()
    stair_top = next(mesh_bounds(model,n,w)[1,1] for n,_,w in access if '15 top platform' in n['name'])
    front_delta = recipe['surface'] - edge_height(start)
    back_delta = stair_top - edge_height(end)
    transfer = np.eye(4)
    transfer[1,0] = (back_delta-front_delta)/(end-start)
    transfer[1,3] = front_delta-transfer[1,0]*start
    for n, parent, world in access:
        if n['extras']['component']=='access':
            set_matrix(n,np.linalg.solve(parent,transfer @ world))

    # One indexed, face-normal unit cube is instanced at each oriented envelope.
    vertices, normals, triangles = [], [], []
    for axis in range(3):
        for sign in (-1,1):
            normal = np.eye(3)[axis]*sign
            a = np.eye(3)[(axis+1)%3]
            b = np.cross(normal,a)
            start = len(vertices)
            for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                vertices.append(((normal+a*u+b*v)/2).tolist())
                normals.append(normal.tolist())
            triangles.extend(start+k for k in (0,1,2,0,2,3))
    attrs = {'POSITION':model.accessor(vertices,3),'NORMAL':model.accessor(normals,3)}
    indices = model.accessor(triangles,1,True)
    meshes = {}
    children = []
    for part in recipe['parts']:
        pose, layer = part['pose'], part['layer']
        kind = part.get('group')
        if part.get('face'):
            finish = 'plywood'
        elif layer == 'supports':
            finish = {'removable bearing saddle':'saddle','lock pin':'lock pin','slide arm':'slide arm'}.get(kind,'receiver')
        else:
            finish = {'guard':'guard','wing':'leaf frame','shores':'shore'}.get(layer,'frame')
        group, rgb = FINISH[finish]
        key = pose, finish
        if key not in meshes:
            name = f'Workshop_{group}_Rev09_{pose}_{finish}'
            pbr = {'baseColorFactor':[*rgb,0 if pose=='folded' else 1],
                   'metallicFactor':0 if finish=='plywood' else .48,'roughnessFactor':.77}
            mat = {'name':name,'pbrMetallicRoughness':pbr,'extras':{'floor_pose':pose}}
            if pose == 'folded':
                mat.update(alphaMode='MASK',alphaCutoff=.5)
            material = len(doc['materials'])
            doc['materials'].append(mat)
            meshes[key] = len(doc['meshes'])
            doc['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'indices':indices,'material':material}]})
        meta = {'floor_pose':pose,'component':'deck' if finish=='plywood' else 'rails' if finish=='guard' else group,
                'floor_role':kind or part['label'],'floor_layer':layer,'road_retained':pose!='event'}
        n = {'name':f'{part["label"]} | {pose}', 'mesh':meshes[key],'extras':meta}
        set_matrix(n, part_matrix(part,recipe['thickness'],bumper))
        children.append(len(nodes))
        nodes.append(n)
    scene['nodes'].append(len(nodes))
    nodes.append({'name':'Rev 09 | folding dance floor','children':children})
    extras = doc['asset']['extras']
    extras.update(roof_iteration=recipe['revision'],structural_iteration=recipe['revision'],
                  structural_geometry='structural/floor-09/design.json',concept_shoring_revision=recipe['revision'],
                  concept_shore_positions_m=[[p['points'][0][0]+bumper,*p['points'][0][1:]]
                      for p in recipe['parts'] if p['label'].startswith('Body shore ')],
                  roof_revision_note='Full-width core and two folding wings; event appearance by default.')
    scene['extras']['Deck concept'] = 'Rev 09 · retained core, mirrored folding wings, retractable supports and event railing.'
    scene['extras']['fit_revision'] = 'Surveyed longitudinal donor fit with the Rev 09 floor.'

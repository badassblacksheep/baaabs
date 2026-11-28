"""Verify the installed Rev 09 floor and both visible configurations in the public GLB."""
from collections import Counter
from pathlib import Path
import runpy
import sys

import numpy as np

from dj_booth import read_accessor
from dj_panel_layout import node_matrix, transform_points
from floor09_assembly import floor_recipe, part_matrix
from survey_deck import mesh_bounds
from survey_fit import ROOT, donor_datums

model = runpy.run_path(str(ROOT/'tools/build-animated-eyes.py'))['Model'](Path(sys.argv[1]))
doc = model.doc
recipe = floor_recipe()
bumper, _, _, rear = donor_datums(doc)
installed = []
access = {}
def visit(index, parent):
    n = doc['nodes'][index]
    world = parent @ node_matrix(n)
    if 'floor_pose' in n.get('extras', {}):
        installed.append((n,world))
    elif n.get('extras', {}).get('component') in ('deck','rails','deckframe','mounts'):
        raise AssertionError('Prior floor still visible: '+n['name'])
    elif n['name'] in ('Proposed_transfer_landing','154028G | 15 top platform'):
        access[n['name']] = n,world
    for c in n.get('children', []):
        visit(c,world)
for root in doc['scenes'][doc['scene']]['nodes']:
    visit(root,np.eye(4))
close = np.testing.assert_allclose
assert len(installed) == len(recipe['parts'])
roles = Counter()
bounds = {}
for (n,world), part in zip(installed,recipe['parts'],strict=True):
    pose = part['pose']
    close(world,part_matrix(part,recipe['thickness'],bumper),atol=1e-7,rtol=0)
    meta = n['extras']
    assert meta['floor_pose'] == pose and meta['road_retained']==(pose!='event')
    mat = doc['materials'][doc['meshes'][n['mesh']]['primitives'][0]['material']]
    assert mat['extras']['floor_pose']==pose
    assert mat['pbrMetallicRoughness']['baseColorFactor'][3]==int(pose!='folded')
    assert np.linalg.det(world[:3,:3])>0
    roles[pose,meta['floor_role']] += 1
    if meta['component']=='deck':
        bounds.setdefault(pose,[]).append(mesh_bounds(model,n,world))
assert len([p for p in recipe['parts'] if p['label'].startswith('Body shore ')])==10
assert roles['event','slide arm']==roles['folded','slide arm']==8
assert roles['event','removable bearing saddle']==8
lo, hi = {}, {}
for pose, pieces in bounds.items():
    boxes=np.array(pieces)
    lo[pose],hi[pose]=boxes[:,0].min(axis=0),boxes[:,1].max(axis=0)
assert len(bounds['event'])==len(bounds['folded'])==6
close((lo['fixed'][0]+hi['fixed'][0])/2,(bumper+rear)/2,atol=1e-6)
assert hi['event'][2]>hi['folded'][2]>hi['fixed'][2]
assert lo['folded'][1]<lo['event'][1]
close(hi['fixed'][1],hi['event'][1],atol=1e-7)
n,world=access['Proposed_transfer_landing']
vertices=transform_points(read_accessor(model,doc['meshes'][n['mesh']]['primitives'][0]['attributes']['POSITION']),world)
stair=mesh_bounds(model,*access['154028G | 15 top platform'])
for x,y in [(hi['fixed'][0],hi['fixed'][1]),(stair[0,0],stair[1,1])]:
    close(vertices[abs(vertices[:,0]-x)<.003,1].max(),y,atol=.001)
print('Verified Rev 09 floor, ten shores, six bilateral leaves, eight sliding supports, stepped event guard and rear stair landing.')

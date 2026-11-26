"""Check the installed floor, access and frame in the serialized workshop GLB."""
import json
from pathlib import Path
import runpy
import sys

import numpy as np

from dj_panel_layout import gltf_coordinates, node_matrix
from survey_deck import mesh_bounds
from survey_fit import ROOT, donor_datums

model = runpy.run_path(str(ROOT / 'tools/build-animated-eyes.py'))['Model'](Path(sys.argv[1]))
recipe = json.loads((ROOT/'site/assets/earl-deck-model.json').read_text())
frame = recipe['candidate']
bumper, _, _, rear = donor_datums(model.doc)
expected = bumper + np.array(frame['deckBoundsM'])
close = np.testing.assert_allclose
close(expected.mean(), (bumper + rear)/2, atol=1e-6, rtol=0)
close(expected[1]-expected[0], frame['deckLengthIn']*.0254, atol=1e-6, rtol=0)

bounds = {}
members = {}
shores = []
def visit(index, parent):
    node = model.doc['nodes'][index]
    world = parent @ node_matrix(node)
    extras = node.get('extras', {})
    if extras.get('analytical_member'):
        members[node['name']] = world
    if extras.get('concept_shore') and extras['role'] == 'vertical':
        shores.append(world[:3, 3])
    if extras.get('component') in ('deck', 'access', 'ladder'):
        bounds[node['name']] = mesh_bounds(model, node, world)
    for child in node.get('children', []):
        visit(child, world)

for i in model.doc['scenes'][model.doc.get('scene', 0)]['nodes']:
    visit(i, np.eye(4))
floors = np.array([b for name,b in bounds.items() if name.startswith('Dancefloor_section_')])
assert len(floors) == 12
close([min(floors[:,0,0]), max(floors[:,1,0])], expected, atol=1e-6, rtol=0)
close(max(floors[:,1,2])-min(floors[:,0,2]), frame['deckWidthIn']*.0254, atol=1e-6, rtol=0)
landing = bounds['Proposed_transfer_landing']
stairs = bounds['154028G | 15 top platform']
close(landing[0,0], expected[1], atol=.003, rtol=0)
close(landing[1,1], max(floors[:,1,1]), atol=.001, rtol=0)
close(stairs[0,0], landing[1,0], atol=.003, rtol=0)
assert len(members) == len(frame['members'])
for m in frame['members']:
    world = members[m['name']]
    endpoints = np.array([world[:3,3]-world[:3,0]/2, world[:3,3]+world[:3,0]/2])
    close(endpoints, gltf_coordinates([m['a'],m['b']])+[bumper,0,0], atol=1e-7, rtol=0)
assert len(shores) == 6
expected_shores = gltf_coordinates(frame['shorePositions']) + [bumper,0,0]
close(np.array(shores)[:,[0,2]], expected_shores[:,[0,2]], atol=1e-7, rtol=0)
print(f"Verified {frame['deckLengthIn']} × {frame['deckWidthIn']} in floor, rear access, {len(members)} members and {len(shores)} shores.")

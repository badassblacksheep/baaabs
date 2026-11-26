"""Verify image identity, physical UV distances and material scope on the exported assembly."""
import gzip
import json
import struct
import zlib
from pathlib import Path
import runpy
import sys

import numpy as np

from dj_booth import read_accessor
from dj_panel_layout import node_matrix, sheet_sources, transform_points
from panel_skin import ASSETS, CONFIG, calibration_digest, tile_period

Model = runpy.run_path(str(Path(__file__).with_name('build-animated-eyes.py')))['Model']
model = Model(Path(sys.argv[1]))
spec = json.loads(CONFIG.read_text())
tile = (ASSETS / spec['texture']).read_bytes()
assert b'calibration\0' + calibration_digest(spec).encode() in tile
visibility = model.doc['asset']['extras']['panelVisibility']
assert visibility == {**spec['viewHeightMeters'], 'alphaCutoff': spec['alphaCutoff']}
assert 0 < visibility['fullPerforations'] < visibility['opaquePanels']
# Our tile writer emits one unfiltered RGBA PNG IDAT. Measure actual open area at all three scales.
offset = 8
while tile[offset+4:offset+8] != b'IDAT':
    offset += 12 + int.from_bytes(tile[offset:offset+4], 'big')
length = int.from_bytes(tile[offset:offset+4], 'big')
size = spec['photo']['tileResolution']
rows = np.frombuffer(zlib.decompress(tile[offset+8:offset+8+length]),np.uint8).reshape(size,1+size*4)
assert np.all(rows[:,0] == 0)
alpha = rows[:,4::4] / 255
expected = np.pi / (2*np.sqrt(3)) * (spec['holeDiameterInches']/spec['nearestCenterInches'])**2
for detail in (0., .5, 1.):
    assert abs(np.mean(alpha < detail*spec['alphaCutoff']) - expected*detail) < .012, detail
period = tile_period(spec)
panels = sheet_sources(model)
layout = json.loads((ASSETS / 'earl-panel-layout.json').read_text())
assert set(panels) == {p['id'] for p in layout['pieces']}
# Compare physical UV pairs, including shared corners with distinct per-sheet mapping.
home_vertices = set()
solid_register_vertices = set()
for path in (ASSETS / 'home-model').glob('*.mesh'):
    data = gzip.decompress(path.read_bytes())
    offset = 0
    while offset < len(data):
        count, indices = struct.unpack_from('<II',data,offset)
        offset += 8
        for x,y,z,r,g,b,surface,u,v in struct.iter_unpack('<hhhBBBBHH',data[offset:offset+14*count]):
            if surface == 6:
                solid_register_vertices.add((x,y,z))
            if surface == 5:
                assert r == g == b and r >= 96, 'Homepage vertex lighting would apply the paint twice'
                home_vertices.add((x,y,z,u,v))
        offset += 14*count + 2*indices
# The solid special items use the layer switch without inheriting the sheet cutout.
nodes = model.doc['nodes']
parents = {child: i for i,node in enumerate(nodes) for child in node.get('children', [])}
expected_solid = set()
for item in layout['special_items']:
    matches = [i for i,node in enumerate(nodes) if node.get('extras',{}).get('component') == item['component']]
    assert matches, item['id']
    for index in matches:
        node = nodes[index]
        world = node_matrix(node)
        while index in parents:
            index = parents[index]
            world = node_matrix(nodes[index]) @ world
        for primitive in model.doc['meshes'][node['mesh']]['primitives']:
            points = transform_points(read_accessor(model,primitive['attributes']['POSITION']),world)
            indices = read_accessor(model,primitive['indices']).reshape(-1,3)
            triangles = points[indices]
            normals = np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])
            used = triangles[np.linalg.norm(normals,axis=1)>1e-8].reshape(-1,3)
            expected_solid.update(map(tuple,np.rint(1000*used).astype(int)))
assert solid_register_vertices == expected_solid, 'Solid register items must match the homepage panel-toggle group'
material_ids = set()
texture_ids = set()
for pid, src in panels.items():
    mat = model.doc['materials'][src['material']]
    pbr = mat['pbrMetallicRoughness']
    assert mat['alphaMode'] == 'MASK' and mat['alphaCutoff'] == spec['alphaCutoff'], pid
    assert pbr['baseColorFactor'] == spec['baseColorFactor'], (pid, 'incorrect paint finish')
    assert (pbr['metallicFactor'], pbr['roughnessFactor']) == (spec['metallic'],spec['roughness']), pid
    material_ids.add(src['material'])
    texture_ids.add(pbr['baseColorTexture']['index'])
    attrs = src['prim']['attributes']
    world = transform_points(read_accessor(model, attrs['POSITION']), src['world'])
    uv = read_accessor(model, attrs['TEXCOORD_0']).astype(float)
    remapped = np.column_stack([(world*1000).round(),(uv*256).round()]).astype(int)
    # The compact mesh rounds positions to millimetres; ties in the two matrix products may differ.
    for x,y,z,u,v in remapped:
        assert any((x+dx,y+dy,z+dz,u,v) in home_vertices
                   for dx in (0,-1,1) for dy in (0,-1,1) for dz in (0,-1,1)), (pid,u,v)
    developed = uv * period
    def distances(points):
        return np.linalg.norm(points[:,None]-points[None,:], axis=2)
    np.testing.assert_allclose(distances(developed), distances(world), rtol=3e-6, atol=2e-6, err_msg=pid)
texture_id, = texture_ids
texture = model.doc['textures'][texture_id]
sampler = model.doc['samplers'][texture['sampler']]
assert sampler['wrapS'] == sampler['wrapT'] == 10497 and sampler['minFilter'] == 9987
image = model.doc['images'][texture['source']]
v = model.doc['bufferViews'][image['bufferView']]
assert model.bin[v['byteOffset']:v['byteOffset']+v['byteLength']] == tile
for i, mat in enumerate(model.doc['materials']):
    if i not in material_ids:
        assert mat.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index') != texture_id
print(f'Verified calibrated photographic steel on all {len(panels)} registered panels.')

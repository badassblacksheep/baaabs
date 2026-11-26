"""Verify image identity, physical UV distances and material scope on the exported assembly."""
import gzip
import json
import struct
from pathlib import Path
import runpy
import sys

import numpy as np

from dj_booth import read_accessor
from dj_panel_layout import sheet_sources, transform_points
from panel_skin import ASSETS, CONFIG, calibration_digest, tile_period

Model = runpy.run_path(str(Path(__file__).with_name('build-animated-eyes.py')))['Model']
model = Model(Path(sys.argv[1]))
spec = json.loads(CONFIG.read_text())
tile = (ASSETS / spec['texture']).read_bytes()
assert b'calibration\0' + calibration_digest(spec).encode() in tile
period = tile_period(spec)
panels = sheet_sources(model)
layout = json.loads((ASSETS / 'earl-panel-layout.json').read_text())
assert set(panels) == {p['id'] for p in layout['pieces']}
# Compare physical UV pairs, including shared corners with distinct per-sheet mapping.
home_vertices = set()
for path in (ASSETS / 'home-model').glob('*.mesh'):
    data = gzip.decompress(path.read_bytes())
    offset = 0
    while offset < len(data):
        count, indices = struct.unpack_from('<II',data,offset)
        offset += 8
        for x,y,z,r,g,b,surface,u,v in struct.iter_unpack('<hhhBBBBHH',data[offset:offset+14*count]):
            if surface == 5:
                assert r == g == b and r >= 96, 'Homepage bake tints or darkens the steel photograph'
                home_vertices.add((x,y,z,u,v))
        offset += 14*count + 2*indices
material_ids = set()
texture_ids = set()
for pid, src in panels.items():
    mat = model.doc['materials'][src['material']]
    pbr = mat['pbrMetallicRoughness']
    assert mat['alphaMode'] == 'MASK' and mat['alphaCutoff'] == spec['alphaCutoff'], pid
    assert pbr['baseColorFactor'] == [1,1,1,1], (pid, 'a tint would obscure the photo')
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

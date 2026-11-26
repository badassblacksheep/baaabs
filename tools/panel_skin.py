"""Photographic material for registered detachable sheets; all distances in metres after calibration."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import zlib

import numpy as np

from dj_booth import read_accessor
from dj_panel_layout import sheet_sources, transform_points

ASSETS = Path(__file__).resolve().parents[1] / 'site/assets'
CONFIG = ASSETS / 'panel-skin.json'


def tile_period(spec):
    # In this photo the straight rows of nearest neighbours run vertically.
    pitch = spec['nearestCenterInches'] * .0254
    return pitch * np.array([math.sqrt(3), 1]) * spec['photo']['rectangularRepeats']


def calibration_digest(spec):
    # Trace the tile to the input pixels and the settings that affect its samples.
    settings = {key:spec[key] for key in ('photo','holeDiameterInches','nearestCenterInches','lattice')}
    return hashlib.sha256((ASSETS / spec['reference']).read_bytes()
                          + json.dumps(settings, sort_keys=True).encode()).hexdigest()


def make_tile(spec):
    """Sample whole lattice cells from the owner's photo, retaining its mill finish and cut edges."""
    photo = spec['photo']
    decoded = subprocess.check_output(['ffmpeg', '-loglevel', 'error', '-i', str(ASSETS / spec['reference']),
                                       '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'ppm', 'pipe:1'])
    _, dimensions, _, pixels = decoded.split(b'\n', 3)
    width, height = map(int, dimensions.split())
    pixels = np.frombuffer(pixels, np.uint8).reshape(height, width, 3)
    n = photo['tileResolution']
    y, x = (np.indices((n, n)) + .5) / n
    cols, rows = photo['rectangularRepeats']
    x *= math.sqrt(3) * cols
    y *= rows
    # The two sublattices share one rectangular repeat. Mask to the specified punched diameter.
    distance = np.full_like(x, np.inf)
    for offset in (0, .5):
        dx = ((x / math.sqrt(3) - offset + .5) % 1 - .5) * math.sqrt(3)
        dy = (y - offset + .5) % 1 - .5
        distance = np.minimum(distance, np.hypot(dx, dy))
    radius = .5 * spec['holeDiameterInches'] / spec['nearestCenterInches']
    alpha = np.clip(.5 + (distance - radius) * n / rows, 0, 1)
    ox, oy = photo['firstHoleCenterPx']
    sx = ox + x * photo['nearestCenterPx']
    sy = oy + y * photo['nearestCenterPx']
    ix, iy = sx.astype(int), sy.astype(int)
    fx, fy = (sx-ix)[...,None], (sy-iy)[...,None]
    color = (1-fy)*((1-fx)*pixels[iy,ix] + fx*pixels[iy,ix+1]) + fy*((1-fx)*pixels[iy+1,ix] + fx*pixels[iy+1,ix+1])
    rgba = np.dstack([color, 255*alpha]).round().astype(np.uint8)
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data))
    raw = b''.join(b'\0' + row.tobytes() for row in rgba)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', n,n,8,6,0,0,0))
            + chunk(b'tEXt', b'calibration\0' + calibration_digest(spec).encode())
            + chunk(b'IDAT', zlib.compress(raw,9)) + chunk(b'IEND', b''))


def sheet_uv(points, triangles, period):
    """Project onto an orthonormal frame in the final sheet plane; preserve metres on sloped faces."""
    edges = points[triangles] - points[triangles[:, :1]]
    normals = np.cross(edges[:,1], edges[:,2])
    normal = normals[np.argmax(np.linalg.norm(normals,axis=1))]
    normal /= np.linalg.norm(normal)
    # Follow the bus length wherever possible, including on mirrored flank panels.
    axis = np.array([1.,0,0]) if abs(normal[0]) < .98 else np.array([0.,0,1.])
    u = axis - np.dot(axis, normal) * normal
    u /= np.linalg.norm(u)
    v = np.cross(normal, u)
    if v[np.argmax(np.abs(v))] < 0:
        v = -v
    uv = points @ np.stack([u,v]).T / period
    return uv - np.floor(uv.min(axis=0))


def apply_panel_skin(model):
    spec = json.loads(CONFIG.read_text())
    period = tile_period(spec)
    doc = model.doc
    tile = (ASSETS / spec['texture']).read_bytes()
    if b'calibration\0' + calibration_digest(spec).encode() not in tile:
        raise ValueError('Panel texture is stale. Rebuild it with python3 tools/panel_skin.py')
    image = len(doc['images'])
    doc['images'].append({'name': spec['name'], 'bufferView': model.data(tile), 'mimeType': 'image/png'})
    sampler = len(doc.setdefault('samplers', []))
    doc['samplers'].append({'wrapS':10497, 'wrapT':10497, 'magFilter':9729, 'minFilter':9987})
    texture = len(doc['textures'])
    doc['textures'].append({'source':image, 'sampler':sampler})
    for src in sheet_sources(model).values():
        prim = src['prim']
        points = transform_points(read_accessor(model, prim['attributes']['POSITION']), src['world'])
        idx = read_accessor(model, prim['indices']).reshape(-1,3)
        uv = sheet_uv(points, idx, period)
        prim['attributes']['TEXCOORD_0'] = model.accessor(uv.tolist(), 2)
        mat = doc['materials'][src['material']]
        mat.pop('normalTexture', None)
        mat.update(alphaMode='MASK', alphaCutoff=spec['alphaCutoff'], doubleSided=True)
        mat['pbrMetallicRoughness'] = {'baseColorFactor':spec['baseColorFactor'], 'baseColorTexture':{'index':texture},
                                      'metallicFactor':spec['metallic'], 'roughnessFactor':spec['roughness']}
        extras = mat['extras']
        estimate_keys = ('perforation_open_area_nominal','open_area_fraction','perforation_pattern',
                         'gauge','thickness_inches','sheet_thickness_m','specification_status')
        extras['estimating_basis'] = {key:extras.pop(key) for key in estimate_keys if key in extras}
        extras.pop('inspection_translucency', None)
        extras.update(visual_approximation=spec['name'], hole_diameter_inches=spec['holeDiameterInches'],
                      nearest_center_inches=spec['nearestCenterInches'], lattice=spec['lattice'])
        mat['extras']['display_material'] = 'panel-skin.json'


if __name__ == '__main__':
    spec = json.loads(CONFIG.read_text())
    (ASSETS / spec['texture']).write_bytes(make_tile(spec))

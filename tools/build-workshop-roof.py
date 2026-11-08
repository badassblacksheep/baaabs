"""Add an independent X-braced roof-frame layer to the Earl workshop GLB."""
import json
import math
import struct
import sys
from pathlib import Path

from glb_bounds import bounds


def box_mesh(doc, buffer):
    # One flat-shaded unit box is instanced for every square-section member.
    positions, normals = [], []
    for axis in range(3):
        for sign in (-1, 1):
            for u, v in [(-1, -1), (1, -1), (1, 1), (-1, -1), (1, 1), (-1, 1)]:
                point = [0, 0, 0]
                point[axis] = sign
                point[(axis + 1) % 3] = sign * u
                point[(axis + 2) % 3] = v
                positions.extend(c / 2 for c in point)
                normal = [0, 0, 0]
                normal[axis] = sign
                normals.extend(normal)

    attrs = {}
    for name, values in [('POSITION', positions), ('NORMAL', normals)]:
        raw = struct.pack(f'<{len(values)}f', *values)
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(buffer),
                                   'byteLength': len(raw), 'target': 34962})
        buffer.extend(raw)
        accessor = {'bufferView': view, 'componentType': 5126, 'count': 36, 'type': 'VEC3'}
        if name == 'POSITION':
            accessor.update(min=[-0.5] * 3, max=[0.5] * 3)
        attrs[name] = len(doc['accessors'])
        doc['accessors'].append(accessor)
    mat = len(doc['materials'])
    doc['materials'].append({'name': 'Workshop_deckframe_square_tube',
                             'pbrMetallicRoughness': {'baseColorFactor': [0.075, 0.45, 0.47, 1],
                                                      'metallicFactor': 0.35, 'roughnessFactor': 0.55}})
    mesh = len(doc['meshes'])
    doc['meshes'].append({'name': 'Roof frame square tube', 'primitives': [{'attributes': attrs, 'material': mat}]})
    return mesh


def build(source, destination):
    data = source.read_bytes()
    json_length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + json_length])
    buffer = bytearray(data[28 + json_length:])
    mesh = box_mesh(doc, buffer)
    # glb_bounds returns vehicle longitudinal, lateral, and vertical axes.
    floor = [p for p in bounds(source) if p['name'].startswith('Dancefloor_section_')]
    x0, y0, bottom = [min(p['min'][i] for p in floor) for i in range(3)]
    x1, y1 = [max(p['max'][i] for p in floor) for i in range(2)]
    tube = 0.060  # Visual section only.
    elevation = bottom - tube / 2
    children = []

    def member(name, xa, ya, xb, yb):
        angle = math.atan2(yb - ya, xb - xa)
        children.append(len(doc['nodes']))
        doc['nodes'].append({'name': name, 'mesh': mesh,
                             'translation': [(xa + xb) / 2, elevation, -(ya + yb) / 2],
                             'rotation': [0, math.sin(angle / 2), 0, math.cos(angle / 2)],
                             'scale': [math.hypot(xb - xa, yb - ya), tube, tube]})

    for y in (y0 + tube / 2, y1 - tube / 2):
        member('Roof perimeter rail', x0, y, x1, y)
    bays = max(1, round((x1 - x0) / (y1 - y0)))
    left, right = y0 + tube, y1 - tube
    cross = [x0 + tube / 2 + (x1 - x0 - tube) * i / bays for i in range(bays + 1)]
    for i, x in enumerate(cross, 1):
        member(f'Roof crossbeam {i}', x, left, x, right)
    for i, (start, end) in enumerate(zip(cross, cross[1:]), 1):
        a, b = start + tube / 2, end - tube / 2
        member(f'Roof bay {i} diagonal A', a, left, b, right)
        member(f'Roof bay {i} diagonal B', a, right, b, left)
    doc['scenes'][doc['scene']]['nodes'].append(len(doc['nodes']))
    doc['nodes'].append({'name': 'X-braced roof frame', 'children': children,
                         'extras': {'component': 'deckframe', 'design_status': 'Visual concept only'}})
    doc['buffers'][0]['byteLength'] = len(buffer)
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    destination.write_bytes(struct.pack('<4sIIII', b'glTF', 2, 28 + len(encoded) + len(buffer),
                                        len(encoded), 0x4E4F534A) + encoded +
                            struct.pack('<II', len(buffer), 0x004E4942) + buffer)


if __name__ == '__main__':
    build(Path(sys.argv[1]), Path(sys.argv[2]))

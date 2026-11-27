"""Build the Rev 08 bus outline from the same donor and longitudinal fit as the workshop."""
import argparse
import json
import re
import runpy

import numpy as np

from dj_booth import read_accessor
from dj_panel_layout import node_matrix, transform_points
from survey_fit import LongitudinalFit, ROOT, SOURCE

assembly = runpy.run_path(str(ROOT / 'tools/build-survey-assembly.py'))
target = ROOT / 'site/structural/road-08/donor.json'


def outline():
    fit = LongitudinalFit()
    model = assembly['Model'](SOURCE)
    assembly['fit_donor'](model, fit)
    shapes = []
    for node in model.doc['nodes']:
        name = node.get('name', '').removeprefix('Bus__')
        tire = re.fullmatch(r'(Front|Rear) tire -?1', name)
        side = 'glazing band' in name or 'lower skin' in name
        end = name in ('Front fascia', 'Rear fascia', 'Front bumper', 'Rear bumper')
        if not (tire or side or end or name == 'Rolled roof'):
            continue
        mesh = model.doc['meshes'][node['mesh']]
        vertices = np.concatenate([read_accessor(model, p['attributes']['POSITION']) for p in mesh['primitives']])
        xyz = transform_points(vertices, node_matrix(node))[:, [0, 2, 1]].copy()
        xyz[:, 0] -= fit.target[0]
        xyz[:, 1] *= -1
        lo, hi = xyz.min(axis=0), xyz.max(axis=0)
        center = (lo + hi) / 2
        if tire:
            angles = np.linspace(0, 2*np.pi, 33)
            pts = [[center[0] + np.cos(a)*(hi[0]-lo[0])/2, center[1],
                    center[2] + np.sin(a)*(hi[2]-lo[2])/2] for a in angles]
        elif side:
            y = center[1]
            pts = [[lo[0],y,lo[2]],[hi[0],y,lo[2]],[hi[0],y,hi[2]],[lo[0],y,hi[2]],[lo[0],y,lo[2]]]
        elif end:
            x = center[0]
            pts = [[x,lo[1],lo[2]],[x,hi[1],lo[2]],[x,hi[1],hi[2]],[x,lo[1],hi[2]],[x,lo[1],lo[2]]]
        else:
            # The roof ridge and eaves serve as a visual reference for the space below the deck.
            for y, z in [(lo[1],lo[2]), (center[1],hi[2]), (hi[1],lo[2])]:
                shapes.append(np.round([[lo[0],y,z],[hi[0],y,z]], 4).tolist())
            continue
        shapes.append(np.round(pts, 4).tolist())
    return json.dumps(shapes, separators=(',', ':'))+'\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = outline()
    if args.check:
        if target.read_text() != data:
            raise SystemExit('Regenerate the road-study donor outline')
    else:
        target.write_text(data)

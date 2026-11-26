"""Fit Earl's longitudinal datums and flat shell in the existing assembly coordinates."""
import json
from pathlib import Path
import struct

import numpy as np

from flat_panels import corners, junctions, plane
from panel_patterns import area, points, value

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'site/assets/models/earl-roof-attachment-study.glb'
SURVEY = ROOT / 'site/survey-results/measurements.json'
ARCHIVE_LAYOUT = ROOT / 'reference/panels/earl-iteration06-layout.json'
INCH = .0254
# Keep the factory glazing in the DJ sightline in its authored position.
GLAZING = [-2.05, -.15]


def donor_datums(doc):
    """Read bumper faces and axle centers in metres along the assembly's x axis."""
    bus = next(n for n in doc['nodes'] if n['name'] == 'DONOR_BUS')
    roots = doc['scenes'][doc.get('scene', 0)]['nodes']
    if not any(doc['nodes'][i] is bus for i in roots) or any(k in bus for k in ('scale','rotation','matrix','translation')):
        raise ValueError('Expected the original donor in assembly coordinates')
    nodes = {doc['nodes'][i]['name']: doc['nodes'][i] for i in bus['children']}
    def span(name):
        node = nodes['Bus__' + name]
        if any(k in node for k in ('scale','rotation','matrix')):
            raise ValueError(f'Unsupported donor datum transform on {name}')
        prim, = doc['meshes'][node['mesh']]['primitives']
        pos = doc['accessors'][prim['attributes']['POSITION']]
        return np.array([pos['min'][0], pos['max'][0]]) + node['translation'][0]
    return np.array([span('Front bumper')[0], span('Front tire 1').mean(),
                     span('Rear tire 1').mean(), span('Rear bumper')[1]])


class LongitudinalFit:
    def __init__(self):
        with SOURCE.open('rb') as source:
            source.seek(12)
            size, = struct.unpack('<I', source.read(4))
            source.seek(20)
            self.original = donor_datums(json.loads(source.read(size)))
        survey = json.loads(SURVEY.read_text())
        if survey['units'] != 'in':
            raise ValueError('Survey inputs must be in inches')
        readings = {m['id']: m for m in survey['measurements']}
        length = readings['EXT-001']['nominal']
        front = readings['EXT-004']['value']
        wheelbase = readings['EXT-002']['value']
        self.target = self.original[1] + INCH * np.array([-front, 0, wheelbase, length-front])
        self.date = survey['survey_date']
        self.shift = self.target - self.original
        self.anchors = np.insert(self.original, 2, GLAZING)
        self.offsets = np.insert(self.shift, 2, [0., 0.])
        if not np.isfinite(self.offsets).all() or np.any(np.diff(self.anchors + self.offsets) <= 0):
            raise ValueError('Survey stations must fit in order around the DJ glazing')

    def displacement(self, x):
        return np.interp(x, self.anchors, self.offsets)


def fit_sheets(parts, fit):
    """Choose the closest longitudinal fit that preserves planes, joints and fixed features.

    A displacement affine over each source sheet preserves its plane. Shared corners
    use one unknown; a corner on a neighbor's edge interpolates the same endpoints.
    No lateral or vertical displacement is inferred from interior survey dimensions.
    """
    xyz, ids, _ = corners(parts)
    size = len(xyz)
    equations, targets, fixed = [], [], {}
    def constrain(indices, weights, target=0.):
        row = np.zeros(size)
        row[indices] = weights
        equations.append(row)
        targets.append(target)

    for pid, panel in parts.items():
        ix = ids[pid]
        old = xyz[ix]
        if len(ix) > 3:
            centered = old - old.mean(axis=0)
            basis = np.linalg.svd(centered, full_matrices=False)[2][:2]
            chart = np.column_stack((np.ones(len(ix)), centered @ basis.T))
            for dependency in np.linalg.qr(chart, mode='complete')[0][:, 3:].T:
                constrain(ix, dependency)
        if panel['region'] == 'Hoof':
            shift = fit.shift[1 if 'front' in panel['name'].lower() else 2]
        elif (panel['region'] != 'Body' or panel['holes_m'] or panel.get('dj_booth')
              or np.max(old[:, 0]) <= GLAZING[1]):
            # Use the front axle as the assembly datum and retain the forward costume.
            shift = 0.
        elif 'rear surround' in panel['name'].lower():
            shift = fit.shift[3]
        else:
            continue
        for i in ix:
            if abs(fixed.setdefault(i, shift) - shift) > 1e-8:
                raise ValueError(f'Conflicting fixed survey features on {pid}')

    for i, a, b, t in junctions(xyz, ids):
        constrain([i, a, b], [1., t-1., -t])
    for i, shift in fixed.items():
        constrain(i, 1., shift)
    desired = fit.displacement(xyz[:, 0])
    desired[xyz[:, 0] <= GLAZING[1]] = 0.
    system = np.asarray(equations)
    shift = desired + np.linalg.lstsq(system, targets - system @ desired, rcond=1e-8)[0]
    if np.max(abs(system @ shift - targets)) > 1e-7:
        raise ValueError('Cannot fit survey datums while preserving seams and openings')

    for pid, panel in parts.items():
        dx = shift[ids[pid]]
        if max(abs(dx)) < 1e-9:
            continue
        installed = np.array(panel['vertices_m'])
        installed[:, 0] += dx
        panel['vertices_m'] = points(installed)
        installed = np.asarray(panel['vertices_m'])
        if np.ptp(dx) < 1e-9:
            for key in ('origin_m', 'vertex_average_m'):
                panel[key][0] = value(panel[key][0] + dx.mean())
            continue
        origin, normal = plane(installed)
        if normal @ panel['normal'] < 0:
            normal *= -1
        prior_u, prior_v = np.asarray([panel['u_axis'], panel['v_axis']])
        u = prior_u - normal * (prior_u @ normal)
        u /= np.linalg.norm(u)
        v = np.cross(normal, u)
        if v @ prior_v < 0:
            v *= -1
        flat = (installed - origin) @ np.stack((u, v)).T
        error = np.max(abs((installed - origin) @ normal))
        if panel['holes_m'] or error > 1e-6:
            raise ValueError(f'Survey fit moved a cutout or bent {pid}')
        panel.update(origin_m=origin.tolist(), vertex_average_m=points([origin])[0],
                     normal=points([normal])[0], u_axis=u.tolist(), v_axis=v.tolist(),
                     tilt_from_horizontal_deg=value(np.degrees(np.arccos(np.clip(abs(normal[2]), 0., 1.)))),
                     flat_vertices_m=points(flat), net_area_m2=value(area(flat)),
                     planarity_error_mm=value(error * 1000))

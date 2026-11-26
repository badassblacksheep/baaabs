"""Apply the measured donor stations and registered sheets to the baked 38-foot assembly."""
import argparse
import copy
import json
from pathlib import Path
import re
import runpy

import numpy as np

from dj_booth import read_accessor
from dj_panel_layout import gltf_coordinates, node_matrix, sheet_sources, transform_points
from survey_fit import ARCHIVE_LAYOUT, ROOT, SURVEY, LongitudinalFit, donor_datums

Model = runpy.run_path(str(ROOT / 'tools/build-animated-eyes.py'))['Model']
MODELS = ROOT / 'site/assets/models'
CURRENT = MODELS / 'earl-survey-fit.glb'
LAYOUT = ROOT / 'site/assets/earl-panel-layout.json'


def fit_panels(model, layout):
    original = {p['id']: p for p in json.loads(ARCHIVE_LAYOUT.read_text())['pieces']}
    active = sheet_sources(model)
    if active.keys() != original.keys() or active.keys() != {p['id'] for p in layout['pieces']}:
        raise ValueError('Source assembly and registered panel IDs differ')
    for sheet in layout['pieces']:
        pid = sheet['id']
        a, b = [gltf_coordinates(p['vertices_m']) for p in (original[pid], sheet)]
        if np.array_equal(a, b):
            continue
        src = active[pid]
        world, prim = src['world'], src['prim']
        old_xyz = transform_points(read_accessor(model, prim['attributes']['POSITION']), world)
        # UV seams can duplicate a corner on a hoof. Match each mesh vertex to its
        # registered corner (including cutouts), so winding and pick IDs survive.
        old_outline = np.vstack([a, *map(gltf_coordinates, original[pid]['holes_m'])])
        new_outline = np.vstack([b, *map(gltf_coordinates, sheet['holes_m'])])
        distances = np.linalg.norm(old_xyz[:,None] - old_outline[None,:], axis=2)
        if max(distances.min(axis=1).max(), distances.min(axis=0).max()) > 2e-6:
            raise ValueError(f'{pid} does not match the source outline')
        mesh_xyz = old_xyz + (new_outline-old_outline)[distances.argmin(axis=1)]
        local = transform_points(mesh_xyz, np.linalg.inv(world))
        prim['attributes']['POSITION'] = model.accessor(local.tolist(), 3)
        tris = read_accessor(model, prim['indices']).reshape(-1, 3)
        normals = np.cross(local[tris[:,1]] - local[tris[:,0]], local[tris[:,2]] - local[tris[:,0]])
        direction = normals[np.argmax(np.linalg.norm(normals, axis=1))]
        direction /= np.linalg.norm(direction)
        old_normal = read_accessor(model, prim['attributes']['NORMAL'])
        normals = np.where((old_normal @ direction)[:,None] < 0., -direction, direction)
        prim['attributes']['NORMAL'] = model.accessor(normals.tolist(), 3)
        triangles = mesh_xyz[tris]
        area = np.linalg.norm(np.cross(triangles[:,1]-triangles[:,0], triangles[:,2]-triangles[:,0]), axis=1).sum()/2
        model.doc['nodes'][src['node']]['extras']['net_area_m2'] = float(area)


def fit_donor(model, fit):
    bus = next(n for n in model.doc['nodes'] if n['name'] == 'DONOR_BUS')
    if not np.allclose(donor_datums(model.doc), fit.original, atol=1e-6, rtol=0):
        raise ValueError('Expected the pre-survey bumper and wheel datums')
    for index in bus['children']:
        node = model.doc['nodes'][index]
        name = node['name']
        if re.match(r'Bus__Front (?:tire|wheelhouse)', name):
            rigid_shift = fit.shift[1]
        elif re.match(r'Bus__Rear (?:tire|inner|wheelhouse)', name):
            rigid_shift = fit.shift[2]
        elif re.match(r'Bus__(?:Front (?:bumper|fascia)|Mirror)', name):
            rigid_shift = fit.shift[0]
        elif re.match(r'Bus__Rear (?:bumper|fascia)', name):
            rigid_shift = fit.shift[3]
        else:
            rigid_shift = None
        if rigid_shift is not None:
            node['translation'][0] += float(rigid_shift)
            continue
        # Donor skin primitives can share mesh and accessor data. Retain the UVs,
        # transform each instance independently, and carry normals through dx'/dx.
        world = node_matrix(node)
        if not np.allclose(world[:3,:3], np.eye(3)):
            raise ValueError(f'Unsupported donor skin transform on {name}')
        mesh = copy.deepcopy(model.doc['meshes'][node['mesh']])
        node['mesh'] = len(model.doc['meshes'])
        model.doc['meshes'].append(mesh)
        slopes = np.diff(fit.offsets) / np.diff(fit.anchors)
        for prim in mesh['primitives']:
            attrs = prim['attributes']
            local = read_accessor(model, attrs['POSITION']).astype(float)
            x = local[:,0] + world[0,3]
            local[:,0] += fit.displacement(x)
            attrs['POSITION'] = model.accessor(local.tolist(), 3)
            normals = read_accessor(model, attrs['NORMAL']).astype(float)
            derivative = 1 + np.r_[0., slopes, 0.][np.searchsorted(fit.anchors, x)]
            normals[:,0] /= derivative
            normals /= np.linalg.norm(normals, axis=1)[:,None]
            attrs['NORMAL'] = model.accessor(normals.tolist(), 3)
    if not np.allclose(donor_datums(model.doc), fit.target, atol=1e-6, rtol=0):
        raise ValueError('Baked donor does not reproduce the survey stations')


def apply_survey(model):
    fit = LongitudinalFit()
    fit_panels(model, json.loads(LAYOUT.read_text()))
    fit_donor(model, fit)
    survey = json.loads(SURVEY.read_text())
    extras = model.doc['scenes'][model.doc.get('scene', 0)]['extras']
    extras.update(survey_date=fit.date, survey_source='survey-results/measurements.json',
                  fit_revision='Longitudinal survey fit. Fixed front axle; original 38 ft concept deck.',
                  survey_field_readings=survey['measurements'], survey_inferences=survey['inferences'],
                  survey_unmeasured=survey['unmeasured'], survey_release=survey['release'],
                  survey_stations_world_x_m=fit.target.tolist())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path, nargs='?', default=CURRENT)
    args = parser.parse_args()
    model = Model(args.source)
    apply_survey(model)
    model.save(args.destination)

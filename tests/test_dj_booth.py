"""Projection, panel accounting and closed-window visibility regressions."""
import csv
import json
import pathlib
from collections import defaultdict
import runpy
import sys
import unittest

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from dj_booth import APERTURE, CENTER_X, PANEL_IDS, apply_dj_booth, panel_loops, read_accessor, signed_area
from dj_panel_layout import gltf_coordinates, sheet_sources, transform_points
from glb_bounds import transform

Model = runpy.run_path(str(ROOT/'tools/build-animated-eyes.py'))['Model']


def polygon_area(loop):
    return np.linalg.norm(np.cross(loop,np.roll(loop,-1,axis=0)).sum(axis=0))/2


class BoothTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = Model(ROOT/'site/assets/models/earl-roof-attachment-study.glb')
        cls.original = {}
        for n in cls.model.doc['nodes']:
            pid = n.get('extras', {}).get('panel_id')
            if pid in PANEL_IDS:
                p = cls.model.doc['meshes'][n['mesh']]['primitives'][0]
                positions = read_accessor(cls.model, p['attributes']['POSITION'])[:, [0, 2, 1]]
                positions[:, 1] *= -1
                cls.original[pid] = positions.astype(float)
        apply_dj_booth(cls.model)
        cls.doc = cls.model.doc

    def test_all_live_sheet_records_describe_the_same_provisional_stock(self):
        for node in self.doc['nodes']:
            if not node.get('extras', {}).get('panel_id'):
                continue
            mesh = self.doc['meshes'][node['mesh']]
            materials = [self.doc['materials'][p['material']] for p in mesh['primitives']]
            for prim, material in zip(mesh['primitives'],materials):
                for tex in (material['pbrMetallicRoughness'].get('baseColorTexture'),material.get('normalTexture')):
                    if tex is None:
                        continue
                    uv = read_accessor(self.model,prim['attributes']['TEXCOORD_'+str(tex.get('texCoord',0))])
                    self.assertTrue(np.isfinite(uv).all(),node['name'])
            for record in [node, mesh, *materials]:
                e = record['extras']
                self.assertEqual(e['material'], 'Provisional McNICHOLS perforated mild steel')
                self.assertEqual(e['gauge'], 20)
                self.assertAlmostEqual(e['thickness_inches'], .0359)
                self.assertAlmostEqual(e['sheet_thickness_m'], .00091186)
                self.assertAlmostEqual(e['perforation_open_area_nominal'], .40)
                self.assertIn('illustrative', e['visual_approximation'])

    def test_original_aperture_area_is_preserved(self):
        layout = json.loads((ROOT/'site/assets/earl-panel-layout.json').read_text())
        old = sum(abs(signed_area(self.original[pid][:, [0,2]])) for pid in PANEL_IDS)
        remaining = sum(abs(signed_area(np.asarray(face['vertices_m'])[:, [0,2]]))
                        for p in layout['pieces'] for face in p['faces'] if face['source'] in PANEL_IDS)
        self.assertAlmostEqual(old-remaining, abs(signed_area(APERTURE)), places=5)

    def test_each_register_entry_is_one_connected_pickable_sheet(self):
        layout = json.loads((ROOT/'site/assets/earl-panel-layout.json').read_text())
        pieces = {p['id']:p for p in layout['pieces']}
        with (ROOT/'site/assets/earl-symmetric-panel-register.csv').open(newline='') as f:
            original = {r['Panel ID']:json.loads(r['Vertices (world meters)']) for r in csv.DictReader(f)}
        sources = sheet_sources(self.model)
        self.assertEqual(set(sources), set(pieces))
        self.assertEqual(len(sources), 206)
        covered = defaultdict(float)
        reference = json.loads((ROOT/'reference/panels/earl-before-dj.json').read_text())
        reference_holes = {p['id']:p['holes_m'] for p in reference['panels']}
        for pid, source in sources.items():
            n = self.doc['nodes'][source['node']]
            self.assertEqual(n['extras']['panel_id'], pid)
            prim = source['prim']
            coords = transform_points(read_accessor(self.model, prim['attributes']['POSITION']), source['world'])
            edges = defaultdict(set)
            triangles = read_accessor(self.model, prim['indices']).reshape(-1, 3)
            for i, tri in enumerate(triangles):
                # New sheets use a literally welded index edge through every
                # fold. Older GLB sheets can split vertices for UV/normal seams.
                points = tri if n['extras'].get('sheet_layout_revision') else [
                    tuple(v) for v in np.round(coords[tri],5)]
                points = list(points)
                for p, q in zip(points,points[1:]+points[:1]):
                    edges[tuple(sorted((p,q)))].add(i)
            links = defaultdict(set)
            for group in edges.values():
                for i in group:
                    links[i].update(group)
            reached = set()
            todo = {0}
            while todo:
                i = todo.pop()
                reached.add(i)
                todo.update(links[i]-reached)
            self.assertEqual(len(reached), len(triangles), pid+' has detached pieces')
            if n['extras'].get('sheet_layout_revision'):
                areas = 0
                for f in pieces[pid]['faces']:
                    loop = np.asarray(f.get('vertices_m',original[f['source']]))
                    area = polygon_area(loop) - sum(polygon_area(h) for h in f.get('holes_m',[]))
                    areas += area
                    covered[f['source']] += area
                self.assertAlmostEqual(n['extras']['net_area_m2'], areas, delta=.002, msg=pid)
        for pid, area in covered.items():
            loops = panel_loops(original[pid]) if pid in PANEL_IDS else [original[pid]]
            expected = sum(polygon_area(loop) for loop in loops) - sum(polygon_area(h) for h in reference_holes[pid])
            self.assertAlmostEqual(expected, area, delta=.0003, msg=pid+' lost or gained skin area')

    def test_revised_orbital_sheets_have_both_original_eye_holes(self):
        # Each existing rim segment must be an actual exposed mesh edge, even
        # when the exterior perimeter and the panel ID allocation change.
        survey = json.loads((ROOT/'reference/panels/earl-before-dj.json').read_text())
        sources = sheet_sources(self.model)
        orbital = [p for p in survey['panels'] if p['region'] == 'Face' and p['holes_m']]
        self.assertEqual({p['id'] for p in orbital},{'F-P-007','F-D-007'})
        for original in orbital:
            original_id = original['id']
            hole, = original['holes_m']
            expected = gltf_coordinates(hole)
            found = False
            for pid,source in sources.items():
                obj = self.doc['nodes'][source['node']]
                if original_id not in obj.get('extras',{}).get('source_panels',[]):
                    continue
                prim = source['prim']
                vertices = transform_points(read_accessor(self.model,prim['attributes']['POSITION']),source['world'])
                near = np.linalg.norm(expected[:,None,:]-vertices[None,:,:],axis=2)
                if np.any(near.min(axis=1) > .00002):
                    continue
                ring = near.argmin(axis=1)
                triangles = read_accessor(self.model,prim['indices']).reshape(-1,3)
                counts = defaultdict(int)
                for tri in triangles:
                    for a,b in zip(tri,np.roll(tri,-1)):
                        counts[tuple(sorted((a,b)))] += 1
                for a,b in zip(ring,np.roll(ring,-1)):
                    self.assertEqual(counts[tuple(sorted((a,b)))],1,pid+' has a closed or broken eye aperture')
                found = True
            self.assertTrue(found,original_id+' missing its original interior cutout')

    def test_inside_to_crowd_rays(self):
        # Reconstruct every scene transform, then intersect transverse rays with
        # actual indexed triangles over the full depth from the DJ to the crowd.
        points = [(CENTER_X, 2.43), (CENTER_X, 2.10), (-1.36, 2.43), (CENTER_X, 2.26)]
        hits = {p: set() for p in points}
        def visit(i, parents):
            n = self.doc['nodes'][i]
            chain = [n] + parents
            for j in n.get('children', []):
                visit(j, chain)
            if 'mesh' not in n:
                return
            for p in self.doc['meshes'][n['mesh']]['primitives']:
                material = self.doc['materials'][p['material']]['name']
                vertices = read_accessor(self.model, p['attributes']['POSITION']).astype(float)
                for node in chain:
                    if any(k in node for k in ('matrix','scale','rotation','translation')):
                        vertices = np.asarray([transform(v,node) for v in vertices])
                low, high = vertices.min(axis=0), vertices.max(axis=0)
                if low[2] > 4 or high[2] < .72:
                    continue
                indices = read_accessor(self.model, p['indices']).reshape(-1, 3)
                for target in points:
                    if np.any(np.asarray(target) < low[:2]) or np.any(np.asarray(target) > high[:2]):
                        continue
                    for a, b, c in vertices[indices]:
                        mat = np.stack((b[:2]-a[:2], c[:2]-a[:2]), axis=1)
                        if abs(np.linalg.det(mat)) < 1.e-10:
                            continue
                        u, v = np.linalg.solve(mat, np.asarray(target)-a[:2])
                        depth = a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])
                        if min(u,v,1-u-v) >= -1.e-7 and .72 < depth < 4.:
                            hits[target].add(material)
        for root in self.doc['scenes'][self.doc.get('scene',0)]['nodes']:
            visit(root, [])
        glazing = 'Workshop_bus_DJ_Glazing'
        for target in points[:2]:
            self.assertEqual(hits[target], {glazing}, target)
        for target in points[2:]:
            self.assertTrue(hits[target], target)
            self.assertNotIn(glazing, hits[target], target)
            self.assertTrue(all(m.startswith('Workshop_bus_') for m in hits[target]), target)
        glass = next(m for m in self.doc['materials'] if m['name'] == glazing)
        self.assertEqual(glass['alphaMode'], 'BLEND')
        self.assertLess(glass['pbrMetallicRoughness']['baseColorFactor'][3], .2)

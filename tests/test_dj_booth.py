"""Projection, panel accounting and closed-window visibility regressions."""
import json
import gzip
import struct
import pathlib
from collections import Counter, defaultdict
import runpy
import sys
import unittest

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from dj_booth import APERTURE, CENTER_X, PANEL_IDS, apply_dj_booth, cross2, difference, edges as polygon_edges, panel_loops, read_accessor, signed_area
from dj_panel_layout import gltf_coordinates, sheet_sources, transform_points
from glb_bounds import transform

Model = runpy.run_path(str(ROOT/'tools/build-animated-eyes.py'))['Model']


def polygon_area(loop):
    return np.linalg.norm(np.cross(loop,np.roll(loop,-1,axis=0)).sum(axis=0))/2


class BoothTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = Model(ROOT/'site/assets/models/earl-roof-attachment-study.glb')
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

    def test_projected_dj_aperture_is_open_and_bounded_by_all_six_edges(self):
        # Check the actual installed skin. Every millimetre of each of the six
        # old rim segments meets a sheet, and no triangle covers any of the port.
        survey = json.loads((ROOT/'reference/panels/earl-before-dj.json').read_text())
        rim = [[] for _ in APERTURE]
        for old in (p for p in survey['panels'] if p['id'] in PANEL_IDS):
            for loop in panel_loops(old['vertices_m']):
                for p,q in polygon_edges(gltf_coordinates(loop)):
                    for k,(a,b) in enumerate(polygon_edges(APERTURE)):
                        edge = b-a
                        if max(abs(cross2(edge,p[:2]-a)),abs(cross2(edge,q[:2]-a)))>1e-8:
                            continue
                        ends = sorted([(((v[:2]-a)@edge)/(edge@edge),v[2]) for v in (p,q)])
                        rim[k].append(np.array(ends))
        covered = [[] for _ in APERTURE]
        for pid,source in sheet_sources(self.model).items():
            prim = source['prim']
            vertices = transform_points(read_accessor(self.model,prim['attributes']['POSITION']),source['world'])
            if np.max(vertices[:,2]) < .72:
                continue
            for indices in read_accessor(self.model,prim['indices']).reshape(-1,3):
                tri = vertices[indices,:2]
                if np.any(tri.min(axis=0)>APERTURE.max(axis=0)) or np.any(tri.max(axis=0)<APERTURE.min(axis=0)):
                    continue
                _, interior = difference(tri,APERTURE)
                if interior is not None:
                    self.assertLess(abs(signed_area(interior)),3e-7,pid+' covers part of the DJ port')
                for k,(a,b) in enumerate(polygon_edges(APERTURE)):
                    edge = b-a
                    for p,q in polygon_edges(vertices[indices]):
                        if max(abs(cross2(edge,p[:2]-a)),abs(cross2(edge,q[:2]-a)))/np.linalg.norm(edge)>2e-6:
                            continue
                        ends = np.array(sorted([(((v[:2]-a)@edge)/(edge@edge),v[2]) for v in (p,q)]))
                        lo,hi = max(0.,ends[0,0]),min(1.,ends[1,0])
                        if hi<=lo:
                            continue
                        covered[k].append((lo,hi))
                        for original in rim[k]:
                            samples = [max(lo,original[0,0]),min(hi,original[1,0])]
                            if samples[1] <= samples[0]+1e-7:
                                continue
                            depth = np.interp(samples,ends[:,0],ends[:,1])
                            ref = np.interp(samples,original[:,0],original[:,1])
                            self.assertLess(max(abs(depth-ref)),3e-6,pid+' moved off the physical rim')
        for k,parts in enumerate(covered):
            last = 0.
            for lo,hi in sorted(parts):
                self.assertLessEqual(lo,last+5e-6,f'unframed DJ edge {k}')
                last = max(last,hi)
            self.assertGreater(last,1-5e-6,f'unframed DJ edge {k}')

    def test_each_register_entry_is_one_connected_pickable_sheet(self):
        layout = json.loads((ROOT/'site/assets/earl-panel-layout.json').read_text())
        pieces = {p['id']:p for p in layout['pieces']}
        sources = sheet_sources(self.model)
        self.assertEqual(set(sources), set(pieces))
        self.assertEqual(len(sources),layout['panel_count'])
        self.assertEqual(self.doc['scenes'][self.doc.get('scene',0)]['extras']['panel_count'],len(sources))
        for pid, source in sources.items():
            n = self.doc['nodes'][source['node']]
            self.assertEqual(n['extras']['panel_id'], pid)
            prim = source['prim']
            coords = transform_points(read_accessor(self.model, prim['attributes']['POSITION']), source['world'])
            edges = defaultdict(set)
            triangles = read_accessor(self.model, prim['indices']).reshape(-1, 3)
            for i, tri in enumerate(triangles):
                # The six original hoof meshes may split vertices at UV seams.
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
            # Check the actual serialized glTF mesh against the registered face.
            piece = pieces[pid]
            outer = gltf_coordinates(piece['vertices_m'])
            holes = [gltf_coordinates(hole) for hole in piece['holes_m']]
            expected = np.vstack([outer,*holes])
            distances = np.linalg.norm(coords[:,None,:]-expected[None,:,:],axis=2)
            self.assertLess(distances.min(axis=0).max(),2e-6,pid+' outline or cutout drifted')
            self.assertLess(distances.min(axis=1).max(),2e-6,pid+' has unregistered geometry')
            plane = np.linalg.svd(coords-coords.mean(axis=0))[2][-1]
            self.assertLess(np.max(abs((coords-coords.mean(axis=0)) @ plane)),2e-6,pid+' is bent')
            actual_area = sum(polygon_area(coords[tri]) for tri in triangles)
            expected_area = polygon_area(outer)-sum(polygon_area(hole) for hole in holes)
            self.assertAlmostEqual(actual_area,expected_area,delta=3e-6,msg=pid)

    def test_homepage_contains_exactly_the_registered_sheet_triangles(self):
        # The homepage carries no picking IDs. Compare its actual triangles
        # with the detailed model, including multiplicity, at its mm resolution.
        def triangle_key(pts):
            return tuple(sorted(tuple(v) for v in pts))
        expected = Counter()
        for source in sheet_sources(self.model).values():
            prim = source['prim']
            pos = transform_points(read_accessor(self.model,prim['attributes']['POSITION']),source['world'])
            pts = np.rint(pos*1000).astype(int)
            for tri in read_accessor(self.model,prim['indices']).reshape(-1,3):
                a,b,c = pos[tri]
                if np.linalg.norm(np.cross(b-a,c-a))>1e-8:
                    expected[triangle_key(pts[tri])] += 1
        actual = Counter()
        for group in ('shell','details'):
            raw = gzip.decompress((ROOT/f'site/assets/home-model/{group}.mesh').read_bytes())
            offset = 0
            while offset < len(raw):
                count, size = struct.unpack_from('<II',raw,offset)
                offset += 8
                xyz = np.ndarray((count,3),dtype='<i2',buffer=raw,offset=offset,strides=(14,2))
                mode = np.ndarray((count,),dtype='u1',buffer=raw,offset=offset+9,strides=(14,))
                offset += count*14
                indices = np.frombuffer(raw,dtype='<u2',count=size,offset=offset).reshape(-1,3)
                offset += size*2
                for tri in indices[np.all(mode[indices]==5,axis=1)]:
                    actual[triangle_key(xyz[tri])] += 1
        self.assertEqual(actual,expected)

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

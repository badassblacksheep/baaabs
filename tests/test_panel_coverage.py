"""Check the revised seams tile each original facet exactly once around the DJ window."""
from collections import defaultdict
import json
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from dj_booth import APERTURE, PANEL_IDS, panel_loops


def segments(loop):
    return list(zip(loop, np.roll(loop, -1, axis=0)))


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def critical_x(outlines):
    """Between two consecutive events the ordering of all edges is constant."""
    edges = [edge for loop in outlines for edge in segments(loop)]
    events = {float(p[0]) for p, _ in edges}
    for i, (a, b) in enumerate(edges):
        for c, d in edges[i + 1:]:
            ab, cd = b - a, d - c
            denominator = cross(ab, cd)
            if abs(denominator) < 1e-12:
                continue
            along_ab = cross(c - a, cd) / denominator
            along_cd = cross(c - a, ab) / denominator
            if 0 < along_ab < 1 and 0 < along_cd < 1:
                events.add(float(a[0] + along_ab * ab[0]))
    return sorted(events)


def section_events(loops, x, sign):
    """Return signed changes in sheet count along the vertical section."""
    events = []
    for loop in loops:
        hits = sorted(a[1] + (x-a[0]) * (b[1]-a[1]) / (b[0]-a[0])
                      for a, b in segments(loop) if min(a[0], b[0]) < x < max(a[0], b[0]))
        assert len(hits) % 2 == 0
        for low, high in zip(hits[::2], hits[1::2]):
            events.extend([(low, sign), (high, -sign)])
    return events


class PanelCoverageTests(unittest.TestCase):
    def test_largest_mirrored_pairs_are_bisected_before_smaller_pairs(self):
        from paired_sheet_splits import matched_pairs
        before=json.loads((ROOT/'site/structural/modular-07/panel-layout.json').read_text())
        after=json.loads((ROOT/'site/assets/earl-panel-layout.json').read_text())
        def area3(loop):
            v=np.asarray(loop)
            return np.linalg.norm(np.cross(v,np.roll(v,-1,axis=0)).sum(axis=0))/2
        originals={p['id']:dict(p,side={'D':'Driver','P':'Passenger'}.get(p['id'].split('-')[1],'Center'),
                                region=p['id'].split('-')[0] if not p['id'].startswith('K-') else 'Hoof')
                   for p in before['pieces']}
        pairs=matched_pairs(originals,set(after['omitted']))
        sizes={k:area3(p['vertices_m'])-sum(area3(h) for h in p['holes_m']) for k,p in originals.items()}
        installed={p['id']:p for p in after['pieces']}
        for step in after['paired_splits']:
            parents=tuple(step['parents'])
            winner=max(sum(sizes[k] for k in pair) for pair in pairs)
            self.assertAlmostEqual(sum(sizes[k] for k in parents),winner,places=6)
            self.assertIn(parents,pairs)
            for k,new in zip(parents,step['added'],strict=True):
                sizes[k]=sizes[new]=sizes[k]/2
                self.assertAlmostEqual(area3(installed[new]['vertices_m']),sizes[new],places=6)
                self.assertAlmostEqual(area3(installed[k]['vertices_m']),sizes[k],places=6)
            pairs.append(tuple(step['added']))
        self.assertEqual(after['panel_count'],206)

    def test_window_and_original_facet_coverage(self):
        source = json.loads((ROOT / 'reference/panels/earl-before-dj.json').read_text())
        baseline = {p['id']: p for p in source['panels']}
        layout = json.loads((ROOT / 'site/assets/earl-panel-layout.json').read_text())
        actual = defaultdict(list)
        for panel in layout['pieces']:
            for face in panel['faces']:
                pid = face['source']
                actual[pid].append(face.get('vertices_m', baseline[pid]['vertices_m']))
        omitted = set(layout['omitted'])
        self.assertTrue(all(' Crown ' in baseline[pid]['name'] for pid in omitted))
        self.assertEqual(set(actual), set(baseline) - omitted)
        for pid in actual:
            original = baseline[pid]
            with self.subTest(source=pid):
                vertices = original['vertices_m']
                target = panel_loops(vertices) if pid in PANEL_IDS else [vertices]
                axes = np.array([original['u_axis'], original['v_axis']])
                expected, plotted = [[np.array(loop) @ axes.T for loop in group]
                                     for group in (target, actual[pid])]
                cuts = critical_x(expected + plotted)
                for left, right in zip(cuts, cuts[1:]):
                    if right - left < 2e-6:
                        continue
                    x = (left + right) / 2
                    events = sorted(section_events(expected, x, -1) +
                                    section_events(plotted, x, 1))
                    excess = 0
                    for (y, change), (next_y, _) in zip(events, events[1:]):
                        excess += change
                        if next_y - y > 2e-5:
                            self.assertEqual(excess, 0, f'{pid}: gap/overlap at ({x}, {y})')

    def test_installed_skin_tiles_the_window_surround(self):
        layout = json.loads((ROOT / 'site/assets/earl-panel-layout.json').read_text())
        panels = {p['id']: np.asarray(p['vertices_m'])[:, [0, 2]]
                  for p in layout['pieces'] if p['id'].startswith('B-D-')}
        # Count intersections through the installed shell on every open interval
        # in the elevation. A section must cross one sheet outside the opening
        # and zero inside, including along the former tapered strip.
        left, right, sill, top = -2.05, -.17, 1.89, 2.78
        loops = [v for v in panels.values() if
                 v[:, 0].min() < right and v[:, 0].max() > left and
                 v[:, 1].min() < top and v[:, 1].max() > sill]
        box = np.array([[left, sill], [right, sill], [right, top], [left, top]])
        cuts = critical_x([*loops, APERTURE, box])
        for lo, hi in zip(cuts, cuts[1:]):
            x = (lo + hi) / 2
            if hi - lo < 2e-6 or not left < x < right:
                continue
            events = sorted(section_events([*loops, APERTURE], x, 1) + [(sill, 0), (top, 0)])
            count = 0
            for (a, delta), (b, _) in zip(events, events[1:]):
                count += delta
                if b - a > 2e-5 and sill < (a + b) / 2 < top:
                    self.assertEqual(count, 1, f'gap or overlap at x={x}, z={(a + b) / 2}')

        header = panels['B-D-074']
        self.assertEqual(len(header), 3)
        base = header[np.argsort(header[:, 1])[:2]]
        np.testing.assert_allclose(base[np.argsort(base[:, 0])],
                                   [[-1.55, 2.55], [-.67, 2.55]], atol=1e-6)
        np.testing.assert_allclose(header[np.argmax(header[:, 1])],
                                   [-1.11, 2.84333333], atol=1e-6)
        self.assertNotIn('B-D-085', panels)

    def test_former_bends_are_physical_boundaries(self):
        before = json.loads((ROOT / 'reference/panels/earl-former-bends.json').read_text())
        layout = json.loads((ROOT / 'site/assets/earl-panel-layout.json').read_text())
        self.assertEqual(len(before), 32)
        # The new header and flanks replace three historic creases with new
        # unbent triangles. Their actual installed coverage is checked above.
        replaced = {'B-D-074', 'B-D-085', 'B-D-086'}
        retained = [row for row in before if row['old_panel'] not in replaced]
        former_creases = {frozenset(row['sources']) for row in retained}
        for panel in layout['pieces']:
            sources = {face['source'] for face in panel['faces']}
            for crease in former_creases:
                self.assertFalse(crease <= sources, f"{panel['id']} spans the former bend {crease}")

        archived = json.loads((ROOT / 'reference/panels/earl-iteration06-layout.json').read_text())
        def contours(plan, source):
            return {p['id']: np.asarray(p['vertices_m']) for p in plan['pieces']
                    if any(f['source'] == source for f in p['faces'])}

        before_splits = json.loads((ROOT / 'site/structural/modular-07/panel-layout.json').read_text())
        lineage = {}
        for step in layout['paired_splits']:
            for parent,child in zip(step['parents'], step['added'], strict=True):
                lineage[child] = lineage.get(parent,parent)

        for bend in retained:
            start, end = np.array(bend['edge_m'])
            if bend['old_panel'] == 'B-D-033':
                header = next(p for p in archived['pieces'] if p['id'] == 'B-D-074')
                start = max(header['vertices_m'], key=lambda v: v[2])
            tracks = []
            for pid in bend['sources']:
                old = contours(archived, pid)
                # The field fit moves corners; a subsequent saw cut inserts new ones.
                current = contours(before_splits, pid)
                active = [np.asarray(p['vertices_m']) for p in layout['pieces']
                          if lineage.get(p['id'],p['id']) in old]
                active_edges = np.vstack([np.stack([v,np.roll(v,-1,axis=0)],axis=1) for v in active])
                active_dir = active_edges[:,1]-active_edges[:,0]
                # Follow the same material point along each side of the old seam.
                def edges(polygons):
                    return np.vstack([np.stack([polygons[k], np.roll(polygons[k], -1, axis=0)], axis=1)
                                      for k in old])
                original, fitted = edges(old), edges(current)
                direction = original[:,1] - original[:,0]
                squared = (direction**2).sum(axis=1)
                track = []
                for location in np.linspace(start, end, 51):
                    fraction = np.clip(((location-original[:,0])*direction).sum(axis=1)/squared, 0, 1)
                    gap = np.linalg.norm(original[:,0] + fraction[:,None]*direction-location, axis=1)
                    edge = np.argmin(gap)
                    self.assertLess(gap[edge], .001, pid)
                    point = fitted[edge,0] + fraction[edge]*(fitted[edge,1]-fitted[edge,0])
                    t = np.clip(((point-active_edges[:,0])*active_dir).sum(axis=1)/(active_dir**2).sum(axis=1),0,1)
                    nearest = np.linalg.norm(active_edges[:,0]+t[:,None]*active_dir-point,axis=1).min()
                    self.assertLess(nearest,.001,pid)
                    track.append(point)
                tracks.append(np.array(track))
            self.assertLess(np.linalg.norm(tracks[0]-tracks[1], axis=1).max(), .001, bend['old_panel'])

    def test_three_original_cutouts_stay_inside_single_panels(self):
        source = json.loads((ROOT / 'reference/panels/earl-before-dj.json').read_text())
        html = (ROOT / 'site/the_build.html').read_text()
        register, _ = json.JSONDecoder().raw_decode(html.split('const DATA=', 1)[1])
        expected = [np.asarray(h) for p in source['panels'] for h in p['holes_m']]
        self.assertEqual(len(expected), 3)
        matches = []
        for panel in register['panels']:
            for hole, flat_hole in zip(panel['holes_m'], panel['flat_holes_m'], strict=True):
                h = np.asarray(hole)
                centers = [np.linalg.norm(h.mean(axis=0) - old.mean(axis=0)) for old in expected]
                index = int(np.argmin(centers))
                matches.append(index)
                old = expected[index]
                self.assertEqual(len(h), len(old))
                distances = np.linalg.norm(h[:, None, :] - old[None, :, :], axis=2)
                self.assertLess(np.max(np.min(distances, axis=0)), 1e-6, panel['id'])
                outer = np.asarray(panel['flat_vertices_m'])
                for a, b in segments(outer):
                    inside = cross(b - a, outer.mean(axis=0) - a)
                    self.assertTrue(all(inside * cross(b - a, pt - a) >= -1e-8
                                        for pt in np.asarray(flat_hole)), panel['id'])
        self.assertEqual(sorted(matches), list(range(len(expected))))

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
    def test_window_and_original_facet_coverage(self):
        source = json.loads((ROOT / 'reference/panels/earl-before-dj.json').read_text())
        baseline = {p['id']: p for p in source['panels']}
        layout = json.loads((ROOT / 'site/assets/earl-panel-layout.json').read_text())
        actual = defaultdict(list)
        for panel in layout['pieces']:
            for face in panel['faces']:
                pid = face['source']
                actual[pid].append(face.get('vertices_m', baseline[pid]['vertices_m']))
        self.assertEqual(layout['omitted'], [])
        self.assertEqual(set(actual), set(baseline))
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

        by_id = {p['id']: p for p in layout['pieces']}
        for bend in retained:
            start, end = np.array(bend['edge_m'])
            if bend['old_panel'] == 'B-D-033':
                # Both panels still end on this shared seam. Its lower corner
                # is the newly centered apex of the one-piece window header.
                header = np.asarray(by_id['B-D-074']['vertices_m'])
                start = header[np.argmax(header[:, 2])]
            for pid in bend['sources']:
                perimeters = [np.asarray(p['vertices_m']) for p in layout['pieces']
                              if any(f['source'] == pid for f in p['faces'])]
                edges = np.vstack([np.stack([v, np.roll(v, -1, axis=0)], axis=1)
                                   for v in perimeters])
                origin = edges[:, 0]
                direction = edges[:, 1] - origin
                length_squared = (direction ** 2).sum(axis=1)
                # Both retained sides have a physical perimeter along the old crease.
                # Allow a millimetre for local adjustment to shared corner positions.
                for location in np.linspace(start, end, 51):
                    fraction = np.clip(((location - origin) * direction).sum(axis=1) /
                                       length_squared, 0, 1)
                    nearest = origin + fraction[:, None] * direction
                    gap = np.linalg.norm(nearest - location, axis=1).min()
                    self.assertLess(gap, .001, f"{bend['old_panel']} lost its seam on {pid}")

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

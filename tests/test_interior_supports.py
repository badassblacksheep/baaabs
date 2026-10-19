import importlib.util
import json
import unittest
from pathlib import Path
from test_frame_comparison import Page
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('interior',ROOT/'tools/build-interior-support-study.py')
model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)

class InteriorChecks(unittest.TestCase):
    def test_data_is_reproducible(self):
        self.assertEqual(model.build(),json.loads((ROOT/'site/assets/interior-support-study.json').read_text()))
    def test_load_conservation_and_layout(self):
        d=model.build()
        self.assertEqual([l['post_count'] for l in d['layouts']],[3,4,12])
        self.assertAlmostEqual(d['geometry']['nominal_roof_to_deck_surface_in'],.2/.0254)
        for l in d['layouts']:
            self.assertAlmostEqual(sum(l['tributary_fractions']),1)
            self.assertAlmostEqual(sum(l['uniform_static_load_per_post_lb'])*l['posts_per_station'],13000)
            self.assertTrue(all(o>=0 for o in l['end_overhangs_m']))
            self.assertEqual(sorted(l['x_m']),l['x_m'])
        self.assertAlmostEqual(d['layouts'][0]['max_span_m'],5.15)
        self.assertAlmostEqual(d['layouts'][1]['max_span_m'],3.9)
        self.assertGreater(d['layouts'][0]['peak_uniform_static_load_per_post_lb'],d['layouts'][1]['peak_uniform_static_load_per_post_lb'])
    def test_links_and_discovery(self):
        p=Page();p.feed((ROOT/'site/interior-supports.html').read_text())
        self.assertEqual(len(p.ids),len(set(p.ids)))
        for ref in p.links:
            if ref.startswith('https:'):continue
            if ref.startswith('#'):self.assertIn(ref[1:],p.ids)
            else:self.assertTrue((ROOT/'site'/ref).exists(),ref)
        self.assertIn('href="interior-supports.html"',(ROOT/'site/frame-comparison.html').read_text())
        brief=json.loads((ROOT/'site/assets/frame-design-brief.json').read_text())
        self.assertEqual(brief['requirements']['road_width_maximum_in'],102)
        self.assertEqual(brief['requirements']['maximum_event_speed_mph'],5)
        self.assertEqual(brief['interior_investigation']['page'],'interior-supports.html')

if __name__=='__main__':unittest.main()

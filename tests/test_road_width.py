import importlib.util, json, re, subprocess, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
spec=importlib.util.spec_from_file_location('road_width',ROOT/'tools/check-road-width.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

def part(lo,hi):return {'min':[0,lo,0],'max':[0,hi,1]}

class RoadWidth(unittest.TestCase):
    def test_exact_limit_and_overage(self):
        limit=102*.0254
        self.assertEqual(audit.assess([part(-limit/2,limit/2)],limit,True)['status'],'PASS')
        self.assertEqual(audit.assess([part(-limit/2,limit/2+.0001)],limit,True)['status'],'FAIL')
    def test_retained_hardware_and_asymmetric_envelope(self):
        limit=102*.0254
        self.assertEqual(audit.assess([part(-1.25,1.25)],limit,True)['status'],'PASS')
        self.assertEqual(audit.assess([part(-1.25,1.25),part(1.25,1.35)],limit,True)['status'],'FAIL')
    def test_missing_inventory_is_never_a_pass(self):
        self.assertEqual(audit.assess([part(-1.2,1.2)],102*.0254,False)['status'],'INCOMPLETE')
        with self.assertRaises(ValueError):audit.assess([],102*.0254,False)
    def test_current_study_is_honestly_rejected(self):
        r=audit.report()
        self.assertFalse(r['road_width_accepted'])
        self.assertEqual(r['stations_only']['status'],'FAIL')
        self.assertAlmostEqual(r['stations_only']['width_in'],102.874,places=3)
        self.assertGreater(r['bus_stations_and_mirrored_dock_estimate']['width_in'],r['stations_only']['width_in'])
        self.assertIn('Current study does not meet it',audit.banner(r))
        result=subprocess.run([sys.executable,str(ROOT/'tools/check-road-width.py'),'--require-pass'],capture_output=True,text=True)
        self.assertEqual(result.returncode,1)
    def test_rectangular_posts_have_requested_orientation(self):
        current=json.loads((ROOT/'site/assets/project-constraints.json').read_text())['current_road_study']
        posts=[n for n in audit.bounds(ROOT/'site'/current['frame_model']) if n['name'].endswith('-UP')]
        self.assertEqual(len(posts),12)
        for n in posts:
            self.assertAlmostEqual(n['max'][0]-n['min'][0],6*.0254,places=5)
            self.assertAlmostEqual(n['max'][1]-n['min'][1],2*.0254,places=5)
        local=[n for n in audit.bounds(ROOT/'site'/current['mounting_model']) if n['extras'].get('mount_group')=='station']
        self.assertEqual(len(local),2)
        for n in local:
            self.assertAlmostEqual(n['max'][0]-n['min'][0],6*.0254,places=5)
            self.assertAlmostEqual(n['max'][1]-n['min'][1],2*.0254,places=5)
    def test_active_models_match_audited_sources(self):
        current=json.loads((ROOT/'site/assets/project-constraints.json').read_text())['current_road_study']
        frame=(ROOT/'site/assets/subframe-study.mjs').read_text()
        revision=re.search(r"six:\{revision:'([^']+)'",frame)[1]
        self.assertEqual(current['frame_model'],f'assets/models/baaabs-subframe-study-{revision}.glb')
        mounting=(ROOT/'site/assets/panel-mounting.mjs').read_text()
        prefix=Path(current['mounting_model']).stem
        self.assertIn(prefix+'${',mounting)
    def test_source_of_truth_and_published_report(self):
        c=json.loads((ROOT/'site/assets/project-constraints.json').read_text())['road_width']
        self.assertEqual(c['maximum_inches'],102);self.assertEqual(c['maximum_meters'],2.5908);self.assertTrue(c['required'])
        r=audit.report();self.assertEqual(json.loads((ROOT/'site/assets/road-width-status.json').read_text()),r)
        for page in ['panels.html','subframe.html','panel-mounting.html']:
            self.assertIn(audit.banner(r),(ROOT/'site'/page).read_text())

if __name__=='__main__':unittest.main()

import importlib.util
import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('comparison',ROOT/'tools/build-frame-comparison.py')
model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)

class Page(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.ids=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if tag in ['a','link','script']:
            ref=a.get('href',a.get('src',''))
            if ref:self.links.append(ref)

class ComparisonChecks(unittest.TestCase):
    def test_published_data_matches_unchanged_source_schedule(self):
        self.assertEqual(model.build(),json.loads((ROOT/'site/assets/frame-comparison.json').read_text()))
    def test_local_links_and_ids(self):
        p=Page();p.feed((ROOT/'site/frame-comparison.html').read_text())
        self.assertEqual(len(p.ids),len(set(p.ids)))
        for ref in p.links:
            if ref.startswith('https:'):continue
            if ref.startswith('#'):self.assertIn(ref[1:],p.ids)
            else:self.assertTrue((ROOT/'site'/ref.split('#')[0].split('?')[0]).exists(),ref)
    def test_discovery_links(self):
        for page in ['index.html','subframe.html','panels.html']:
            self.assertIn('href="frame-comparison.html"',(ROOT/'site'/page).read_text())

if __name__=='__main__':unittest.main()

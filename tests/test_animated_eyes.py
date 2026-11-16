import json
import pathlib
import struct
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]


def load(name):
    raw=(ROOT/'site/assets/models'/name).read_bytes()
    size=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+size]),raw[28+size:]


class Eyes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before,_=load('earl-roof-attachment-study.glb')
        cls.doc,cls.binary=load('earl-animated-eyes.glb')

    def values(self,index):
        a=self.doc['accessors'][index];v=self.doc['bufferViews'][a['bufferView']]
        width={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
        flat=struct.unpack_from('<'+'f'*a['count']*width,self.binary,v.get('byteOffset',0)+a.get('byteOffset',0))
        return [flat[i:i+width] for i in range(0,len(flat),width)]

    def test_body_and_panel_geometry_preserved(self):
        for old,new in zip(self.before['nodes'],self.doc['nodes']):
            if old['name']=='SHEEP_HEAD' or old['name'].startswith('Eye_'):continue
            self.assertEqual(old,new)
        self.assertEqual(self.before['meshes'],self.doc['meshes'][:len(self.before['meshes'])])
        self.assertEqual(self.before['materials'],self.doc['materials'][:len(self.before['materials'])])
        panels=lambda doc:[n for n in doc['nodes'] if n.get('extras',{}).get('panel_id')]
        self.assertEqual(panels(self.before),panels(self.doc))

    def test_old_flame_placeholders_disconnected(self):
        visited=set()
        def walk(i):
            visited.add(i)
            for j in self.doc['nodes'][i].get('children',[]):walk(j)
        for i in self.doc['scenes'][self.doc.get('scene',0)]['nodes']:walk(i)
        old={i for i,n in enumerate(self.before['nodes']) if n.get('name','').startswith('Eye_')}
        self.assertFalse(visited & old)
        for side in ['L','R']:
            self.assertTrue(any(self.doc['nodes'][i]['name']==f'Eye_{side}_animated_bowl' for i in visited))

    def test_all_clips_select_correct_eye_on_both_sides(self):
        clips=self.doc['animations'];self.assertEqual(len(clips),6)
        for clip in clips:
            active_by_side={s:[] for s in ['L','R']}
            for c in clip['channels']:
                name=self.doc['nodes'][c['target']['node']]['name']
                if c['target']['path']!='scale' or name.count('_')!=2:continue
                s=clip['samplers'][c['sampler']];values=self.values(s['output'])
                times=self.values(s['input']);self.assertTrue(all(a[0]<b[0] for a,b in zip(times,times[1:])))
                active_by_side[name.split('_')[1]].append((name.split('_')[2],values))
            for side,tracks in active_by_side.items():
                for i in range(len(tracks[0][1])):
                    enabled=[name for name,vals in tracks if vals[i][0]>.01]
                    self.assertEqual(len(enabled),1,(clip['name'],side,i,enabled))
                    if 'Eye cycle' not in clip['name']:self.assertEqual(enabled[0],clip['name'].split(' | ')[1])
            if 'Eye cycle' in clip['name']:
                for second,expected in [(0,'Ovine'),(8,'Rainbow'),(15,'Anime'),(22,'Otaku'),(29,'Sauron'),(32,'Anime')]:
                    self.assertEqual([n for n,v in active_by_side['L'] if v[second*24][0]>.01],[expected])
                self.assertEqual(times[-1][0],36)

    def test_textures_embedded_and_rainbow_pupil_not_rotated(self):
        names=[self.doc['nodes'][c['target']['node']]['name'] for a in self.doc['animations'] for c in a['channels'] if c['target']['path']=='rotation']
        self.assertTrue(any('Rainbow_iris' in n for n in names))
        self.assertFalse(any('pupil' in n for n in names))
        for m in self.doc['materials']:
            if not m.get('extras',{}).get('animated_eye'):continue
            self.assertIn('KHR_materials_unlit',m['extensions'])
            tex=m['pbrMetallicRoughness'].get('baseColorTexture')
            if tex:
                image=self.doc['images'][self.doc['textures'][tex['index']]['source']]
                self.assertIn('bufferView',image);self.assertNotIn('uri',image)


if __name__=='__main__':unittest.main()

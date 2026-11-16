import json
import bisect
import pathlib
import struct
import unittest
import zlib

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
                for second,expected in [(0,'Ovine'),(8,'Rainbow'),(15,'Anime'),(22,'Otaku'),(29,'Sauron'),(32,'Otaku')]:
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

    def test_vegeta_iris_stays_inside_whites_for_entire_gaze(self):
        for side in ['L','R']:
            prefix=f'Eye_{side}_Anime'
            white=next(n for n in self.doc['nodes'] if n['name']==prefix+'_angular_sclera')
            aperture=white['extras']['eye_aperture']
            area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(aperture,aperture[1:]+aperture[:1]))
            sign=1 if area>0 else -1
            # Checking the four corners proves containment for the whole gaze
            # rectangle and every linear interpolation, including during blinks.
            for suffix in ['_iris','_small_pupil','_catchlight']:
                node=next(n for n in self.doc['nodes'] if n['name']==prefix+suffix)
                prim=self.doc['meshes'][node['mesh']]['primitives'][0]
                for x,y,_ in self.values(prim['attributes']['POSITION']):
                    for gx,gy in [(-.003,-.002),(-.003,.002),(.003,-.002),(.003,.002)]:
                        for a,b in zip(aperture,aperture[1:]+aperture[:1]):
                            distance=sign*((b[0]-a[0])*(y+gy-a[1])-(b[1]-a[1])*(x+gx-a[0]))
                            self.assertGreater(distance,0,(side,suffix,x,y,gx,gy))

    def test_otaku_uses_one_font_glyph_per_eye(self):
        for side in ['L','R']:
            nodes=[n for n in self.doc['nodes'] if n['name'].startswith(f'Eye_{side}_Otaku_caret')]
            self.assertEqual(len(nodes),1)
            self.assertEqual(nodes[0]['extras']['character'],'^')
            self.assertEqual(nodes[0]['extras']['font'],'Menlo-Bold')

    def test_exactly_one_fire_frame_and_step_sampling(self):
        for clip in self.doc['animations']:
            tracks={}
            for c in clip['channels']:
                n=self.doc['nodes'][c['target']['node']]
                if 'fire_frame' not in n.get('extras',{}):continue
                sampler=clip['samplers'][c['sampler']]
                self.assertEqual(sampler['interpolation'],'STEP')
                ts=[v[0] for v in self.values(sampler['input'])]
                vs=self.values(sampler['output'])
                tracks.setdefault(n['name'].rsplit('_',1)[0],[]).append((ts,vs))
            self.assertEqual(len(tracks),4)
            for frames in tracks.values():
                self.assertEqual(len(frames),32)
                duration=max(ts[-1] for ts,_ in frames)
                for i in range(int(duration*32)+1):
                    t=i/32
                    active=sum(vs[bisect.bisect_right(ts,t)-1][0]>.5 for ts,vs in frames)
                    self.assertEqual(active,1,(clip['name'],t))

    def test_fire_textures_are_warm_and_animated(self):
        frames={}
        for image in self.doc['images']:
            if '_fire_' not in image.get('name',''):continue
            view=self.doc['bufferViews'][image['bufferView']]
            data=self.binary[view['byteOffset']:view['byteOffset']+view['byteLength']]
            cursor=8;compressed=b'';size=None
            while cursor<len(data):
                length=struct.unpack_from('>I',data,cursor)[0];kind=data[cursor+4:cursor+8]
                payload=data[cursor+8:cursor+8+length]
                if kind==b'IHDR':size=struct.unpack_from('>I',payload)[0]
                if kind==b'IDAT':compressed+=payload
                cursor+=12+length
            raw=zlib.decompress(compressed)
            for y in range(size):
                row=raw[y*(size*3+1):(y+1)*(size*3+1)]
                self.assertEqual(row[0],0)
                self.assertTrue(all(row[i]>=row[i+1]>=row[i+2] for i in range(1,len(row),3)))
            frames.setdefault(image['name'].split('_fire_')[0],set()).add(data)
        self.assertEqual({key:len(value) for key,value in frames.items()},{'Ovine':32,'Sauron':32})


if __name__=='__main__':unittest.main()

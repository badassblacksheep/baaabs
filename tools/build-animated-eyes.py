#!/usr/bin/env python3
"""Add portable, textured dome eyes and native glTF animation to Earl.

Stdlib only. The body, panel register and structural source geometry are untouched.
Run before bake-structural06.mjs. Textures, meshes and clips are embedded in the GLB.
"""
import colorsys
import json
import math
import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODES = ['Ovine', 'Rainbow', 'Anime', 'Otaku', 'Sauron']
TAU = math.tau
RADIUS = .282


def png(pixels, size):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    rows = b''.join(b'\0' + pixels[y*size*3:(y+1)*size*3] for y in range(size))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


def iris_texture(mode, size=384):
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            px, py = (x+.5)*2/size-1, 1-(y+.5)*2/size
            r, a = math.hypot(px, py), math.atan2(py, px)
            fiber = .5 + .2*math.sin(183*a+18*r) + .18*math.sin(311*a-31*r) + .12*math.sin(71*a+math.sin(r*35)*2)
            if mode == 'Rainbow':
                col = colorsys.hsv_to_rgb((a/TAU+.08*math.sin(r*10)) % 1, .84, .63+.37*fiber)
            elif mode == 'Sauron':
                fire = .5+.5*math.sin(57*a+9*math.sin(a*7)-16*r)
                col = (1, .13+.65*fire*fiber, .008+.06*fire)
            elif mode == 'Ovine':
                col = (.48+.44*fiber, .28+.42*fiber, .10+.25*fiber)
            elif mode == 'Anime':
                col = (.18+.50*(1-r)+.2*fiber, .25+.50*max(0,-py)+.12*fiber, .80+.18*fiber)
            else:
                col = (.75+.24*fiber, .12+.42*max(0,-py)+.14*fiber, .50+.40*fiber)
            # A crisp limbal ring, radial fibers and a bright inner collarette.
            edge = max(.10, min(1, (1-r)*18))
            inner = 1+.13*math.exp(-((r-.51)/.045)**2)
            pixels.extend(round(255*max(0, min(1,c*edge*inner))) for c in col)
    return png(bytes(pixels), size)


class Model:
    def __init__(self, source):
        b = source.read_bytes()
        length = struct.unpack_from('<I', b, 12)[0]
        self.doc = json.loads(b[20:20+length])
        self.bin = bytearray(b[28+length:28+length+struct.unpack_from('<I', b, 20+length)[0]])
        self.tracks = {}

    def data(self, b, target=None):
        self.bin.extend(b'\0'*(-len(self.bin)%4))
        v = {'buffer':0,'byteOffset':len(self.bin),'byteLength':len(b)}
        if target: v['target'] = target
        self.bin.extend(b)
        self.doc['bufferViews'].append(v)
        return len(self.doc['bufferViews'])-1

    def accessor(self, values, width, integer=False):
        flat = [v for row in values for v in row] if width > 1 else values
        view = self.data(struct.pack('<'+('H' if integer else 'f')*len(flat), *flat))
        a = {'bufferView':view,'componentType':5123 if integer else 5126,'count':len(values),'type':{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[width]}
        if not integer:
            rows = values if width>1 else [[v] for v in values]
            a['min'] = [min(v[i] for v in rows) for i in range(width)]
            a['max'] = [max(v[i] for v in rows) for i in range(width)]
        self.doc['accessors'].append(a)
        return len(self.doc['accessors'])-1

    def material(self, label, color, texture=None):
        pbr = {'baseColorFactor':[*color,1],'metallicFactor':0,'roughnessFactor':.32}
        if texture:
            image = len(self.doc.setdefault('images',[]))
            self.doc['images'].append({'bufferView':self.data(texture),'mimeType':'image/png','name':label})
            index = len(self.doc.setdefault('textures',[]))
            self.doc['textures'].append({'source':image})
            pbr['baseColorTexture'] = {'index':index}
        mat = {'name':'Workshop_equipment_Eye_'+label,'doubleSided':True,'pbrMetallicRoughness':pbr,'extensions':{'KHR_materials_unlit':{}},'extras':{'animated_eye':True}}
        self.doc['materials'].append(mat)
        return len(self.doc['materials'])-1

    def node(self, name, **kwargs):
        i = len(self.doc['nodes'])
        self.doc['nodes'].append({'name':name,'extras':{'component':'eye_effect','visual_effect_only':True,'eye_revision':'1'},**kwargs})
        return i

    def mesh(self, name, points, faces, mat, uvs=None):
        attrs = {'POSITION':self.accessor(points,3)}
        if uvs: attrs['TEXCOORD_0'] = self.accessor(uvs,2)
        i = len(self.doc['meshes'])
        self.doc['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'indices':self.accessor(faces,1,True),'material':mat}]})
        return self.node(name,mesh=i)

    def cap(self, name, rx, ry, mat, offset=.0, center=(0,0), rings=12, segments=80):
        points, uv, faces = [],[],[]
        for j in range(rings+1):
            rho = j/rings
            for i in range(segments+1):
                a = TAU*i/segments
                x,y = center[0]+rx*rho*math.cos(a),center[1]+ry*rho*math.sin(a)
                z = math.sqrt(max(.0001,RADIUS**2-x*x-y*y)) + offset
                points.append([x,y,z]); uv.append([.5+.5*rho*math.cos(a),.5-.5*rho*math.sin(a)])
        for j in range(rings):
            for i in range(segments):
                a=j*(segments+1)+i;b=a+segments+1
                faces.extend([a,b,a+1,a+1,b,b+1])
        return self.mesh(name,points,faces,mat,uv)

    def shape(self, name, outline, mat, offset=.018):
        cx=sum(p[0] for p in outline)/len(outline);cy=sum(p[1] for p in outline)/len(outline)
        # Subdivide and project the entire pupil onto the dome. A coarse triangle
        # fan cuts through the curved iris and leaves apparent holes in the pupil.
        verts=[];faces=[];steps=8
        def vertex(a,b,u,v):
            x=cx+(a[0]-cx)*u+(b[0]-cx)*v;y=cy+(a[1]-cy)*u+(b[1]-cy)*v
            return [x,y,math.sqrt(max(.0001,RADIUS**2-x*x-y*y))+offset]
        for k,a in enumerate(outline):
            b=outline[(k+1)%len(outline)]
            for i in range(steps):
                for j in range(steps-i):
                    tris=[[(i,j),(i+1,j),(i,j+1)]]
                    if i+j<steps-1:tris.append([(i+1,j),(i+1,j+1),(i,j+1)])
                    for tri in tris:
                        start=len(verts);verts.extend(vertex(a,b,u/steps,v/steps) for u,v in tri);faces.extend([start,start+1,start+2])
        return self.mesh(name,verts,faces,mat)

    def track(self, clip, node, prop, times, values, interpolation='LINEAR'):
        self.tracks.setdefault(clip,[]).append((node,prop,times,values,interpolation))

    def save(self, output):
        for name,tracks in self.tracks.items():
            clip={'name':name,'samplers':[],'channels':[]}
            for node,prop,times,values,interpolation in tracks:
                clip['channels'].append({'sampler':len(clip['samplers']),'target':{'node':node,'path':prop}})
                clip['samplers'].append({'input':self.accessor(times,1),'output':self.accessor(values,len(values[0])),'interpolation':interpolation})
            self.doc.setdefault('animations',[]).append(clip)
        self.doc['buffers']=[{'byteLength':len(self.bin)}]
        self.bin.extend(b'\0'*(-len(self.bin)%4))
        js=json.dumps(self.doc,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
        out=struct.pack('<III',0x46546c67,2,28+len(js)+len(self.bin))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(self.bin),0x004e4942)+self.bin
        output.write_bytes(out)
        print(output.name, len(out),'bytes')


def star(cx,cy,r,n=4,inner=.28):
    return [(cx+(r if i%2==0 else r*inner)*math.cos(math.pi/2+i*math.pi/n),cy+(r if i%2==0 else r*inner)*math.sin(math.pi/2+i*math.pi/n)) for i in range(n*2)]


def main():
    model=Model(ROOT/'site/assets/models/earl-roof-attachment-study.glb');d=model.doc
    if d.get('asset',{}).get('extras',{}).get('eye_revision'): raise ValueError('Use the unmodified source GLB')
    old={i for i,n in enumerate(d['nodes']) if n.get('name','').startswith('Eye_')}
    for n in d['nodes']:
        if 'children' in n:n['children']=[i for i in n['children'] if i not in old]
    for s in d['scenes']:s['nodes']=[i for i in s['nodes'] if i not in old]
    d['animations']=[a for a in d.get('animations',[]) if not any(c['target']['node'] in old for c in a['channels'])]
    d.setdefault('extensionsUsed',[])
    if 'KHR_materials_unlit' not in d['extensionsUsed']:d['extensionsUsed'].append('KHR_materials_unlit')
    parent=next(n for n in d['nodes'] if n.get('name')=='SHEEP_HEAD')
    black=model.material('pupil',[.002,.003,.008]);white=model.material('catchlight',[1,.99,.97]);pink=model.material('blush',[1,.28,.59])
    dark=model.material('socket',[.008,.006,.014]);gold=model.material('star',[1,.85,.23])
    mats={mode:model.material(mode,[1,1,1],iris_texture(mode)) for mode in MODES}
    whites={mode:model.material(mode+'_sclera',([.055,.009,.003] if mode=='Sauron' else [.75,.65,.46] if mode in ['Ovine','Rainbow'] else [.90,.91,1])) for mode in MODES}
    groups=[]
    for side,x in [('L',-.7),('R',.7)]:
        # Same socket centers as the removed recesses, in SHEEP_HEAD local coordinates.
        socket=model.cap('Eye_'+side+'_socket',.297,.297,dark,-.014)
        # The rim backs the convex diffuser; it is a separate, stationary bezel.
        roots=[socket]
        for mode in MODES:
            sclera=model.cap('Eye_'+side+'_'+mode+'_dome',.277,.277,whites[mode])
            rx,ry=(.218,.218) if mode in ['Ovine','Rainbow'] else (.213,.247) if mode=='Anime' else (.225,.246) if mode=='Otaku' else (.248,.248)
            iris=model.cap('Eye_'+side+'_'+mode+'_iris',rx,ry,mats[mode],.008)
            details=[]
            if mode in ['Ovine','Rainbow']:
                # Superellipse produces the horizontal, rounded rectangular sheep pupil.
                outline=[]
                for i in range(80):
                    a=TAU*i/80;c,s=math.cos(a),math.sin(a)
                    outline.append((.179*math.copysign(abs(c)**.52,c),.052*math.copysign(abs(s)**.52,s)))
                details.append(model.shape('Eye_'+side+'_'+mode+'_horizontal_pupil',outline,black))
            elif mode=='Sauron':
                outline=[(.038*math.sin(TAU*i/80)**3,.226*math.cos(TAU*i/80)) for i in range(80)]
                details.append(model.shape('Eye_'+side+'_Sauron_vertical_slit',outline,black))
            elif mode=='Otaku':
                details.append(model.cap('Eye_'+side+'_Otaku_pupil',.104,.142,black,.017))
                details.append(model.shape('Eye_'+side+'_Otaku_star_pupil',star(0,.015,.096,5,.45),gold,.025))
            else:
                details.append(model.cap('Eye_'+side+'_Anime_pupil',.108,.156,black,.017))
            if mode!='Sauron':
                details.append(model.cap('Eye_'+side+'_'+mode+'_soft_highlight',.044,.061,white,.025,(-.079,.105),5,32))
                details.append(model.cap('Eye_'+side+'_'+mode+'_small_highlight',.018,.025,white,.025,(.094,-.097),4,24))
            spark=[]
            if mode=='Otaku':
                spark.append(model.shape('Eye_'+side+'_Otaku_twinkle',star(.116,.115,.048),white,.028))
                spark.append(model.shape('Eye_'+side+'_Otaku_twinkle_lower',star(-.10,-.14,.030),gold,.028))
                for xx in [-.225,.225]:
                    details.append(model.cap('Eye_'+side+'_Otaku_blush',.029,.013,pink,.028,(xx,-.098),4,24))
            gaze=model.node('Eye_'+side+'_'+mode+'_gaze',children=[iris,*details,*spark])
            group=model.node('Eye_'+side+'_'+mode,children=[sclera,gaze],scale=[1,1,1] if mode=='Ovine' else [0,0,0])
            roots.append(group);groups.append((mode,group,gaze,iris,spark))
        assembly=model.node('Eye_'+side+'_animated_bowl',children=roots,translation=[x,2.3120215,.453])
        parent['children'].append(assembly)
    # A 36-second show. The evil reveal is brief and returns directly to cute anime.
    segments=[(0,7,'Ovine'),(7,14,'Rainbow'),(14,21,'Anime'),(21,28,'Otaku'),(28,31,'Sauron'),(31,36,'Anime')]
    clips=[('BAAABS | Eye cycle',36,None)]+[('BAAABS | '+m,8,m) for m in MODES]
    for clip,duration,fixed in clips:
        times=[round(i/24,6) for i in range(duration*24+1)]
        for mode,group,gaze,iris,spark in groups:
            values=[];poses=[];rotations=[];sparkle=[]
            for t in times:
                phase=t%duration
                active=fixed or next(m for a,b,m in segments if a<=phase<b)
                blink=1
                for b in ([2.6,5.7] if fixed else [2.6,7,10.3,14,17.6,21,24.3,28,31,34.0,35.5]):
                    blink=min(blink,.035+.965*min(1,abs(t-b)/.13))
                pulse=1+.025*math.sin(t*18)+.016*math.sin(t*31) if mode=='Sauron' else 1
                values.append([pulse,blink*pulse,1] if active==mode else [0,0,0])
                poses.append([.009*math.sin(TAU*t/4),.006*math.sin(TAU*t/8),.003])
                angle=TAU*t/8 if mode=='Rainbow' else .015*math.sin(TAU*t/4) if mode=='Sauron' else 0
                rotations.append([0,0,math.sin(angle/2),math.cos(angle/2)])
                sparkle.append([1+ .13*math.sin(TAU*t/2)]*3)
            model.track(clip,group,'scale',times,values)
            model.track(clip,gaze,'translation',times,poses)
            if mode in ['Rainbow','Sauron']:model.track(clip,iris,'rotation',times,rotations)
            for node in spark:model.track(clip,node,'scale',times,sparkle)
    d['asset'].setdefault('extras',{}).update(eye_revision='1',eye_modes=MODES,eye_cycle_seconds=36,eye_design='Convex diffusers, native glTF clips, no plugins or external textures',eye_lore='Occasionally reveal ancient evil; immediately pretend nothing happened.')
    model.save(ROOT/'site/assets/models/earl-animated-eyes.glb')


if __name__=='__main__': main()

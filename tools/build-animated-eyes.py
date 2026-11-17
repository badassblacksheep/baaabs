#!/usr/bin/env python3
"""Add portable, textured dome eyes and native glTF animation to Earl.

Requires NumPy for the reproducible fire bake. Body and panel geometry are untouched.
Run before bake-structural06.mjs. Textures, meshes and clips are embedded in the GLB.
"""
import colorsys
import json
import math
import pathlib
import struct
import zlib
from hypnotoad_eyes import HYPNO_FRAMES, HYPNO_SIZE, HYPNO_RIGHT_PHASE, hypnotoad_pixels
from infernal_eyes import (FIRE_FRAMES,FIRE_FPS,FIRE_SECONDS,FIRE_SIZE,SHELL_RADIUS,
                          PUPILS,OVINE_TILT_DEGREES,FIRE_HOLD,STANDARD_HOLD,
                          SEQUENCE,CYCLE_SECONDS,ARCHIVE_SEQUENCE,OVINE_FRAMES,
                          RIPPLE_NAMES,RIGHT_PHASE_FRAMES,PULSE_FRAMES,
                          fire_field,fire_pixels,ovine_pixels)

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODES = ['Ovine', 'Rainbow', 'Anime', 'Otaku', 'Sauron', 'Hypnotoad']
TAU = math.tau
APERTURE_RADIUS = .277
HEAD_SCALE = 1.15
CAP_DEPTH = 3.5 * .0254 / HEAD_SCALE
CAP_RADIUS = (APERTURE_RADIUS**2 + CAP_DEPTH**2)/(2*CAP_DEPTH)
# Retain the original aperture plane and eye centers; retract only the bulge.
RIM_Z = math.sqrt(.282**2 - APERTURE_RADIUS**2)


def surface_z(x,y,offset=0):
    return RIM_Z + CAP_DEPTH + math.sqrt(max(0,CAP_RADIUS**2-x*x-y*y))-CAP_RADIUS + offset*.12
# U+005E (^) outline extracted from the installed Menlo-Bold font with CoreText.
# A single real glyph, including its flat crown; never two overlapping strokes.
CARET_GLYPH = [(360.83984375,729.00390625),(574.21875,457.03125),
               (456.0546875,457.03125),(300.78125,604.00390625),
               (145.99609375,457.03125),(27.83203125,457.03125),
               (241.2109375,729.00390625)]


def signed_area(points):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))/2


def clip_polygon(points, outline, inset=(0,0,0)):
    """Clip XY plus interpolated attributes to a convex aperture.

    Erode each edge by the support of the complete animated gaze rectangle,
    plus a small rim margin. Every interpolated gaze stays inside the whites.
    """
    sign=1 if signed_area(outline)>0 else -1
    for a,b in zip(outline,outline[1:]+outline[:1]):
        dx,dy=b[0]-a[0],b[1]-a[1]
        margin=abs(dy)*inset[0]+abs(dx)*inset[1]+math.hypot(dx,dy)*inset[2]
        distance=lambda p:sign*(dx*(p[1]-a[1])-dy*(p[0]-a[0]))-margin
        out=[]
        for p,q in zip(points,points[1:]+points[:1]):
            dp,dq=distance(p),distance(q)
            if dp>=0:out.append(p)
            if (dp>=0)!=(dq>=0):
                t=dp/(dp-dq)
                out.append([p[k]+t*(q[k]-p[k]) for k in range(len(p))])
        points=out
        if not points:break
    return points


def triangulate(outline):
    """Ear clipping for the concave font glyph; preserves the open caret notch."""
    points=list(outline)
    if signed_area(points)<0:points.reverse()
    cross=lambda a,b,c:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    triangles=[]
    while len(points)>3:
        for i,b in enumerate(points):
            a,c=points[i-1],points[(i+1)%len(points)]
            if cross(a,b,c)<=1e-12:continue
            if any(p not in (a,b,c) and min(cross(a,b,p),cross(b,c,p),cross(c,a,p))>=-1e-12 for p in points):continue
            triangles.append((a,b,c));points.pop(i);break
        else:raise ValueError('Cannot triangulate glyph outline')
    return triangles+[tuple(points)]


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
                col = (.82+.17*fiber, .28+.33*fiber, .025+.055*fiber)
            else:
                col = (.75+.24*fiber, .12+.42*max(0,-py)+.14*fiber, .50+.40*fiber)
            # A crisp limbal ring, radial fibers and a bright inner collarette.
            edge = max(.10, min(1, (1-r)*18))
            inner = 1+.13*math.exp(-((r-.51)/.045)**2)
            pixels.extend(round(255*max(0, min(1,c*edge*inner))) for c in col)
    return png(bytes(pixels), size)


def fire_texture(field, frame, size=FIRE_SIZE):
    pixels=ovine_pixels(field,frame) if field['mode']=='Ovine' else fire_pixels(field,frame)
    return png(pixels.tobytes(),size)


class Model:
    def __init__(self, source):
        b = source.read_bytes()
        length = struct.unpack_from('<I', b, 12)[0]
        self.doc = json.loads(b[20:20+length])
        self.bin = bytearray(b[28+length:28+length+struct.unpack_from('<I', b, 20+length)[0]])
        self.tracks = {}
        self.accessor_cache = {}

    def data(self, b, target=None):
        self.bin.extend(b'\0'*(-len(self.bin)%4))
        v = {'buffer':0,'byteOffset':len(self.bin),'byteLength':len(b)}
        if target: v['target'] = target
        self.bin.extend(b)
        self.doc['bufferViews'].append(v)
        return len(self.doc['bufferViews'])-1

    def accessor(self, values, width, integer=False):
        flat = [v for row in values for v in row] if width > 1 else values
        packed=struct.pack('<'+('H' if integer else 'f')*len(flat), *flat)
        key=(width,integer,packed)
        if key in self.accessor_cache:return self.accessor_cache[key]
        view = self.data(packed)
        a = {'bufferView':view,'componentType':5123 if integer else 5126,'count':len(values),'type':{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[width]}
        if not integer:
            rows = values if width>1 else [[v] for v in values]
            a['min'] = [min(v[i] for v in rows) for i in range(width)]
            a['max'] = [max(v[i] for v in rows) for i in range(width)]
        self.doc['accessors'].append(a)
        index=len(self.doc['accessors'])-1;self.accessor_cache[key]=index
        return index

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
        self.doc['nodes'].append({'name':name,'extras':{'component':'eye_effect','visual_effect_only':True,'eye_revision':'5'},**kwargs})
        return i

    def mesh(self, name, points, faces, mat, uvs=None):
        attrs = {'POSITION':self.accessor(points,3)}
        if uvs: attrs['TEXCOORD_0'] = self.accessor(uvs,2)
        i = len(self.doc['meshes'])
        self.doc['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'indices':self.accessor(faces,1,True),'material':mat}]})
        return self.node(name,mesh=i)

    def cap(self, name, rx, ry, mat, offset=.0, center=(0,0), rings=12, segments=80, aperture=None):
        points, uv, faces = [],[],[]
        for j in range(rings+1):
            rho = j/rings
            for i in range(segments+1):
                a = TAU*i/segments
                x,y = center[0]+rx*rho*math.cos(a),center[1]+ry*rho*math.sin(a)
                z = surface_z(x,y,offset)
                points.append([x,y,z]); uv.append([.5+.5*rho*math.cos(a),.5-.5*rho*math.sin(a)])
        for j in range(rings):
            for i in range(segments):
                a=j*(segments+1)+i;b=a+segments+1
                faces.extend([a,b,a+1,a+1,b,b+1])
        if aperture:
            clipped_points,clipped_uv,clipped_faces=[],[],[]
            for i in range(0,len(faces),3):
                triangle=[points[j][:2]+uv[j] for j in faces[i:i+3]]
                polygon=clip_polygon(triangle,aperture,(.003,.002,.003))
                for j in range(1,len(polygon)-1):
                    start=len(clipped_points)
                    for x,y,u,v in [polygon[0],polygon[j],polygon[j+1]]:
                        clipped_points.append([x,y,surface_z(x,y,offset)])
                        clipped_uv.append([u,v])
                    clipped_faces.extend([start,start+1,start+2])
            points,uv,faces=clipped_points,clipped_uv,clipped_faces
        return self.mesh(name,points,faces,mat,uv)

    def shape(self, name, outline, mat, offset=.018, concave=False):
        cx=sum(p[0] for p in outline)/len(outline);cy=sum(p[1] for p in outline)/len(outline)
        # Subdivide and project the entire pupil onto the dome. A coarse triangle
        # fan cuts through the curved iris and leaves apparent holes in the pupil.
        verts=[];faces=[];steps=8
        def vertex(c,a,b,u,v):
            x=c[0]+(a[0]-c[0])*u+(b[0]-c[0])*v;y=c[1]+(a[1]-c[1])*u+(b[1]-c[1])*v
            return [x,y,surface_z(x,y,offset)]
        triangles=triangulate(outline) if concave else [((cx,cy),a,outline[(k+1)%len(outline)]) for k,a in enumerate(outline)]
        for c,a,b in triangles:
            for i in range(steps):
                for j in range(steps-i):
                    tris=[[(i,j),(i+1,j),(i,j+1)]]
                    if i+j<steps-1:tris.append([(i+1,j),(i+1,j+1),(i,j+1)])
                    for tri in tris:
                        start=len(verts);verts.extend(vertex(c,a,b,u/steps,v/steps) for u,v in tri);faces.extend([start,start+1,start+2])
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
    black=model.material('pupil',[.002,.003,.008])
    warmblack=model.material('warm_pupil',[.004,.002,.001])
    white=model.material('catchlight',[1,.99,.97])
    dark=model.material('socket',[.008,.006,.014])
    warmdark=model.material('warm_black',[.012,.004,.001])
    cream=model.material('Vegeta_sclera',[1,.88,.67])
    amber=model.material('caret_gold',[1,.53,.055])
    blush=model.material('caret_blush',[1,.16,.025])
    mats={mode:model.material(mode,[1,1,1],iris_texture(mode)) for mode in ['Rainbow','Anime']}
    fire_materials={}
    for mode in ['Ovine','Sauron']:
        field=fire_field(mode)
        count=OVINE_FRAMES if mode=='Ovine' else FIRE_FRAMES
        fire_materials[mode]=[model.material(mode+'_fire_%03d'%i,[1,1,1],fire_texture(field,i)) for i in range(count)]
    rainbow_sclera=model.material('Rainbow_sclera',[.75,.65,.46])
    hypno_materials=[model.material('Hypnotoad_frame_%02d'%i,[1,1,1],png(hypnotoad_pixels(i).tobytes(),HYPNO_SIZE)) for i in range(HYPNO_FRAMES)]
    groups=[];fire_nodes=[];shared_fire_meshes={}
    for side,x in [('L',-.7),('R',.7)]:
        socket=model.cap('Eye_'+side+'_socket',.297,.297,dark,-.014)
        roots=[socket]
        inward=1 if side=='L' else -1
        for mode in MODES:
            prefix='Eye_'+side+'_'+mode
            sclera=model.cap(prefix+'_dome',.277,.277,rainbow_sclera if mode=='Rainbow' else warmdark)
            iris=None;parts=[];fixed=[];spark=[]
            if mode in ['Ovine','Sauron']:
                rx=ry=SHELL_RADIUS
                for frame,material in enumerate(fire_materials[mode]):
                    if (mode,frame) not in shared_fire_meshes:
                        node=model.cap(prefix+'_fire_%02d'%frame,rx,ry,material,.008)
                        shared_fire_meshes[(mode,frame)]=d['nodes'][node]['mesh']
                    else:
                        node=model.node(prefix+'_fire_%02d'%frame,mesh=shared_fire_meshes[(mode,frame)])
                    shift=RIGHT_PHASE_FRAMES if side=='R' and mode=='Ovine' else 0
                    d['nodes'][node]['scale']=[1,1,1] if frame==shift else [0,0,0]
                    d['nodes'][node]['extras'].update(fire_frame=frame,fire_fps=FIRE_FPS,flow_direction='iris_to_shell_backdraft',phase_frames=shift)
                    parts.append(node);fire_nodes.append((node,frame,len(fire_materials[mode]),shift))
            elif mode=='Hypnotoad':
                for frame,material in enumerate(hypno_materials):
                    if (mode,frame) not in shared_fire_meshes:
                        node=model.cap(prefix+'_frame_%02d'%frame,SHELL_RADIUS,SHELL_RADIUS,material,.008)
                        shared_fire_meshes[(mode,frame)]=d['nodes'][node]['mesh']
                    else:
                        node=model.node(prefix+'_frame_%02d'%frame,mesh=shared_fire_meshes[(mode,frame)])
                    shift=HYPNO_RIGHT_PHASE if side=='R' else 0
                    d['nodes'][node]['scale']=[1,1,1] if frame==shift else [0,0,0]
                    d['nodes'][node]['extras'].update(hypnotoad_frame=frame,phase_frames=shift)
                    parts.append(node);fire_nodes.append((node,frame,HYPNO_FRAMES,shift))
            elif mode=='Rainbow':
                iris=model.cap(prefix+'_iris',.218,.218,mats[mode],.008)
                parts.append(iris)
            if mode in ['Ovine','Rainbow']:
                outline=[]
                for i in range(80):
                    a=TAU*i/80;c,sn=math.cos(a),math.sin(a)
                    outline.append((.179*math.copysign(abs(c)**.52,c),.052*math.copysign(abs(sn)**.52,sn)))
                parts.append(model.shape(prefix+'_horizontal_pupil',outline,black if mode=='Rainbow' else warmblack,.018 if mode=='Rainbow' else .022))
            elif mode=='Sauron':
                outline=[(PUPILS[mode][0]*math.copysign(math.sin(TAU*i/80)**2,math.sin(TAU*i/80)),PUPILS[mode][1]*math.cos(TAU*i/80)) for i in range(80)]
                parts.append(model.shape(prefix+'_vertical_slit',outline,warmblack,.022))
            elif mode=='Anime':
                # Narrow angular Vegeta stare; the two inner brows point at the nose.
                mirror=lambda pts:[(inward*xx,yy) for xx,yy in pts]
                # The upper white edge meets the underside of the brow exactly.
                brow_y=lambda xx:.086+(xx+.244)*(-.127/.456)
                eye=mirror([(-.236,brow_y(-.236)),(.211,brow_y(.211)),(.126,-.107),(-.203,-.084)])
                white_node=model.shape(prefix+'_angular_sclera',eye,cream,.014)
                d['nodes'][white_node]['extras']['eye_aperture']=eye
                fixed.append(white_node)
                brow=mirror([(-.239,.160),(.219,.015),(.212,-.041),(-.244,.086)])
                fixed.append(model.shape(prefix+'_angled_brow',brow,warmblack,.030))
                cx=inward*.062;cy=-.036
                iris=model.cap(prefix+'_iris',.042,.054,mats[mode],.020,(cx,cy),7,48,aperture=eye)
                parts.extend([iris,model.cap(prefix+'_small_pupil',.021,.044,warmblack,.026,(cx,cy),6,40,aperture=eye)])
                parts.append(model.cap(prefix+'_catchlight',.006,.009,white,.032,(cx-.008,cy+.010),3,16,aperture=eye))
            elif mode=='Otaku':
                # Real U+005E glyph, scaled uniformly and projected onto the bowl.
                scale=.380/(574.21875-27.83203125)
                glyph=[((xx-301.025390625)*scale,(yy-457.03125)*scale-.065) for xx,yy in CARET_GLYPH]
                caret=model.shape(prefix+'_caret_glyph',glyph,amber,.025,concave=True)
                d['nodes'][caret]['extras'].update(character='^',font='Menlo-Bold',unicode='U+005E')
                parts.append(caret)
                def stroke(name,a,b,width,material):
                    dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
                    nx,ny=-dy/length*width/2,dx/length*width/2
                    return model.shape(prefix+'_'+name,[(a[0]+nx,a[1]+ny),(b[0]+nx,b[1]+ny),(b[0]-nx,b[1]-ny),(a[0]-nx,a[1]-ny)],material,.025)
                for j in [-1,1]:
                    for k in range(2):
                        xx=j*(.19+k*.025)
                        parts.append(stroke('blush_%s_%s'%(j,k),(xx-.008,-.116),(xx+.003,-.084),.011,blush))
            if mode=='Rainbow':
                parts.append(model.cap(prefix+'_soft_highlight',.044,.061,white,.025,(-.079,.105),5,32))
                parts.append(model.cap(prefix+'_small_highlight',.018,.025,white,.025,(.094,-.097),4,24))
            gaze=model.node(prefix+'_gaze',children=parts)
            children=[sclera,*fixed,gaze]
            if mode=='Ovine':
                angle=math.radians(-inward*OVINE_TILT_DEGREES)
                graphic=model.node(prefix+'_outward_cant',children=[gaze],rotation=[0,0,math.sin(angle/2),math.cos(angle/2)])
                d['nodes'][graphic]['extras']['outward_cant_degrees']=-inward*OVINE_TILT_DEGREES
                children=[sclera,*fixed,graphic]
            group=model.node(prefix,children=children,scale=[1,1,1] if mode=='Ovine' else [0,0,0])
            roots.append(group);groups.append((mode,group,gaze,iris,spark))
        assembly=model.node('Eye_'+side+'_animated_bowl',children=roots,translation=[x,2.3120215,.453])
        d['nodes'][assembly]['extras'].update(aperture_diameter_m=2*APERTURE_RADIUS*HEAD_SCALE,cap_depth_m=CAP_DEPTH*HEAD_SCALE,geometry='shallow_spherical_cap')
        parent['children'].append(assembly)
    # Owner-selected solo study. Keep the former show and all individual looks.
    segments=ARCHIVE_SEQUENCE
    clips=[('BAAABS | Eye cycle',CYCLE_SECONDS,'Ovine'),
           ('BAAABS | Archived five-look show',56,None)]+[('BAAABS | '+m,FIRE_HOLD if m in ['Ovine','Sauron'] else STANDARD_HOLD,m) for m in MODES]
    for clip,duration,fixed in clips:
        times=[round(i/24,6) for i in range(int(duration*24)+1)]
        for mode,group,gaze,iris,spark in groups:
            values=[];poses=[];rotations=[];sparkle=[]
            for t in times:
                phase=t%duration
                active=fixed or next(m for a,b,m in segments if a<=phase<b)
                blink=1
                for b in ([2.6,5.7,10.4,13.2] if fixed else [5.7,12.4,16,19.3,24,27.6,32,38.2,44.5,48,51.3,55.8]):
                    blink=min(blink,.035+.965*min(1,abs(t-b)/.13))
                # Fire reads as theater; a full blink reveals the cute successor.
                if mode in ['Ovine','Sauron'] and active==mode and not fixed:
                    blink=1
                    for edge in [16,48]:blink=min(blink,.035+.965*min(1,abs(t-edge)/.13))
                if fixed in ['Ovine','Hypnotoad']:blink=1
                pulse=1
                values.append([pulse,blink*pulse,1] if active==mode else [0,0,0])
                # The active projected ovine graphic stays on the shallow cap.
                poses.append([0,0,.0004] if mode in ['Ovine','Hypnotoad'] else [(.003 if mode=='Anime' else .009)*math.sin(TAU*t/4),(.002 if mode=='Anime' else .006)*math.sin(TAU*t/8),.003])
                angle=TAU*t/8 if mode=='Rainbow' else 0
                rotations.append([0,0,math.sin(angle/2),math.cos(angle/2)])
                sparkle.append([1+ .13*math.sin(TAU*t/2)]*3)
            model.track(clip,group,'scale',times,values)
            model.track(clip,gaze,'translation',times,poses)
            if mode=='Rainbow':model.track(clip,iris,'rotation',times,rotations)
            for node in spark:model.track(clip,node,'scale',times,sparkle)
        for node,frame,count,shift in fire_nodes:
            total=int(duration*FIRE_FPS)
            keys={0:[1,1,1] if frame==shift else [0,0,0],total:[1,1,1] if frame==(total+shift)%count else [0,0,0]}
            if frame==shift and total>1:keys[1]=[0,0,0]
            for start in range((frame-shift)%count,total,count):
                keys[start]=[1,1,1]
                if start+1<total:keys[start+1]=[0,0,0]
            ticks=sorted(keys)
            model.track(clip,node,'scale',[i/FIRE_FPS for i in ticks],[keys[i] for i in ticks],'STEP')
    d['asset'].setdefault('extras',{}).update(eye_revision='5',hypnotoad_frames=HYPNO_FRAMES,hypnotoad_texture_size=HYPNO_SIZE,hypnotoad_style='Morphing black horizontal pupils with red-gold contour bands; Futurama reference',fire_flow='iris_to_shell_backdraft',fire_frames=FIRE_FRAMES,ovine_frames=OVINE_FRAMES,fire_fps=FIRE_FPS,ovine_ripples=RIPPLE_NAMES,pulse_frames=PULSE_FRAMES,right_phase_frames=RIGHT_PHASE_FRAMES,non_rainbow_palette='warm',anime_style='Vegeta angular stare',otaku_style='^_^',eye_modes=MODES,active_eye_modes=['Ovine'],eye_cycle_seconds=CYCLE_SECONDS,eye_sequence=SEQUENCE,archived_eye_sequence=ARCHIVE_SEQUENCE,fire_hold_seconds=FIRE_HOLD,standard_hold_seconds=STANDARD_HOLD,ovine_cant_degrees=OVINE_TILT_DEGREES,aperture_diameter_m=2*APERTURE_RADIUS*HEAD_SCALE,cap_depth_m=CAP_DEPTH*HEAD_SCALE,eye_design='Shallow spherical diffusers, native glTF clips, no plugins or external textures',eye_lore='Always follow mischief with cute. Infernal effects are comedic theater and convey no malice. Solo ovine study temporarily active by owner request; full show retained.')
    model.save(ROOT/'site/assets/models/earl-animated-eyes.glb')


if __name__=='__main__': main()

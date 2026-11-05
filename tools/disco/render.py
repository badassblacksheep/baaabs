"""CPU-only turntable of the actual v24 OBJ. No Blender process or GPU needed.

Uses NumPy and pycairo. Run from the repository: python3 tools/disco/render.py.
The master model is read-only. Dancers/lights/flames are presentation effects.
"""
from pathlib import Path
import math, json, argparse
import numpy as np
import cairo

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT.parent / 'outputs/assembly-v24/baaabs-assembly.obj'
OUT = ROOT / 'site/assets/disco'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--frames', type=int, default=192)
parser.add_argument('--width', type=int, default=1280)
parser.add_argument('--poster-only', action='store_true')
args = parser.parse_args()
W, H = args.width, round(args.width * 9 / 16)
vertices, faces, materials, names = [], [], [], []
material, name = '', ''
for line in SOURCE.read_text().splitlines():
    if line.startswith('v '): vertices.append(list(map(float, line.split()[1:])))
    elif line.startswith('o '): name = line[2:]
    elif line.startswith('usemtl '): material = line[7:]
    elif line.startswith('f '):
        ix = [int(v.split('/')[0])-1 for v in line.split()[1:]]
        for j in range(1,len(ix)-1):
            faces.append([ix[0],ix[j],ix[j+1]])
            materials.append(material); names.append(name)
V = np.array(vertices); F = np.array(faces)
T = V[F]; center = T.mean(axis=1)
N = np.cross(T[:,1]-T[:,0], T[:,2]-T[:,0])
N /= np.maximum(np.linalg.norm(N,axis=1)[:,None], 1e-10)
base = np.tile([.12,.125,.15], (len(F),1))
for i,m in enumerate(materials):
    if m.startswith('Panel_'): base[i] = [.19,.195,.23]
    if any(s in m.lower() for s in ['rails','metal','tank']): base[i] = [.40,.43,.49]
    if any(s in m.lower() for s in ['rubber','speaker']): base[i] = [.045,.045,.055]
    if 'glass' in m: base[i] = [.07,.1,.16]
    if 'generator' in m: base[i] = [.055,.13,.09]

def unit(x):
    x=np.asarray(x,dtype=float);return x / np.linalg.norm(x)

def frame(k):
    phase=k/args.frames*2*math.pi
    theta=-2.22 + phase
    camera=np.array([30*math.cos(theta),18,30*math.sin(theta)])
    target=np.array([.7,4.6,0]); backward=unit(camera-target)
    right=unit(np.cross([0,1,0],backward)); up=np.cross(backward,right)
    matrix=np.array([right,up,backward]).T
    scale=W/28
    def project(p):
        q=(np.array(p)-target)@matrix
        return np.stack([W*.5+q[...,0]*scale,H*.52-q[...,1]*scale],axis=-1)
    surface=cairo.ImageSurface(cairo.FORMAT_RGB24,W,H)
    c=cairo.Context(surface)
    bg=cairo.LinearGradient(0,0,0,H);bg.add_color_stop_rgb(0,.025,.016,.065);bg.add_color_stop_rgb(1,.012,.013,.022)
    c.set_source(bg);c.paint()
    # Soft, slowly sweeping nightclub beams, without strobing.
    for j,col in enumerate([(1,.06,.43),(.15,.23,1),(.04,.8,.68)]):
        x=W*(.2+j*.3); end=x+W*.22*math.sin(phase+j*2)
        g=cairo.LinearGradient(x,0,end,H*.85)
        g.add_color_stop_rgba(0,*col,.14);g.add_color_stop_rgba(1,*col,0)
        c.move_to(x-12,0);c.line_to(x+12,0);c.line_to(end+W*.24,H*.88);c.line_to(end-W*.24,H*.88);c.close_path();c.set_source(g);c.fill()
    # Ground grid establishes perspective and rotation.
    for z in np.arange(-18,19,2):
        p=project([[-22,-.05,z],[22,-.05,z]])
        c.move_to(*p[0]);c.line_to(*p[1]);c.set_source_rgba(.35,.15,.65,.20);c.set_line_width(.7);c.stroke()
    for x in np.arange(-22,23,2):
        p=project([[x,-.05,-18],[x,-.05,18]])
        c.move_to(*p[0]);c.line_to(*p[1]);c.set_source_rgba(.15,.37,.50,.16);c.stroke()
    lights=[(unit([math.cos(phase)*.8,1,math.sin(phase)*.8]),np.array([.85,.22,.62])),(unit([-1,.6,-1]),np.array([.18,.45,1])),(unit([1,.9,1]),np.array([.15,.85,.65]))]
    illumination=np.tile([.30,.30,.36],(len(F),1))
    for direction,color in lights:
        illumination += np.maximum(0,N@direction)[:,None]*color*.95
    color=np.minimum(1,base*illumination*1.75)
    points=project(V);depth=(center-target)@backward
    # Painter-order polygons retain the source faces and exterior silhouette.
    # Presentation rig is depth-sorted with the model to keep dancers behind rails.
    drawlist=[(depth[i],'face',i) for i in range(len(F))]
    dancers=[]
    for j,(x,z) in enumerate([(-4,-.55),(-2,.6),(-.2,-.45),(1.8,.6),(3.8,-.55)]):
        p=phase*4+j*1.3; bounce=.065*(1+math.sin(p*2))
        hip=np.array([x+.13*math.sin(p),4.20+bounce,z]);neck=hip+[.10*math.sin(p),.62,0]
        head=neck+[0,.27,0]
        joints=[([x-.24,3.43,z],hip+[-.15,-.35,.03],hip),([x+.23,3.43,z],hip+[.2,-.38,-.04],hip),(hip,neck),(neck,neck+[-.35,.15+.23*math.sin(p),.05],neck+[-.53,.55+.25*math.sin(p),.08]),(neck,neck+[.32,.12-.2*math.sin(p),-.05],neck+[.5,.5-.25*math.sin(p),-.06])]
        dancers.append((j,joints,head))
        drawlist.append((float((hip-target)@backward),'dancer',len(dancers)-1))
    for _,kind,i in sorted(drawlist,key=lambda x:x[0]):
        if kind=='face':
            p=points[F[i]]
            # Degenerate projected faces can be skipped.
            a,b=p[1]-p[0],p[2]-p[0]
            area=a[0]*b[1]-a[1]*b[0]
            if abs(float(area))<.09:continue
            c.move_to(*p[0]);c.line_to(*p[1]);c.line_to(*p[2]);c.close_path()
            c.set_source_rgb(*color[i]);c.fill()
        else:
            j,joints,head=dancers[i]
            col=[(1,.24,.57),(.25,.8,1),(.95,.8,.26),(.33,1,.64),(.8,.4,1)][j]
            c.set_line_cap(cairo.LINE_CAP_ROUND);c.set_line_join(cairo.LINE_JOIN_ROUND)
            for limb in joints:
                p=project(limb);c.move_to(*p[0])
                for q in p[1:]:c.line_to(*q)
                c.set_source_rgb(*col);c.set_line_width(scale*.11);c.stroke()
            q=project(head);c.arc(*q,scale*.14,0,math.tau);c.set_source_rgb(*col);c.fill()
    # Twin animated gas flame shapes originate at the actual modeled mast tips.
    pulse=max(0,math.sin(phase*3-.2))**1.4
    for j,z in enumerate([-1.25,1.25]):
        tip=np.array([8.58,8.38,z]);power=pulse*(.9+.1*math.sin(k*.7+j))
        if power<.025:continue
        tip2=tip+np.array([.63*power,2.7*power,0])
        q=project(tip);q2=project(tip2)
        glow=cairo.RadialGradient(*q,0,*q,scale*1.8*power)
        glow.add_color_stop_rgba(0,1,.25,.03,.35);glow.add_color_stop_rgba(1,1,.08,0,0)
        c.set_source(glow);c.arc(*q,scale*1.8*power,0,math.tau);c.fill()
        for layer,(col,width) in enumerate([((1,.19,.015),.53),((1,.58,.025),.33),((1,.93,.55),.14)]):
            axis=q2-q;norm=np.array([-axis[1],axis[0]])/max(np.linalg.norm(axis),1)
            w=scale*width*power
            top=q+axis*(1-layer*.16)
            c.move_to(*q);c.curve_to(*(q+axis*.15+norm*w),*(top+norm*w*.55),*top)
            c.curve_to(*(top-norm*w*.45),*(q+axis*.25-norm*w),*q)
            c.set_source_rgb(*col);c.fill()
    # Small mirrorball and rotating facets, away from the vehicle.
    bx,by=W*.5,H*.085
    c.set_source_rgba(.6,.68,.9,.7);c.set_line_width(.6);c.move_to(bx,0);c.line_to(bx,by-13);c.stroke()
    for row in range(-3,4):
        for col in range(-3,4):
            if row*row+col*col>10:continue
            brightness=.35+.45*max(0,math.sin(col+phase*2+row*.5))
            c.rectangle(bx+col*4,by+row*4,3.3,3.3);c.set_source_rgb(brightness*.7,brightness*.8,brightness);c.fill()
    surface.write_to_png(str(OUT/f'frame-{k:04}.png'))
    if k==min(24,args.frames-1):surface.write_to_png(str(OUT/'poster.png'))

for k in ([0] if args.poster_only else range(args.frames)):
    frame(k)
    if k%24==0:print(f'frame {k}/{args.frames}',flush=True)
(OUT/'provenance.json').write_text(json.dumps({'source':str(SOURCE.relative_to(ROOT.parent)), 'source_vertices':len(V),'rendered_triangles':len(F),'frames':args.frames,'fps':24,'presentation_only':['orbit camera','five animated stylized dancers','disco lighting','two mast-tip flame effects'],'geometry_modified':False,'renderer':'CPU NumPy + Cairo; painter ordered mesh projection'},indent=2))

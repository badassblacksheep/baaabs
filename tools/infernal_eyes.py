"""BAAABS infernal eye look / deterministic, looping radial advection.

NumPy only. Shared by the native GLB bake and the VFX motion-reference export.
This is an art-directed procedural reference, not a combustion simulation.
"""
import math
import numpy as np

FIRE_FRAMES = 128
FIRE_FPS = 24
FIRE_SECONDS = FIRE_FRAMES / FIRE_FPS
FIRE_SIZE = 256
SHELL_RADIUS = .275
PUPILS = {'Sauron': (.039, .211), 'Ovine': (.179, .052)}
OVINE_TILT_DEGREES = 10
STANDARD_HOLD = 8
FIRE_HOLD = 16
ARCHIVE_SEQUENCE = [(0,16,'Ovine'),(16,24,'Rainbow'),(24,32,'Anime'),
                    (32,48,'Sauron'),(48,56,'Otaku')]
RIPPLE_NAMES = ('Backdraft', 'Double crest', 'Rolling bloom')
OVINE_FRAMES = FIRE_FRAMES * len(RIPPLE_NAMES)
# Each 128-frame reference has two pulses. A quarter pulse is 16 frames,
# not a quarter of the 384-frame, three-variation show.
PULSE_FRAMES = FIRE_FRAMES // 2
RIGHT_PHASE_FRAMES = PULSE_FRAMES // 4
SEQUENCE = [(0,OVINE_FRAMES/FIRE_FPS,'Ovine')]
CYCLE_SECONDS = SEQUENCE[-1][1]
_GRID = np.random.default_rng(73019).random((16,16,16)).astype(np.float32)


def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)


def noise(x,y,z):
    """C2-interpolated, periodic 3D value noise, period 16 in every axis."""
    xi,yi,zi=np.floor(x).astype(np.int32),np.floor(y).astype(np.int32),np.floor(z).astype(np.int32)
    u,v,w=x-xi,y-yi,z-zi
    u=u*u*u*(u*(u*6-15)+10);v=v*v*v*(v*(v*6-15)+10);w=w*w*w*(w*(w*6-15)+10)
    out=np.zeros(np.broadcast_shapes(np.shape(x),np.shape(y),np.shape(z)),np.float32)
    for i in range(2):
        for j in range(2):
            for k in range(2):
                out+=_GRID[(xi+i)%16,(yi+j)%16,(zi+k)%16]*(u if i else 1-u)*(v if j else 1-v)*(w if k else 1-w)
    return out


def pupil_radius(mode,angle):
    c,s=np.abs(np.cos(angle)),np.abs(np.sin(angle))
    rx,ry=PUPILS[mode]
    if mode=='Ovine':
        p=2/.52
        return ((c/rx)**p+(s/ry)**p)**(-1/p)
    # x/rx + (y/ry)^2 = 1, the same pointed lens as the native pupil mesh.
    aa=(s/ry)**2;bb=c/rx
    return 2/(bb+np.sqrt(bb*bb+4*aa))


def fire_field(mode,size=FIRE_SIZE,tilt=0):
    axis=(np.arange(size,dtype=np.float32)+.5)*2/size-1
    x,y=np.meshgrid(axis,-axis)
    angle=math.radians(tilt)
    xx=x*math.cos(angle)+y*math.sin(angle)
    yy=-x*math.sin(angle)+y*math.cos(angle)
    r=np.hypot(xx,yy);a=np.arctan2(yy,xx)
    rp=pupil_radius(mode,a)/SHELL_RADIUS
    d=(r-rp)/np.maximum(.05,1-rp)
    # Static anatomy: irregular, fine charred iris fibers and branching fissures.
    anatomy=noise(np.cos(a)*9,np.sin(a)*9,np.maximum(d,0)*5)
    warp=noise(xx*4+7,yy*4-5,np.ones_like(x)*3)
    fibers=noise(np.cos(a)*71,np.sin(a)*71,d*3+warp)
    fissures=smooth(.42,.66,noise(np.cos(a)*29,np.sin(a)*29,d*2))
    return dict(mode=mode,size=size,x=xx,y=yy,r=r,a=a,rp=rp,d=d,
                anatomy=anatomy,fibers=fibers,fissures=fissures)


def fire_pixels(field,frame,variation=0):
    """Frame is continuous; frame+128 is exactly the same field.

    z = 8 d - 16 t transports texture OUTWARD; ignition fronts use the same
    positive radial delay. Domain warping folds each front into turbulent lobes.
    The pupil stays black; only its narrow edge reaches incandescent yellow.
    """
    t=(frame/FIRE_FRAMES)%1
    r,a,d=field['r'],field['a'],field['d']
    dp=np.maximum(d,0)
    z=8*dp-16*t
    ca,sa=np.cos(a),np.sin(a)
    curl=noise(ca*3.1+2,sa*3.1-1,z)
    bend=(curl-.5)*(.65,.78,.95)[variation]*smooth(0,.55,dp)
    nx=np.cos(a+bend)*5.2;ny=np.sin(a+bend)*5.2
    large=noise(nx,ny,z+curl*2)
    medium=noise(nx*2+3,ny*2-7,z*2+large)
    fine=noise(nx*4-2,ny*4+6,z*4+medium)
    tiny=noise(nx*9+11,ny*9+3,z*8)
    grain=noise(field['x']*113,field['y']*113,z*4)
    smoke=.38*large+.29*medium+.20*fine+.09*tiny+.04*grain
    strands=smooth(.35,.64,smoke)
    ridge=smooth(.48,.75,.65*fine+.35*tiny)
    # Two uneven eruptions per 5 1/3 s. Crest traverses the iris and rolls onto
    # the outer bowl; its darker wake restores the iris between eruptions.
    phase=(2*t-.82*dp+.08*(large-.5)+.035*np.sin(a*3))%1
    front=np.exp(-((phase-.22)/.12)**2)
    wake=np.exp(-((phase-.39)/.19)**2)
    if variation == 1:
        # A leading crest followed by a smaller turbulent echo, both outward.
        phase=(phase+.025*np.sin(a*5))%1
        front=.86*np.exp(-((phase-.19)/.09)**2)+.55*np.exp(-((phase-.39)/.075)**2)
        wake=np.exp(-((phase-.51)/.15)**2)
    elif variation == 2:
        # A broader billow that folds into irregular lobes across the shell.
        phase=(phase+.055*np.sin(a*4+large*2))%1
        front=np.exp(-((phase-.24)/.16)**2)*(.72+.38*large)
        wake=np.exp(-((phase-.46)/.18)**2)
    iris_mask=1-smooth(.66,.85,r)
    fibers=field['fibers']*(1-.88*field['fissures'])
    anatomy=(.18+.82*field['anatomy'])*fibers
    base=(.07+.30*anatomy)*iris_mask*(.70+.30*grain)
    # Ovine keeps a broader copper iris and less soot, preserving sheep anatomy.
    if field['mode']=='Ovine':base*=1.3
    edge_distance=(r-field['rp'])*SHELL_RADIUS
    edge=np.exp(-(edge_distance/(.003+.005*smoke))**2)
    collar=np.exp(-np.maximum(edge_distance,0)/.024)
    emission=(.95*front*strands+.40*wake*ridge)*smooth(.02,.18,dp)
    emission*=1-smooth(.83,1.03,r)
    heat=.82*edge*(.5+.5*fine)+.12*collar+emission
    heat+=.11*strands*smooth(.3,.8,dp)*(1-smooth(.85,1.04,r))
    # Charred vermilion/copper anatomy, ember smoke, orange tongues, gold cores.
    red=base+np.minimum(1,heat*1.75)
    green=base*.25+np.maximum(0,heat-.14)*1.05
    blue=base*.035+np.maximum(0,heat-.57)*.95
    # Soft local halo stays on the shell. No flat white ring or opaque fire disk.
    halo=(.025+.035*front)*np.exp(-((r-.80)/.19)**2)*(.2+.8*large)
    red+=halo;green+=halo*.18
    rgb=np.stack([red,green,blue],axis=-1)
    rgb*=smooth(-.004,.006,d)[...,None]
    rgb*= (1-smooth(.93,1.0,r))[...,None]
    return np.rint(np.clip(rgb,0,1)*255).astype(np.uint8)


def ovine_pixels(field,frame):
    """Seamless 16-second succession; preserve the approved first treatment.

    Blend into the next crest shape over the final 2/3 second of each section.
    Both fields share the same outgoing phase, including the final -> first cut.
    """
    position=frame % OVINE_FRAMES
    variation=int(position // FIRE_FRAMES)
    phase=position % FIRE_FRAMES
    pixels=fire_pixels(field,phase,variation)
    blend=float(smooth(FIRE_FRAMES-16,FIRE_FRAMES,phase))
    if blend:
        following=fire_pixels(field,phase,(variation+1)%len(RIPPLE_NAMES))
        pixels=np.rint(pixels*(1-blend)+following*blend).astype(np.uint8)
    return pixels

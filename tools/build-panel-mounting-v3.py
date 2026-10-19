"""Blender: build a local-bay panel mounting concept, not a fabrication design."""
from pathlib import Path
import bpy,math,json,re,bmesh
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1];SITE=ROOT/'site';OUT=ROOT.parent/'outputs/panel-mounting-v3';OUT.mkdir(parents=True,exist_ok=True)
DATA=json.loads(re.search(r'const DATA=(.*);\n',(SITE/'panels.html').read_text())[1]);panels=[p for p in DATA['panels'] if p['id'] in ['B-D-033','B-D-034']]
P=json.loads((SITE/'assets/subframe-parameters-v4.json').read_text());xs=[s['x_m'] for s in P['stations'] if s['id'] in ['C','D']]
U=P['upright_y_m'];S=P['sections_m']['upright'][0];HALF=S/2
def sy(old_y):return old_y+(1.3-U)
bpy.ops.wm.read_factory_settings(use_empty=True);objects=[];members=[]
COLORS={'station':(.10,.38,.60,1),'fixed':(.95,.48,.10,1),'cassette':(.06,.65,.57,1),'skin':(.42,.47,.53,1),'fastener':(.70,.75,.80,1),'isolation':(.85,.18,.48,1),'context':(.40,.32,.55,1),'dock':(.33,.47,.64,1),'stationbolt':(.82,.83,.87,1)}
M={}
for k,c in COLORS.items():
 m=bpy.data.materials.new('Mount_'+k);m.diffuse_color=c;m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=c;bs.inputs['Metallic'].default_value=.3;bs.inputs['Roughness'].default_value=.48;M[k]=m

def finish(o,name,g,moving=False,joint=''):
 o.name=name;o.data.materials.append(M[g]);o['mount_group']=g;o['moves_with_region']=moving;o['joint']=joint;o['status']='Concept only; sections, welds, bolts and movement allowance not sized';objects.append(o);return o

def box(name,c,size,g,moving=False,joint=''):
 bpy.ops.mesh.primitive_cube_add(size=1,location=c);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,g,moving,joint)

def tube(name,a,b,w,t,g,moving=False,joint=''):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();ref=Vector((0,0,1)) if abs(axis.z)<.9 else Vector((1,0,0));side=axis.cross(ref).normalized();up=side.cross(axis)
 outer=[(-w/2,-w/2),(w/2,-w/2),(w/2,w/2),(-w/2,w/2)];inner=[(-w/2+t,-w/2+t),(w/2-t,-w/2+t),(w/2-t,w/2-t),(-w/2+t,w/2-t)]
 verts=[p+side*x+up*y for p in [a,b] for ring in [outer,inner] for x,y in ring];faces=[]
 for i in range(4):
  j=(i+1)%4;faces += [(i,j,j+8,i+8),(i+4,i+12,j+12,j+4),(i,i+4,j+4,j),(i+8,j+8,j+12,i+12)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 members.append({'name':name,'group':g,'length_m':(b-a).length,'outside_m':w,'wall_m':t});return finish(o,name,g,moving,joint)

def cylinder(name,a,b,r,g,moving=False,joint='',vertices=16):
 a,b=Vector(a),Vector(b);v=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=v.length,location=(a+b)/2);o=bpy.context.object;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return finish(o,name,g,moving,joint)

def hole(o,center,r=.006):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=.12,location=center,rotation=(math.pi/2,0,0));cut=bpy.context.object
 bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Illustrative clearance hole','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)

def station_dock(label,x,z,key):
 # Provisional shop-prepared captive-nut cartridge within a full-depth sleeve.
 # The bus-facing sleeve end is flush; no nut, pad or bolt tail projects inward.
 # Cartridge manufacture, service access and all local strength checks are unresolved.
 front=box(label+' stationary front pad',(x,-U-HALF-.003,z),(.10,.006,.16),'dock',joint=key)
 flange=box(label+' removable arm root flange',(x,-U-HALF-.010,z),(.10,.008,.16),'fixed',joint=key)
 for dz in [-.04,.04]:
  zz=z+dz
  for plate in [front,flange]:hole(plate,(x,-U,zz),.007)
  hole(uprights[key[0]],(x,-U,zz),.016)
  sleeve=cylinder(label+' full-depth sleeve',(x,-U-HALF,zz),(x,-U+HALF,zz),.016,'dock',joint=key)
  hole(sleeve,(x,-U,zz),.007)
  nut=cylinder(label+' captive inner nut',(x,-U-.032,zz),(x,-U-.022,zz),.0105,'dock',joint=key,vertices=6)
  cutter=nut.copy();cutter.data=nut.data.copy();bpy.context.collection.objects.link(cutter);cutter.scale=(1.025,1.025,1.2)
  bpy.context.view_layer.objects.active=sleeve;mod=sleeve.modifiers.new('Internal captive hex pocket','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE';bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
  hole(nut,(x,-U,zz),.006)
  cylinder(label+' removable station bolt',(x,-U-.056,zz),(x,-U-.010,zz),.006,'stationbolt',joint=key)
  cylinder(label+' outer washer',(x,-U-.0551,zz),(x,-U-.0521,zz),.013,'stationbolt',joint=key)
  cylinder(label+' outer hex head',(x,-U-.0651,zz),(x,-U-.0551,zz),.0105,'stationbolt',joint=key,vertices=6)

# Exact station locations and 3-inch upright section from the six-station study.
uprights={}
for label,x in zip(['C','D'],xs):
 uprights[label]=tube(label+' driver upright',(x,-U,.5277625),(x,-U,3.15),.0762,.003175,'station')
 tube(label+' removable cap',(x,-U,3.15),(x,-U,3.33055),.0762,.003175,'context')
tube('Existing C-D side brace',(xs[0],-U,1.2),(xs[1],-U,3.12),.0381,.003175,'context')
# The current upper longitudinal is rectangular; preserve its actual envelope here.
box('Existing roof longitudinal',(sum(xs)/2,-U,3.30515),(xs[1]-xs[0],.0762,.1524),'context')
LOW=2.703;HIGH=3.08;Y=-2.02
for label,x in zip(['C','D'],xs):
 for level,z in [('lower',LOW),('upper',HIGH)]:
  key=label+'-'+level
  root_z=z-.08 if level=='upper' else z # Keep upper sleeve clear of the existing D brace node at z=3.12.
  station_dock(key,x,root_z,key)
  tube(key+' outrigger',(x,sy(-1.3521),root_z),(x,-1.98,z),.05,.003,'fixed',joint=key)
  fixed=box(key+' fixed receiver plate',(x,-1.984,z),(.16,.008,.11),'fixed',joint=key)
  iso=box(key+' isolating pad',(x,-1.990,z),(.16,.004,.11),'isolation',joint=key)
  moving=box(key+' removable flange',(x,-1.996,z),(.16,.008,.11),'cassette',True,key)
  for dx in [-.055,.055]:
   for plate in [fixed,iso,moving]:hole(plate,(x+dx,-1.99,z))
   cylinder(key+' retainer bolt',(x+dx,-2.010,z),(x+dx,-1.958,z),.005,'fastener',False,key)
   cylinder(key+' hex head',(x+dx,-2.014,z),(x+dx,-2.007,z),.009,'fastener',False,key,6)
   cylinder(key+' washer',(x+dx,-2.007,z),(x+dx,-2.004,z),.011,'fastener',False,key)
   nut=cylinder(key+' nut',(x+dx,-1.976,z),(x+dx,-1.968,z),.009,'fastener',False,key,6);hole(nut,(x+dx,-1.97,z),.005)
 if label:
  key=label+'-lower'
  tube(label+' lower outrigger brace',(x,sy(-1.3521),2.13),(x,-1.955,LOW-.026),.0381,.003175,'fixed',joint=key)
  station_dock(label+'-brace-foot',x,2.13,key)
  box(label+' gravity seat',(x,-2.02,2.675),(.17,.10,.010),'fixed',joint=key)
  box(label+' seat isolator',(x,-2.02,2.6815),(.12,.06,.003),'isolation',joint=key)
 tube(label+' cassette back upright',(x,Y,LOW),(x,Y,HIGH),.04,.002,'cassette',True)
for name,z in [('bottom',LOW),('top',HIGH)]:tube('Cassette '+name+' rail',(xs[0],Y,z),(xs[1],Y,z),.04,.002,'cassette',True)
# Faceted backing follows the existing panel edges. Six-millimetre seams are grouped.
points=[];edges=set()
for p in panels:
 indices=[]
 for v in p['vertices_m']:
  candidate=Vector(v)+Vector((0,.025,0));idx=next((i for i,q in enumerate(points) if (q-candidate).length<.012),None)
  if idx is None:idx=len(points);points.append(candidate)
  indices.append(idx)
 for i,j in zip(indices,indices[1:]+indices[:1]):edges.add(tuple(sorted((i,j))))
for i,j in sorted(edges):tube('Facet backing edge '+str((i,j)),points[i],points[j],.025,.002,'cassette',True)
for i,p in enumerate(points):
 # Rear pickup ties each facet corner to the nearby end of the cassette's back frame.
 x=xs[0] if p.x<sum(xs)/2 else xs[1];z=LOW if p.z<3.2 else HIGH
 tube('Facet corner pickup '+str(i),(x,Y,z),p,.025,.002,'cassette',True)
for p in panels:
 v=[Vector(x) for x in p['vertices_m']];mesh=bpy.data.meshes.new(p['id']);mesh.from_pydata(v,[],[list(range(len(v)))]);mesh.update();o=bpy.data.objects.new(p['id'],mesh);bpy.context.collection.objects.link(o);o['panel_id']=p['id'];o['net_area_m2']=p['net_area_m2']
 finish(o,p['id']+' existing skin','skin',True);mod=o.modifiers.new('Existing 0.063 inch sheet','SOLIDIFY');mod.thickness=.0016002
 # Illustrative screws and solid backer pads; this is not a fastener spacing schedule.
 for i,(a,b) in enumerate(zip(v,v[1:]+v[:1])):
  mid=(a+b)/2;center=(sum(v,Vector())/len(v));point=mid+(center-mid).normalized()*.025
  n=Vector(p['normal']).normalized();u=(b-a).normalized();vaxis=n.cross(u).normalized();rot=Matrix((u,vaxis,n)).transposed().to_quaternion()
  tabcenter=mid+Vector((0,.025,0))+(point-mid)/2-n*.014
  tab=box(p['id']+' solid attachment tab '+str(i),tuple(tabcenter),(.07,.07,.003),'cassette',True);tab.rotation_mode='QUATERNION';tab.rotation_quaternion=rot
  pad=box(p['id']+' isolation pad '+str(i),tuple(point+n*.004),(.03,.03,.006),'isolation',True);pad.rotation_mode='QUATERNION';pad.rotation_quaternion=rot
  cylinder(p['id']+' panel fastener '+str(i),point-n*.008,point+n*.025,.003,'fastener',True)
  cylinder(p['id']+' panel washer '+str(i),point-n*.011,point-n*.008,.009,'fastener',True)

def export(name,transport=False):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:
  if not transport or o['mount_group'] in ['station','dock','context']:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(SITE/'assets/models'/name),export_format='GLB',use_selection=True,export_extras=True,export_animations=False)
export('baaabs-panel-mounting-v3.glb')
export('baaabs-panel-mounting-v3-transport.glb',transport=True)
# Weight of the drawn concept only; perforation discount applies to original sheets.
mass={};moving_kg=0;arm_mass={};deps=bpy.context.evaluated_depsgraph_get()
for o in objects:
 g=o['mount_group']
 if g in ['station','context']:continue
 if g=='skin':kg=o['net_area_m2']*.0016002*2700*.67
 else:
  ev=o.evaluated_get(deps);mesh=ev.to_mesh();bm=bmesh.new();bm.from_mesh(mesh);volume=abs(bm.calc_volume(signed=True));bm.free();ev.to_mesh_clear();kg=volume*({'cassette':2700,'fixed':7850,'fastener':7850,'isolation':1200,'dock':7850,'stationbolt':7850}[g])
 mass[g]=mass.get(g,0)+kg
 if o['moves_with_region']:moving_kg+=kg
 elif g in ['fixed','isolation','fastener']:arm_mass[o['joint']]=arm_mass.get(o['joint'],0)+kg
report={'status':'Illustrative mounting concept, not load-rated or fabrication-ready','region':'Driver middle upper flank','panels':[p['id'] for p in panels],'stations':['C','D'],'station_span_m':xs[1]-xs[0],'outrigger_reach_m':1.98-(U+HALF+.014),'removable_arm_assemblies_kg':{k:round(v,2) for k,v in arm_mass.items()},'transport':{'bare_station_width_in':(2*P['upright_y_m']+P['sections_m']['upright'][0])/.0254,'width_with_mirrored_docking_pads_in':2*(U+HALF+.006)/.0254,'standard_WA_width_in':102,'road_configuration_verified':False,'retained_groups':['station','dock','context'],'note':'Local bay only. All projecting mounts and their bolts removed. Existing frame references remain; whole-vehicle road clearance is not established.'},'skin_outward_offset_from_uprights_m':[min(-v[1]-U for p in panels for v in p['vertices_m']),max(-v[1]-U for p in panels for v in p['vertices_m'])],'side_fit':P['side_fit'],'station_connection':'Internal captive-nut cartridge and flush bus-facing sleeve end; no inward nut cage or bolt tail. Not load-rated; manufacture and service access unresolved.','mass_kg':{k:round(v,2) for k,v in mass.items()},'moving_region_kg':round(moving_kg,2),'added_mounting_kg':round(sum(mass.values())-mass['skin'],2),'members':members,'limits':['No strength, fatigue, weld, bolt, panel pull-through or chassis torsion calculation','Internal captive-nut cartridge manufacture, replacement access and connection capacity remain unresolved','Illustrative 10 mm cassette bolts and 12 mm short station bolts, not selected hardware','Sleeve welds, upright holes, bolt bearing and local wall capacity unverified','Current station width exceeds the standard 102-inch WA width before mounting pads','No speaker loads assigned to this cassette','Thermal and chassis movement accommodation not designed','Panel fastener positions are illustrative; isolation sleeves and full edge support require detailing']}
(SITE/'assets/panel-mounting-v3.json').write_text(json.dumps(report,indent=2));(OUT/'validation.json').write_text(json.dumps(report,indent=2))
# Removable assembly lifted above its seats then pulled outward; bolts withdrawn separately.
original={o.name:o.location.copy() for o in objects}
for o in objects:
 if o['moves_with_region']:o.location+=Vector((0,-.90,.14))
 elif o['mount_group'] in ['fixed','isolation']:o.location+=Vector((0,-.32,0))
 elif o['mount_group']=='stationbolt':o.location+=Vector((0,-.16,0))
 elif o['mount_group']=='fastener':o.location+=Vector((0,-.65,0))
export('baaabs-panel-mounting-v3-exploded.glb')
# Offline visual inspection in three useful views.
s=bpy.context.scene;s.render.engine='BLENDER_WORKBENCH';s.render.resolution_x=1600;s.render.resolution_y=1100;s.render.resolution_percentage=100
s.display.shading.light='STUDIO';s.display.shading.color_type='MATERIAL';s.display.shading.show_shadows=True;s.display.shading.show_cavity=True;s.display.shading.cavity_type='BOTH';s.display.shading.background_type='WORLD';s.world=bpy.data.worlds.new('World');s.world.color=(.09,.10,.12)
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.type='ORTHO'
def render(name,pos,target,scale):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;s.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
render('exploded',(-5,-9,5.6),(.7,-2.0,2.6),5.5)
for o in objects:o.location=original[o.name]
render('assembled-back',(5,2,4.7),(.7,-1.9,2.5),4.7)
for o in objects:o.hide_render=o['mount_group'] not in ['station','dock','context']
render('arms-removed',(-4,-6,4),(.7,-U,2.1),4.7)
for o in objects:o.hide_render=o['joint']!='C-lower' and o['mount_group']!='station'
render('station-connection',(-1.6,-2.1,3.17),(-.85,-U,2.703),.50)
for o in objects:o.hide_render=o['joint']!='C-lower' and o['mount_group'] not in ['cassette','station']
render('lower-connection',(-1.6,-2.7,3.25),(-.85,-1.96,2.70),.65)
print(json.dumps({k:v for k,v in report.items() if k!='members'},indent=2))

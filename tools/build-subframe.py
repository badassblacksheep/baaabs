from pathlib import Path
import json,struct,copy,math,csv,hashlib,shutil,zipfile
ROOT=next(p for p in Path(__file__).resolve().parents if (p/'baaabs/site').is_dir());SITE=ROOT/'baaabs/site';OUT=ROOT/'assets/3d/baaabs-subframe-study-v5';OUT.mkdir(exist_ok=True)
P=json.loads((SITE/'assets/subframe-parameters-v5.json').read_text());D=P['donor'];F=P['deck'];U=P['upright_y_m']
src=SITE/'assets/models/baaabs-subframe-study-v1.glb';raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=bytearray(raw[28+n:]);before=copy.deepcopy(doc)
manifest=json.loads((SITE/'assets/subframe-study-v1.json').read_text());groups=manifest['materials'];members=[]
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def add(a,b):return tuple(x+y for x,y in zip(a,b))
def mul(a,k):return tuple(x*k for x in a)
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a):return mul(a,1/math.sqrt(dot(a,a)))
def gl(p):return (p[0],p[2],-p[1])
def mat(name,group,color):
 name='Study_'+group+'_'+name;idx=len(doc['materials']);doc['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':.35,'roughnessFactor':.65},'doubleSided':True});groups[name]={'group':group,'color':color,'emissive':[0,0,0],'alphaMode':'OPAQUE'};return idx
M={'stations':mat('steel','stations',[.12,.5,.65,1]),'deckframe':mat('steel','deckframe',[.9,.45,.12,1]),'bracing':mat('steel','bracing',[.52,.34,.72,1]),'mounts':mat('envelopes','mounts',[.9,.12,.5,1]),'plywood':mat('black_boards','deck',[.025,.025,.028,1]),'chassis':mat('C_channels','chassis',[.10,.115,.13,1])}
def accessor(values,kind):
 flat=[v for row in values for v in row];start=len(binary);binary.extend(struct.pack('<'+'f'*len(flat),*flat));vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(flat)*4,'target':34962});ai=len(doc['accessors']);a={'bufferView':vi,'componentType':5126,'count':len(values),'type':'VEC3'}
 if kind=='POSITION':a.update(min=[min(row[i] for row in values) for i in range(3)],max=[max(row[i] for row in values) for i in range(3)])
 doc['accessors'].append(a);return ai
changed_nodes=set()
def mesh(name,vertices,faces,material,group,node=None):
 verts=[];normals=[]
 for f in faces:
  for i in range(1,len(f)-1):
   tri=[gl(vertices[k]) for k in (f[0],f[i],f[i+1])];nn=norm(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])));verts.extend(tri);normals.extend([nn]*3)
 mi=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':[{'attributes':{'POSITION':accessor(verts,'POSITION'),'NORMAL':accessor(normals,'NORMAL')},'material':material}]})
 if node is None:
  node={'name':name,'extras':{'component':group,'provisional':True}};idx=len(doc['nodes']);doc['nodes'].append(node);doc['scenes'][doc.get('scene',0)]['nodes'].append(idx)
 else:
  changed_nodes.add(doc['nodes'].index(node))
  for k in ['matrix','translation','rotation','scale']:node.pop(k,None)
 node['mesh']=mi
 return node
facesbox=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def box(name,c,size,material,group,node=None):
 v=[(c[0]+x*size[0]/2,c[1]+y*size[1]/2,c[2]+z*size[2]/2) for z in [-1,1] for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]];return mesh(name,v,facesbox,material,group,node)
def beam(name,a,b,section,group,station='',basis=''):
 w,h,t=section;axis=norm(sub(b,a));ref=(0,0,1) if abs(axis[2])<.9 else (1,0,0);side=norm(cross(axis,ref));up=cross(side,axis)
 # Rectangular hollow section, longitudinal dimensions measured between centerline endpoints.
 outer=[(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)];inner=[(-w/2+t,-h/2+t),(w/2-t,-h/2+t),(w/2-t,h/2-t),(-w/2+t,h/2-t)]
 v=[add(p,add(mul(side,x),mul(up,y))) for p in [a,b] for ring in [outer,inner] for x,y in ring];ff=[]
 for i in range(4):
  j=(i+1)%4;ff += [(i,j,j+8,i+8),(i+4,i+12,j+12,j+4),(i,i+4,j+4,j),(i+8,j+8,j+12,i+12)]
 mesh(name,v,ff,M[group],group);length=math.dist(a,b);mass=(w*h-(w-2*t)*(h-2*t))*length*7850
 members.append({'id':name,'group':group,'station':station,'start_m':list(a),'end_m':list(b),'length_m':round(length,5),'width_m':w,'depth_m':h,'wall_m':t,'approx_kg':round(mass,2),'basis':basis or 'Trial section, not load-rated; connection and cut allowances excluded'})
# Replace inherited generic rail boxes with manufacturer-family C sections, opening inward.
for node in doc['nodes'][:]:
 if 'Chassis_rail' not in node.get('name',''):continue
 y=-node['translation'][2];sgn=1 if y>0 else -1;depth,flange,t=D['rail_section_m'];z=D['rail_center_z_m'];L=D['rail_length_m'];outer_y=y+sgn*flange/2
 profile=[(outer_y,z-depth/2),(outer_y,z+depth/2),(outer_y-sgn*flange,z+depth/2),(outer_y-sgn*flange,z+depth/2-t),(outer_y-sgn*t,z+depth/2-t),(outer_y-sgn*t,z-depth/2+t),(outer_y-sgn*flange,z-depth/2+t),(outer_y-sgn*flange,z-depth/2)]
 v=[(x,yy,zz) for x in [-L/2,L/2] for yy,zz in profile];ff=[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
 # End caps as three rectangles rather than a concave polygon fan.
 ff.extend([(0,1,4,5),(1,2,3,4),(0,5,6,7),(8,13,12,9),(9,12,11,10),(8,15,14,13)])
 mesh(node['name']+'_period_reference',v,ff,M['chassis'],'chassis',node)
# Thin, black plywood replaces deep visual slab in STUDY only; preserve floor surface and rail alignment.
boards=[n for n in doc['nodes'] if n.get('extras',{}).get('component')=='deck'];assert len(boards)==12
for i,node in enumerate(sorted(boards,key=lambda n:n['name'])):
 length=F['length_m']/12;cx=-F['length_m']/2+(i+.5)*length
 box(node['name'],(cx,0,F['surface_z_m']-F['plywood_thickness_m']/2),(length-.006,F['width_m'],F['plywood_thickness_m']),M['plywood'],'deck',node)
S=P['sections_m'];floorbottom=F['surface_z_m']-F['plywood_thickness_m'];headerz=floorbottom-S['header'][1]/2;crossz=D['rail_center_z_m']-D['rail_section_m'][0]/2-S['crossbearer'][1]/2;postbottom=crossz+S['crossbearer'][1]/2
stations=P['stations'];xs=[s['x_m'] for s in stations]
for st in stations:
 x=st['x_m'];k=st['id'];beam(k+'-CB',(x,-U,crossz),(x,U,crossz),S['crossbearer'],'stations',k)
 for side,y in [('D',-U),('P',U)]:
  beam(k+'-'+side+'-UP',(x,y,postbottom),(x,y,P['permanent_top_z_m']),S['upright'],'stations',k)
  beam(k+'-'+side+'-CAP',(x,y,P['permanent_top_z_m']),(x,y,headerz),S['upright'],'deckframe',k)
  # Small solid blocks designate attachment study zones, NOT plates/bolt patterns.
 for side,y in [('D',-D['rail_center_y_m']),('P',D['rail_center_y_m'])]:box(k+'-'+side+'-mount-zone',(x,y,postbottom+.0125),(.24,.18,.025),M['mounts'],'mounts')
 beam(k+'-TOP',(x,-U,headerz),(x,U,headerz),S['header'],'deckframe',k)
# Split longitudinal beams at stations to show removable regions. No unsupported assertion these are hand-liftable.
ends=[-F['length_m']/2,*xs,F['length_m']/2]
for side,y in [('D',-U),('P',U)]:
 for i,(a,b) in enumerate(zip(ends,ends[1:])):beam(f'DECK-{side}-L{i+1:02}',(a,y,floorbottom-S['longitudinal'][1]/2),(b,y,floorbottom-S['longitudinal'][1]/2),S['longitudinal'],'deckframe')
# Joists and board breaks share the same support grid: <=16 inch spacing, all board ends supported.
board_length=F['length_m']/12;joistxs=sorted(set(round(-F['length_m']/2+(i+j/3)*board_length,7) for i in range(12) for j in range(4)))
for i,x in enumerate(joistxs):
 beam(f'DECK-J{i+1:02}',(x,-U+S['longitudinal'][0]/2,floorbottom-S['joist'][1]/2),(x,U-S['longitudinal'][0]/2,floorbottom-S['joist'][1]/2),S['joist'],'deckframe')
# Removable side diagonals. Kept outside the body, no braces across occupied bus interior.
for side,y in [('D',-U),('P',U)]:
 for i,(a,b) in enumerate(zip(xs,xs[1:])):
  # One diagonal per bay avoids pretending two crossing tubes can occupy the same plane.
  low,high=(a,b) if i%2==0 else (b,a)
  beam(f'BR-{side}-{stations[i]["id"]}{stations[i+1]["id"]}',(low,y,1.2),(high,y,3.12),S['brace'],'bracing')
# In-plane deck diagonals; beneath joists, above roof envelope. Joints remain schematic.
for i,(a,b) in enumerate(zip(xs,xs[1:])):
 beam(f'BR-DECK-{i+1}',(a,-1.2,3.27),(b,1.2,3.27),S['brace'],'bracing')
# Preserve every other original node and all original geometry bytes.
assert bytes(binary[:len(raw)-28-n])==raw[28+n:]
assert len(changed_nodes)==14
for i,node in enumerate(before['nodes']):
 if i not in changed_nodes:assert node==doc['nodes'][i]
assert max(b-a for a,b in zip(joistxs,joistxs[1:]))<=F['joist_max_spacing_m']
assert len(stations)==6
assert abs(U-S['upright'][0]/2-D['width_m']/2-P['side_fit']['modeled_rub_rail_projection_m']-P['side_fit']['provisional_clearance_m'])<1e-8
assert abs(xs[1]-S['upright'][1]/2-(D['front_axle_x_m']+.60)-P['wheelwell_post_clearance_m'])<1e-6
assert abs((D['rear_axle_x_m']-.60)-(xs[3]+S['upright'][1]/2)-P['wheelwell_post_clearance_m'])<1e-6
assert xs[-1]+S['upright'][1]/2<F['length_m']/2
assert min(xs)>-4.98 # behind approved door opening
assert floorbottom-S['header'][1]>D['height_m']
doc['buffers'][0]['byteLength']=len(binary);encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);binary.extend(b'\0'*(-len(binary)%4));result=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\0')+binary
name='baaabs-subframe-study-v5.glb';(OUT/name).write_bytes(result);(SITE/'assets/models'/name).write_bytes(result)
steel=sum(m['approx_kg'] for m in members);wood=F['length_m']*F['width_m']*F['plywood_thickness_m']*600
used_material_names={doc['materials'][p['material']]['name'] for node in doc['nodes'] if 'mesh' in node for p in doc['meshes'][node['mesh']]['primitives']}
groups={k:v for k,v in groups.items() if k in used_material_names}
manifest.update(revision=P['revision'],geometry_unchanged=False,parameters=P,materials=groups,member_count=len(members),changed_reference_nodes=14,new_mesh_count=len(doc['nodes'])-len(before['nodes']),notes=P['status'],mass_budget={'tube_steel_kg':round(steel,1),'plywood_kg':round(wood,1),'subtotal_kg':round(steel+wood,1),'excludes':'Brackets, bolts, rails, panels, head, speakers, generator, fluids, people; plywood density and steel corners approximate'},checks={'unchanged_other_reference_nodes':len(before['nodes'])-14,'original_binary_preserved':True,'maximum_joist_spacing_m':max(b-a for a,b in zip(joistxs,joistxs[1:])),'minimum_header_roof_gap_m':floorbottom-S['header'][1]-D['height_m'],'door_rear_edge_to_A_post_m':xs[0]-S['upright'][1]/2-(-4.98),'underbody_clearance_verified':False,'strength_verified':False})
(OUT/'study-manifest.json').write_text(json.dumps(manifest,indent=2));(SITE/'assets/subframe-study-v5.json').write_text(json.dumps(manifest,separators=(',',':')))
(OUT/'members.json').write_text(json.dumps(members,indent=2))
with (OUT/'members.csv').open('w') as f:
 writer=csv.DictWriter(f,fieldnames=members[0].keys());writer.writeheader();writer.writerows(members)
shutil.copy2(Path(__file__),OUT/'build.py')
(OUT/'parameters.json').write_text(json.dumps(P,indent=2))
shutil.copy2(OUT/'parameters.json',SITE/'assets/subframe-parameters-v5.json');shutil.copy2(OUT/'members.csv',SITE/'assets/subframe-members-v5.csv')
print(json.dumps({k:manifest[k] for k in ['member_count','new_mesh_count','mass_budget','checks']},indent=2))

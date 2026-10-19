from pathlib import Path
import json,struct,math
ROOT=Path(__file__).resolve().parents[1];SITE=ROOT/'site'
def bounds(file):
 raw=file.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);buf=raw[28+n:];out=[]
 for node in doc['nodes']:
  if 'mesh' not in node:continue
  assert not node.get('children'),node['name']
  pts=[]
  for prim in doc['meshes'][node['mesh']]['primitives']:
   a=doc['accessors'][prim['attributes']['POSITION']];v=doc['bufferViews'][a['bufferView']];assert a['componentType']==5126
   offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12)
   for i in range(a['count']):
    p=list(struct.unpack_from('<fff',buf,offset+i*stride));p=[p[k]*node.get('scale',[1,1,1])[k] for k in range(3)]
    x,y,z,w=node.get('rotation',[0,0,0,1]);u=[x,y,z]
    cross=lambda a,b:[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
    uv=cross(u,p);uuv=cross(u,uv);p=[p[k]+2*(w*uv[k]+uuv[k]) for k in range(3)]
    p=[p[k]+node.get('translation',[0,0,0])[k] for k in range(3)]
    assert 'matrix' not in node,node['name']
    pts.append([p[0],-p[2],p[1]])
  out.append({'name':node['name'],'extras':node.get('extras',{}),'min':[min(p[k] for p in pts) for k in range(3)],'max':[max(p[k] for p in pts) for k in range(3)]})
 return out
study=bounds(SITE/'assets/models/baaabs-subframe-study-v4.glb');mount=bounds(SITE/'assets/models/baaabs-panel-mounting-v3.glb')
bus=[n for n in study if n['extras'].get('component')=='bus'];P=json.loads((SITE/'assets/subframe-parameters-v4.json').read_text());U=P['upright_y_m'];half=P['sections_m']['upright'][0]/2
rows=[]
for s in P['stations']:
 for side in [-1,1]:
  post=next(n for n in study if n['name']==s['id']+('-D-UP' if side<0 else '-P-UP'))
  nearby=[n for n in bus if n['min'][0]<=post['max'][0] and n['max'][0]>=post['min'][0] and n['min'][2]<=post['max'][2] and n['max'][2]>=post['min'][2]]
  outer=lambda n:n['max'][1] if side==1 else -n['min'][1]
  limit=max(nearby,key=outer);inner=post['min'][1] if side==1 else -post['max'][1]
  gap=inner-outer(limit);assert abs(gap-.006)<1e-5,(post['name'],gap)
  rows.append({'station':s['id'],'side':'passenger' if side==1 else 'driver','limiting_bus_part':limit['name'],'upright_gap_m':round(gap,6)})
checks=[]
for a in mount:
 if a['extras'].get('mount_group') not in ['dock','stationbolt']:continue
 # Every cartridge, sleeve, pad and bolt remains outboard of the tube's inner face.
 assert a['max'][1]<=-U+half+1e-6,(a['name'],a['max'][1])
 nearby=[n for n in bus if n['min'][0]<=a['max'][0] and n['max'][0]>=a['min'][0] and n['min'][2]<=a['max'][2] and n['max'][2]>=a['min'][2]]
 if nearby:
  n=min(nearby,key=lambda n:n['min'][1]);gap=n['min'][1]-a['max'][1];assert gap>.006-1e-5,(a['name'],gap)
  checks.append({'part':a['name'],'bus_part':n['name'],'gap_m':round(gap,6)})
report={'basis':'Exported model geometry; approximate donor details, not a measured vehicle. Axis-aligned bounds are conservative for sloped surfaces.','donor_specified_body_width_in':96,'bare_station_width_in':round((2*U+2*half)/.0254,4),'upright_clearances':rows,'hardware_clearances':checks,'all_mounting_hardware_within_bus_facing_upright_plane':True,'field_clearance_and_movement_verified':False}
print(json.dumps(report,indent=2))

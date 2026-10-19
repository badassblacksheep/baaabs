"""Combine the unchanged v24 panels with the existing six-station study framing."""
from pathlib import Path
import copy,json,struct,collections,hashlib
ROOT=Path(__file__).resolve().parents[1];SITE=ROOT/'site'

def read(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
 return json.loads(raw[20:20+n]),bytearray(raw[28+n:])
base=SITE/'assets/models/baaabs-panelized-v24.glb';study=SITE/'assets/models/baaabs-subframe-study-v3.glb'
doc,binary=read(base);original=copy.deepcopy(doc);src,buf=read(study)
views={};accessors={};materials={}
def import_accessor(i):
 if i in accessors:return accessors[i]
 a=copy.deepcopy(src['accessors'][i]);assert 'sparse' not in a
 v=a['bufferView']
 if v not in views:
  view=copy.deepcopy(src['bufferViews'][v]);start=view.get('byteOffset',0);binary.extend(b'\0'*(-len(binary)%4));view['byteOffset']=len(binary);view['buffer']=0
  binary.extend(buf[start:start+view['byteLength']]);views[v]=len(doc['bufferViews']);doc['bufferViews'].append(view)
 a['bufferView']=views[v];accessors[i]=len(doc['accessors']);doc['accessors'].append(a);return accessors[i]
def import_mesh(i):
 mesh=copy.deepcopy(src['meshes'][i])
 for p in mesh['primitives']:
  assert not p.get('targets') and not p.get('extensions')
  p['attributes']={k:import_accessor(v) for k,v in p['attributes'].items()}
  if 'indices'in p:p['indices']=import_accessor(p['indices'])
  m=p['material']
  if m not in materials:
   mat=copy.deepcopy(src['materials'][m]);assert 'baseColorTexture' not in mat.get('pbrMetallicRoughness',{})
   materials[m]=len(doc['materials']);doc['materials'].append(mat)
  p['material']=materials[m]
 i=len(doc['meshes']);doc['meshes'].append(mesh);return i
added=[];replaced=[]
byname={n.get('name'):n for n in doc['nodes']}
for node in src['nodes']:
 c=node.get('extras',{}).get('component');name=node.get('name','')
 if c not in ['stations','deckframe','bracing','mounts','deck'] and 'Chassis_rail' not in name:continue
 new=copy.deepcopy(node);new['mesh']=import_mesh(node['mesh'])
 if c=='deck' or 'Chassis_rail' in name:
  target=byname[name]
  for key in ['matrix','translation','rotation','scale']:target.pop(key,None)
  target.update(new);replaced.append(name)
 else:
  doc['scenes'][doc.get('scene',0)]['nodes'].append(len(doc['nodes']));doc['nodes'].append(new);added.append(name)
# Independent visibility materials; retain Panel_ID names for selection and inspection.
clones={};counts=collections.Counter()
def group(n):
 c=n.get('extras',{}).get('component');name=n.get('name','')
 if c in ['stations','mounts'] or c=='bracing' and not name.startswith('BR-DECK'):return 'subframe'
 if c in ['deckframe','bracing']:return 'deckframe'
 if c in ['shell','head','hooves','head_join','eye_effect']:return 'panels'
 if c=='deck':return 'deck'
 if c=='bus':return 'bus'
 return 'equipment'
for n in doc['nodes']:
 if 'mesh' not in n:continue
 g=group(n);counts[g]+=1
 mesh=copy.deepcopy(doc['meshes'][n['mesh']]);n['mesh']=len(doc['meshes']);doc['meshes'].append(mesh)
 for p in mesh['primitives']:
  key=(g,p.get('material'))
  if key not in clones:
   m=copy.deepcopy(doc['materials'][key[1]]) if key[1] is not None else {}
   name=m.get('name','material')
   if not name.startswith('Panel_'):m['name']='Workshop_'+g+'_'+name
   clones[key]=len(doc['materials']);doc['materials'].append(m)
  p['material']=clones[key]
# Original node transforms and geometry accessors remain exact except the 14 reference replacements.
for a,b in zip(original['nodes'],doc['nodes']):
 if a.get('name') in replaced:continue
 assert {k:v for k,v in a.items() if k!='mesh'}=={k:v for k,v in b.items() if k!='mesh'}
 if 'mesh'in a:
  for p,q in zip(original['meshes'][a['mesh']]['primitives'],doc['meshes'][b['mesh']]['primitives']):
   assert {k:v for k,v in p.items() if k!='material'}=={k:v for k,v in q.items() if k!='material'}
assert len(replaced)==14 and len(added)==114
for name in replaced:
 a=next(n for n in src['nodes'] if n.get('name')==name);b=byname[name]
 for key in ['matrix','translation','rotation','scale']:assert a.get(key)==b.get(key)
panelids={n.get('extras',{}).get('panel_id') for n in doc['nodes']}-{None};assert len(panelids)==206
assert doc.get('animations')==original.get('animations')
doc['buffers'][0]['byteLength']=len(binary);encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);binary.extend(b'\0'*(-len(binary)%4))
result=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\0')+binary
(SITE/'assets/models/baaabs-workshop-v24-six-station.glb').write_bytes(result)
report={'panel_revision':'v24','framing_revision':'subframe-study-v3','panel_count':206,'panels_and_animations_unchanged':True,'added_frame_nodes':len(added),'reference_replacements':replaced,'layer_counts':dict(counts),'base_sha256':hashlib.sha256(base.read_bytes()).hexdigest(),'study_sha256':hashlib.sha256(study.read_bytes()).hexdigest()}
print(json.dumps(report,indent=2))

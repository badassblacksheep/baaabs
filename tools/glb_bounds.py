"""Static world-space mesh bounds for exported GLBs, including parent transforms."""
import json,struct

def transform(p,node):
 if 'matrix' in node:
  m=node['matrix'];return [sum(m[4*j+i]*p[j] for j in range(3))+m[12+i] for i in range(3)]
 p=[p[k]*node.get('scale',[1,1,1])[k] for k in range(3)]
 x,y,z,w=node.get('rotation',[0,0,0,1]);u=[x,y,z]
 cross=lambda a,b:[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
 uv=cross(u,p);uuv=cross(u,uv)
 return [p[k]+2*(w*uv[k]+uuv[k])+node.get('translation',[0,0,0])[k] for k in range(3)]

def bounds(file):
 raw=file.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);buf=raw[28+n:];out=[]
 parents={}
 for i,node in enumerate(doc['nodes']):
  for child in node.get('children',[]):
   assert child not in parents,'Multiple node parents require scene-instance handling'
   parents[child]=i
 for ni,node in enumerate(doc['nodes']):
  if 'mesh' not in node:continue
  chain=[ni]
  while chain[-1] in parents:
   parent=parents[chain[-1]];assert parent not in chain,'Cyclic node hierarchy';chain.append(parent)
  pts=[]
  for prim in doc['meshes'][node['mesh']]['primitives']:
   a=doc['accessors'][prim['attributes']['POSITION']];v=doc['bufferViews'][a['bufferView']];assert a['componentType']==5126 and 'sparse' not in a
   offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12)
   for i in range(a['count']):
    p=list(struct.unpack_from('<fff',buf,offset+i*stride))
    for idx in chain:p=transform(p,doc['nodes'][idx])
    pts.append([p[0],-p[2],p[1]])
  out.append({'name':node['name'],'extras':node.get('extras',{}),'min':[min(p[k] for p in pts) for k in range(3)],'max':[max(p[k] for p in pts) for k in range(3)]})
 return out

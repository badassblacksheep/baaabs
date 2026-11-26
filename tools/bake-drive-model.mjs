// Run after bake-structural06.mjs to refresh the checked-in driving mesh.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {Geometry,rgb,add,mul,cross} from '../site/assets/models/playa/geometry.js';
function transform(p,n){
  if(n.matrix){const m=n.matrix;return [0,1,2].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]);}
  const s=n.scale||[1,1,1], t=n.translation||[0,0,0], q=n.rotation||[0,0,0,1];
  const v=p.map((x,i)=>x*s[i]), r=cross(q,v);
  return add(t,add(v,mul(add(mul(r,q[3]),cross(q,r)),2)));
}
function bakeVehicle(data){
  const dv=new DataView(data), len=dv.getUint32(12,true);
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,len))), offset=28+len;
  function accessor(id){
    const a=doc.accessors[id], b=doc.bufferViews[a.bufferView], type={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];
    return new type(data,offset+(b.byteOffset||0)+(a.byteOffset||0),a.count*(a.type==='VEC3'?3:a.type==='VEC2'?2:1));
  }
  const model=new Geometry(), outlets=[];
  function visit(id,parents){
    const n=doc.nodes[id], chain=[n,...parents];
    for(const prim of doc.meshes[n.mesh]?.primitives||[]){
      const eye=/^Eye_([LR])_Hypnotoad_frame_00$/.exec(n.name);
      if(n.extras?.component==='eye_effect' && !eye)continue;
      // Frame zero can be hidden by an animation scale. Bake both caps at full size.
      const transforms=eye?chain.map(node=>node.scale?.every(v=>v===0)?{...node,scale:[1,1,1]}:node):chain;
      const pos=accessor(prim.attributes.POSITION), idx=accessor(prim.indices), mat=doc.materials[prim.material];
      if(mat.name==='Workshop_bus_DJ_Glazing')continue; // See through the windows in this opaque-only renderer.
      const points=[];
      for(let i=0;i<pos.length;i+=3)points.push(transforms.reduce(transform,Array.from(pos.subarray(i,i+3))));
      const component=n.extras?.component, panel=mat.name.startsWith('Panel_');
      let color=rgb(0x777277);
      if(panel){const shade=42+(id*17)%32;color=[shade*.94,shade,shade*1.16].map(v=>v/255);}
      else if(component==='poofer'||component==='ladder'||component==='rails')color=rgb(0xbab2c0);
      else if(component==='deck')color=rgb(0x9c795d);
      else if(component==='eye_effect')color=rgb(0xffab45);
      else if(component==='structure'||component==='equipment')color=rgb(0x494555);
      else if(mat.pbrMetallicRoughness?.baseColorFactor)color=mat.pbrMetallicRoughness.baseColorFactor.slice(0,3).map(x=>Math.min(.88,x**.48));
      if(component==='poofer')outlets.push(points.reduce((a,b)=>a[1]>b[1]?a:b));
      if(eye){
        const uv=accessor(prim.attributes.TEXCOORD_0);
        for(const i of idx)model.vertices.push(...points[i],-1-uv[2*i],uv[2*i+1],eye[1]==='L'?0:1);
        continue;
      }
      for(let i=0;i<idx.length;i+=3)model.tri(points[idx[i]],points[idx[i+1]],points[idx[i+2]],color);
    }
    for(const child of n.children||[])visit(child,chain);
  }
  for(const id of doc.scenes[doc.scene].nodes)visit(id,[]);
  return {model,outlets};
}

const check = process.argv[2] === '--check';
const source = readFileSync(check && process.argv[3] ? process.argv[3] :
  new URL('../site/assets/models/earl-survey-fit.glb',import.meta.url));
const {model,outlets}=bakeVehicle(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength));
if(outlets.length!==2)throw Error('Expected two mast outlets');
const vertices=Float32Array.from([...outlets.flat(),...model.vertices],v=>Math.round(v*10000)/10000);
const asset = new URL('../site/test-drive/drive-model.mesh',import.meta.url);
if (check) {
  const packed = gunzipSync(readFileSync(asset));
  if (packed.byteLength !== vertices.byteLength) throw Error('Driving mesh vertex count differs from the current model');
  // Both meshes store a float per 0.1 mm position or 0.0001 color increment.
  for (let i=0; i<vertices.length; i++) {
    if (Math.abs(packed.readFloatLE(4*i)-vertices[i]) > .000101) {
      throw Error('Driving mesh differs from the detailed model at packed float '+i);
    }
  }
  console.log('Verified complete driving mesh against the survey-fitted assembly');
} else {
  writeFileSync(asset,gzipSync(Buffer.from(vertices.buffer),{level:9}));
}

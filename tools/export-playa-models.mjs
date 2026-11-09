// Run with Node 22+ from any working directory. Emits Blender-ready GLBs beside their sources.
import {writeFileSync} from 'node:fs';
import {Geometry} from '../site/assets/models/playa/geometry.js';
import {buildHeadMaze} from '../site/assets/models/playa/head-maze.js';
import {buildMan} from '../site/assets/models/playa/man-2014.js';
import {eventHorizon,pivotHeight} from '../site/assets/models/playa/event-horizon.js';

function save(name,parts,nodes,roots){
  const views=[],accessors=[],meshes=[],chunks=[];
  let offset=0;
  function accessor(array,type,componentType,count,bounds={}){
    const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    const bufferView=views.push({buffer:0,byteOffset:offset,byteLength:bytes.length})-1;
    const padding=Buffer.alloc((4-bytes.length%4)%4);
    chunks.push(bytes,padding);offset+=bytes.length+padding.length;
    return accessors.push({bufferView,componentType,count,type,...bounds})-1;
  }
  for(const [label,g] of parts){
    const pos=[],colors=[],indices=[],lookup=new Map(),min=[Infinity,Infinity,Infinity],max=min.map(v=>-v);
    for(let j=0;j<g.vertices.length;j+=6){
      const xyz=g.vertices.slice(j,j+3).map(Math.fround);
      const rgba=[...g.vertices.slice(j+3,j+6).map(x=>Math.round(Math.min(1,x)*255)),255];
      const key=xyz.join(',')+','+rgba.join(',');
      if(!lookup.has(key)){
        lookup.set(key,pos.length/3);pos.push(...xyz);colors.push(...rgba);
        for(let i=0;i<3;i++){min[i]=Math.min(min[i],xyz[i]);max[i]=Math.max(max[i],xyz[i]);}
      }
      indices.push(lookup.get(key));
    }
    const POSITION=accessor(Float32Array.from(pos),'VEC3',5126,pos.length/3,{min,max});
    const COLOR_0=accessor(Uint8Array.from(colors),'VEC4',5121,pos.length/3,{normalized:true});
    const wide=pos.length/3>65535;
    meshes.push({name:label,primitives:[{attributes:{POSITION,COLOR_0},material:0,
      indices:accessor((wide?Uint32Array:Uint16Array).from(indices),'SCALAR',wide?5125:5123,indices.length)}]});
  }
  const doc={asset:{version:'2.0',generator:'BAAABS playa model exporter'},scene:0,scenes:[{nodes:roots}],nodes,meshes,
    materials:[{doubleSided:true,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:.8}}],
    buffers:[{byteLength:offset}],bufferViews:views,accessors};
  const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
  const head=Buffer.alloc(20),binHead=Buffer.alloc(8);
  head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(28+padded.length+offset,8);
  head.writeUInt32LE(padded.length,12);head.write('JSON',16);binHead.writeUInt32LE(offset);binHead.write('BIN\0',4);
  writeFileSync(new URL('../site/assets/models/playa/'+name+'.glb',import.meta.url),Buffer.concat([head,padded,binHead,...chunks]));
}
for(const [name,build] of [['man-2014',buildMan],['head-maze',buildHeadMaze]]){
  const g=new Geometry();build(g);save(name,[[name,g]],[{name,mesh:0}],[0]);
}
const {frame,rings}=eventHorizon();
const nodes=[{name:'Light court and mirror',mesh:0},{name:'Gimbal pivot',translation:[0,pivotHeight,0],children:[2]}];
for(let i=0;i<5;i++){
  const a=[.8,-1.2,.6,.92,-.74][i]/2,s=Math.sin(a);
  const node={name:'Gimbal '+(i+1),mesh:i+1,rotation:[i%2?0:s,i%2?s:0,0,Math.cos(a)]};
  if(i<4)node.children=[i+3];nodes.push(node);
}
save('event-horizon',[['Light court',frame],...rings.map((g,i)=>['Band '+(i+1),g])],nodes,[0,1]);

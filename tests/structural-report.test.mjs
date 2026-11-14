import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('all 1,575 structural controls agree with solved data and plan geometry',async()=>{
const root=path.join(repository,'site/structural'); const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const data=JSON.parse(fs.readFileSync(path.join(root,'shoring-data.json'),'utf8'));
class Element {
 constructor(){this.style={};this.attrs={};this.events={};this.children=[];this.classList={toggle:()=>{}};}
 setAttribute(k,v){this.attrs[k]=v;}append(e){this.children.push(e);}replaceChildren(){this.children=[];}
 addEventListener(k,fn){this.events[k]=fn;}querySelector(){return field;}
}
const map=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
const field=new Element();field.disabled=true;
const get=k=>{assert.ok(map.has(k),k);return map.get(k)};
const form=get('scenario'); form.elements=Object.fromEntries(['people','wall','stiffness','placement'].map(k=>[k,get(k)]));
const display=(n,w,p,c)=>{for(const [k,v] of Object.entries({people:n,wall:w,stiffness:p,placement:c}))get(k).value=String(v)};
display(20,0,2,'sweep');
vm.runInNewContext(fs.readFileSync(path.join(root,'shoring.js'),'utf8'),{
 document:{getElementById:get,createElementNS:()=>new Element()},fetch:async()=>({ok:true,json:async()=>data})});
await new Promise(setImmediate);
{
 assert.equal(field.disabled,false);assert.equal(get('stress').textContent,'232');assert.equal(get('drop').textContent,'1.04');
 for(const [w,wall] of data.walls.entries()) for(const [p,support] of wall.supports.entries())
 for(let n=0;n<=20;n++)for (const [c,res] of Object.entries(support.people[n])){
  display(n,w,p,c); form.events.input(); form.events.change();
  assert.equal(Number(get('stress').textContent.replaceAll(',','')),Math.round(res.stress));
  assert.equal(get('drop').textContent, res.drop.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
  assert.equal(get('crowd-rect').style.display,n?'':'none');
  assert.equal(get('post-marks').children.length,8);
  assert.equal(get('shore-marks').children.length,support.k?2:0);
  assert.equal(get('settlement').textContent,support.k?res.shoreCompression.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3}):'—');
  assert.equal(Number(get('shore').textContent.replaceAll(',','')),res.shore);
  assert.equal(get('roof-lines').children.length,data.geometry.lines.length);
  assert.ok(!get('plan-caption').textContent.includes('undefined'));
 }
}

});

test('38 ft workshop revision preserves panels, posts and rear portal geometry',async()=>{
const root=repository;
const raw=fs.readFileSync(root+'/site/assets/models/earl-roof-attachment-study.glb');
const original=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString());
const viewer={dataset:{rearFrameSrc:'assets/models/earl-roof-attachment-study.glb'}},download={};
let result;const Url=class extends URL{static createObjectURL(blob){result=blob;return 'blob:test';}};
const source=fs.readFileSync(root+'/site/assets/rear-roof-frame-preview.js','utf8').replace('  const base = viewers[0]', '  globalThis.api={sceneNodes,floorEnvelope,meshBounds,reviseRoof38};\n  const base = viewers[0]');
const context={document:{baseURI:'https://baaabs.org/',querySelectorAll:s=>s.startsWith('model-viewer')?[viewer]:[download],dispatchEvent:()=>{},querySelector:()=>null},fetch:async()=>({ok:true,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)}),URL:Url,Blob,TextDecoder,TextEncoder,Uint8Array,DataView,CustomEvent:class{},console};
vm.runInNewContext(source,context);
await new Promise(setImmediate);
{
 assert.ok(result,'GLB revision must succeed');const revised=Buffer.from(await result.arrayBuffer());
 const d=JSON.parse(revised.subarray(20,20+revised.readUInt32LE(12)).toString());
 const before=context.api.sceneNodes(original),after=context.api.sceneNodes(d),env=context.api.floorEnvelope(d,after);
 assert.ok(Math.abs(env.x1-env.x0-38*.3048)<1e-5);assert.ok(Math.abs(env.z1-env.z0-8*.3048)<1e-5);
 assert.ok(Math.abs((-6.27-env.x0)/.0254-3.45712598)<.001);
 let panels=0;
 for(const [i,e]of before){
  if(e.node.extras?.panel_id){panels++;assert.deepEqual(after.get(i),e);}
  if(after.has(i)&&!after.get(i).node.extras?.roof_iteration)assert.deepEqual(after.get(i),e);
  if(/upright|corner post|Transverse deck bearer|Transverse sill/.test(e.node.name||''))assert.deepEqual(after.get(i),e);
 }
 assert.equal(panels,204);assert.equal([...after.values()].filter(e=>(e.node.name||'').startsWith('Nose return |')).length,0);
 assert.equal([...after.values()].filter(e=>e.node.extras?.rear_study).length,15);
 const snap=JSON.stringify(d);context.api.reviseRoof38(d);assert.equal(JSON.stringify(d),snap);
 assert.equal(viewer.src,'blob:test');assert.equal(download.download,'baaabs-earl-38ft-roof-study.glb');

}
});

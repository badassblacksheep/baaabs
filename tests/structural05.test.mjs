import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { localReferenceExists } from './site-links.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('accessible candidate controls use only solved loads and retain failure qualification',async()=>{
 const html=read('site/structural/iteration-05.html'),data=JSON.parse(read('site/structural/iteration-05-data.json'));
 class Element{constructor(){this.events={};}addEventListener(k,f){this.events[k]=f;}querySelector(){return field;}}
 const field={disabled:true},nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const get=k=>{assert.ok(nodes.has(k),k);return nodes.get(k)};
 get('people05').value='20';get('equipment05').value='250';
 vm.runInNewContext(read('site/structural/iteration05.js'),{document:{getElementById:get},fetch:async()=>({ok:true,json:async()=>data})});
 await new Promise(setImmediate);assert.equal(field.disabled,false);
 for(const row of data.equipment){get('people05').value=String(row.people);get('equipment05').value=String(row.extraLbf);get('study05-controls').events.change();
  assert.equal(get('stress05').textContent,row.stress.toFixed(1)+' MPa');assert.equal(get('drop05').textContent,row.drop.toFixed(2)+' in');
  assert.match(get('status05').textContent,/No occupied-deck or fabrication release/);
  assert.equal(row.shore,0);assert.deepEqual(row.shoreReactions,[]);
  assert.ok(Math.abs(row.total-row.dead-row.people*450)<.02);
 }
 assert.equal(data.sensitivity.find(x=>x.label==='3x-250').belowCeiling,false);
 assert.equal(data.assumptions.operatingOccupancy,null);
});
test('iteration 05 frame has permanent access, raised ties, unchanged skin and deck',async()=>{
 const raw=fs.readFileSync(root+'/site/assets/models/earl-roof-attachment-study.glb'),config=JSON.parse(read('site/assets/structural-models-05.json'));
 const viewer={dataset:{rearFrameSrc:'assets/models/earl-roof-attachment-study.glb'},addEventListener(){}};
 const link={dataset:{shoreVariant:'end-truss'}};let blob;
 class Url extends URL{static createObjectURL(b){blob=b;return 'blob:model05';}}
 const source=read('site/assets/structural-preview-05.js').replace('  const base = viewers[0]','  globalThis.api={sceneNodes,floorEnvelope,meshBounds};\n  const base = viewers[0]');
 const context={document:{baseURI:'https://baaabs.org/',querySelectorAll:s=>s.startsWith('model-viewer')?[viewer]:[link],querySelector:()=>null,dispatchEvent(){}},fetch:async url=>url.includes('structural-models')?{ok:true,json:async()=>config}:{ok:true,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)},structuredClone,URL:Url,Blob,TextDecoder,TextEncoder,Uint8Array,DataView,CustomEvent:class{},console};
 vm.runInNewContext(source,context);await new Promise(setImmediate);await new Promise(setImmediate);
 assert.ok(blob);const bytes=Buffer.from(await blob.arrayBuffer()),d=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const before=context.api.sceneNodes(JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString())),after=context.api.sceneNodes(d),nodes=[...after.values()];
 for(const [i,e]of before)if(e.node.extras?.panel_id)assert.deepEqual(after.get(i),e);
 assert.equal(nodes.filter(e=>e.node.extras?.concept_shore).length,0);
 assert.equal(nodes.filter(e=>/^(Driver|Passenger) upright/.test(e.node.name||'')).length,0);
 assert.equal(nodes.filter(e=>/^Truss web .* 4$/.test(e.node.name||'')).length,0);
 const bounds=name=>{const entries=nodes.filter(e=>e.node.name===name);assert.equal(entries.length,1,name);return context.api.meshBounds(d,entries[0].node,entries[0].world)};
 for(const side of ['driver','passenger']){
  const a=bounds('Truss vertical '+side+' 4'),b=bounds('Truss vertical '+side+' 5');
  assert.ok(Math.abs((b.lo[0]-a.hi[0])/.0254-50.5450295)<.001);
 }
 const roof=bounds('Bus__Rolled roof');
 for(let i=0;i<3;i++)assert.ok(bounds('Lower transverse tie '+i).lo[1]>roof.hi[1]);
 assert.ok(Math.abs(bounds('Front transverse sill').hi[1]-bounds('Front transverse sill').lo[1]-.2032)<1e-6);
 assert.ok(Math.abs(bounds('Deck edge girder').hi[1]-bounds('Deck edge girder').lo[1]-.1524)<1e-6);
 const env=context.api.floorEnvelope(d,after);assert.ok(Math.abs(env.x1-env.x0-38*.3048)<1e-5);assert.ok(Math.abs(env.z1-env.z0-8*.3048)<1e-5);
 assert.equal(link.href,'blob:model05');assert.equal(link.download,'baaabs-earl-iteration05-end-truss.glb');
});
test('earlier iterations retain their distinct model runtimes and all local references resolve',()=>{
 assert.match(read('site/structural/iteration-03.html'),/rear-roof-frame-preview-03/);
 assert.match(read('site/structural/iteration-04.html'),/rear-roof-frame-preview-04/);
 for(const f of ['iteration-05.html','index.html','iteration-04.html','iteration-03.html','iteration-02.html','baseline.html']){
  const html=read('site/structural/'+f);assert.match(html,/05 · Shared structure/);
  for(const [,ref]of html.matchAll(/(?:href|src)="([^"#]+)"/g)){
   if(/^(https?:|data:|mailto:)/.test(ref))continue;
   assert.ok(localReferenceExists(path.join(root,'site'),'structural/'+f,ref),f+' '+ref);
  }
 }
});

test('local link validation handles site-root routes and relative files',()=>{
 const siteRoot=path.join(root,'site');
 const page='structural/iteration-05.html';
 assert.ok(localReferenceExists(siteRoot,page,'/journal/'));
 assert.ok(localReferenceExists(siteRoot,page,'/journal/#earl-day'));
 assert.ok(localReferenceExists(siteRoot,page,'../journal/'));
 assert.ok(localReferenceExists(siteRoot,page,'/earl/checklist/pre/'));
 assert.ok(localReferenceExists(siteRoot,page,'/earl/checklist/post/'));
 assert.ok(localReferenceExists(siteRoot,page,'iteration-05-data.json?revision=1'));
 assert.equal(localReferenceExists(siteRoot,page,'/nonexistent-route/'),false);
});

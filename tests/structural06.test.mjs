import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=JSON.parse(read('site/structural/iteration-06-data.json'));
const config=JSON.parse(read('site/assets/structural-models-06.json')),variant=config.variants[0];
const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('06 controls show only solved crowd/gear and independent support sensitivities',async()=>{
 const html=read('site/structural/index.html');
 class Element{constructor(){this.events={};this.style={};}addEventListener(k,f){this.events[k]=f;}}
 const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const get=id=>{assert.ok(nodes.has(id),id);return nodes.get(id)},field={disabled:true};
 get('people06').value='20';get('gear06').value='250';get('scenario06').value='default';
 const ctx={document:{getElementById:get,querySelectorAll:()=>[field]},fetch:async()=>({ok:true,json:async()=>data}),console};
 vm.runInNewContext(read('site/structural/iteration06.js'),ctx);await new Promise(setImmediate);
 let loaded=false,paint;
 get('model06').model={materials:[{name:'Panel_test',async ensureLoaded(){loaded=true;},get pbrMetallicRoughness(){assert.ok(loaded,'load deferred material before inspecting color');return {baseColorFactor:[1,1,1,1],setBaseColorFactor(v){paint=v;}};},setAlphaMode(){}}]};
 await get('model06').events.load();assert.equal(paint[3],0);
 get('skin06').checked=true;await get('skin06').events.change();assert.equal(paint[3],1);
 assert.equal(field.disabled,false);assert.throws(()=>ctx.Baaabs06.selected(data,19,250),/Unsolved/);
 assert.throws(()=>ctx.Baaabs06.scenario(data,'unknown'),/Unsolved/);
 for(const r of data.equipment){
   get('people06').value=String(r.people);get('gear06').value=String(r.extraLbf);get('loads06').events.change();
   assert.equal(get('stress06').textContent,r.stress.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}));
   assert.equal(get('drop06').textContent,r.drop.toFixed(2)+' in');
   assert.equal((get('crowd06').innerHTML.match(/<circle/g)||[]).length,r.people);
   assert.match(get('summary06').textContent,/no safe headcount established/);
 }
 for(const r of [data.selected,...data.sensitivity]){
   get('scenario06').value=r.label;get('scenario06').events.change();
   assert.equal(get('s-drop06').textContent,r.drop.toFixed(2)+' in');
   assert.equal(get('sensitivity06').className,'sensitivity-result '+ctx.Baaabs06.screen(r).color);
 }
 get('scenario06').value='3x';get('scenario06').events.change();assert.match(get('s-status06').textContent,/Above/);
 assert.match(get('scenario-note06').textContent,/not a simulated collapse/);
 const failure={...ctx,console:{error(){}},fetch:async()=>({ok:false})};vm.runInNewContext(read('site/structural/iteration06.js'),failure);await new Promise(setImmediate);assert.equal(get('data-error06').hidden,false);
});

test('06 results preserve gravity, six independent bearings, refinement and sensitivity scope',()=>{
 assert.equal(data.equipment.length,12);assert.equal(data.sensitivity.length,17);
 for(const r of [...data.equipment,...data.sensitivity]){
   close(r.total-r.dead,r.people*225*r.alpha,.02);close(r.frameWeight+2311.25+r.extraLbf,r.dead,.02);
   assert.equal(r.shoreReactions.length,6);assert.ok(r.shoreReactions.every(x=>x>=-.01));
   for(const j of r.disabled)close(r.shoreMaxima[j],0,.01);
   assert.equal(r.belowCeiling,r.stress<=207);
 }
 assert.equal(data.sensitivity.find(r=>r.label==='k-0').shore,0);
 assert.equal(data.sensitivity.find(r=>r.label==='3x').belowCeiling,false);
 const fine=data.sensitivity.find(r=>r.label==='fine');close(fine.stress,data.selected.stress,.001);close(fine.drop,data.selected.drop,.0002);
 assert.equal(data.assumptions.operatingOccupancy,null);
 assert.equal(data.placement.phaseSurveyed,false);
});

test('06 geometry uses three equal pairs at lower truss nodes, full bracing and preserved height',()=>{
 const points=variant.shorePositions;assert.equal(points.length,6);
 for(let j=0;j<3;j++){
   close(points[2*j][0],points[2*j+1][0]);close(points[2*j][1],-points[2*j+1][1]);close(points[2*j][2],3.0604);
   if(j)close(points[2*j][0]-points[2*j-2][0],115*.0254);
   for(const pt of points.slice(2*j,2*j+2)){
     const converging=variant.members.filter(m=>m.name.startsWith('Truss web')&&[m.a,m.b].some(v=>v.every((x,i)=>Math.abs(x-pt[i])<1e-8)));
     assert.equal(converging.length,2,'two diagonals must converge at shore node');
   }
 }
 assert.equal(variant.members.filter(m=>m.name.startsWith('Truss web')).length,16);
 assert.ok(variant.members.filter(m=>m.name.startsWith('Truss vertical')).every(m=>m.depth===.0508));
 assert.ok(variant.members.filter(m=>m.name.startsWith('Lower transverse tie')).every(m=>m.a[2]===3.21));
 const joists=variant.members.filter(m=>m.name.startsWith('Floor joist')||m.deck_joist).map(m=>m.a[0]).sort((a,b)=>a-b);
 assert.ok(joists.every((x,i)=>!i||x-joists[i-1]<=.6096+1e-7));
 const mats=JSON.parse(read('site/structural/iteration-06-materials.json'));
 const mapped=mats.groups.flatMap(g=>g.members);assert.equal(mapped.length,variant.members.length);
 for(const m of variant.members){const s=mapped.find(x=>x.name===m.name);assert.ok(s);close(s.nominalWallM,m.wall/.93);}
 assert.equal(mats.shores.count,6);close(mats.shores.nominalWallM,.003175);
});

test('06 public runtime preserves sheep/deck and places six short shores under the modeled joints',async()=>{
 const raw=fs.readFileSync(root+'/site/assets/models/earl-roof-attachment-study.glb');
 const viewer={dataset:{rearFrameSrc:'assets/models/earl-roof-attachment-study.glb'},addEventListener(){}};
 const link={dataset:{shoreVariant:'six-shores'}};let blob;
 class Url extends URL{static createObjectURL(b){blob=b;return 'blob:model06';}}
 const src=read('site/assets/structural-preview-06.js').replace('  const base = viewers[0]','  globalThis.api={sceneNodes,floorEnvelope,meshBounds};\n  const base = viewers[0]');
 const context={document:{baseURI:'https://baaabs.org/',querySelectorAll:s=>s.startsWith('model-viewer')?[viewer]:[link],querySelector:()=>null,dispatchEvent(){}},fetch:async url=>url.includes('structural-models')?{ok:true,json:async()=>config}:{ok:true,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)},structuredClone,URL:Url,Blob,TextDecoder,TextEncoder,Uint8Array,DataView,CustomEvent:class{},console};
 vm.runInNewContext(src,context);await new Promise(setImmediate);await new Promise(setImmediate);
 const bytes=Buffer.from(await blob.arrayBuffer()),d=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const before=context.api.sceneNodes(JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString())),after=context.api.sceneNodes(d),nodes=[...after.values()];
 for(const [i,e]of before)if(e.node.extras?.panel_id)assert.deepEqual(after.get(i),e);
 assert.equal(nodes.filter(e=>e.node.extras?.concept_shore&&e.node.extras.role==='vertical').length,6);
 assert.equal(nodes.filter(e=>e.node.extras?.analytical_member).length,variant.members.length);
 assert.equal(nodes.filter(e=>/^Truss web /.test(e.node.name||'')).length,16);
 assert.equal(nodes.filter(e=>/^(Driver|Passenger) upright/.test(e.node.name||'')).length,0);
 for(const e of nodes.filter(e=>e.node.extras?.concept_shore&&e.node.extras.role==='vertical')){
   const b=context.api.meshBounds(d,e.node,e.world);close(b.lo[1],variant.shoreGeometry.landingM+.01905);close(b.hi[1],variant.shoreGeometry.topM-.01905);close(b.hi[0]-b.lo[0],.0762);
 }
 const roof=nodes.find(e=>e.node.name==='Bus__Rolled roof'),rb=context.api.meshBounds(d,roof.node,roof.world);
 for(const e of nodes.filter(e=>/^Lower transverse tie/.test(e.node.name||'')))assert.ok(context.api.meshBounds(d,e.node,e.world).lo[1]>rb.hi[1]);
 const env=context.api.floorEnvelope(d,after);close(env.x1-env.x0,38*.3048,1e-5);close(env.z1-env.z0,8*.3048,1e-5);
 assert.equal(d.asset.extras.structural_iteration,'06');assert.equal(link.download,'baaabs-earl-iteration06-six-shores.glb');
});

test('current surfaces use 06, archives keep their data, and game handles transformed matrix nodes',()=>{
 for(const file of ['site/the_build.html','site/structural/index.html'])assert.match(read(file),/structural-preview-06.js/);
 assert.match(read('site/structural/iteration-05a.html'),/structural-preview-05.js/);
 assert.match(read('site/structural/iteration-05.html'),/structural-preview-05.js/);
 assert.match(read('site/index.html'),/home-model\/viewer.js/);
 assert.match(read('tools/build-home-model.py'),/baaabs-earl-iteration06-six-shores.glb/);
 assert.match(read('tools/bake-drive-model.mjs'),/baaabs-earl-iteration06-six-shores.glb/);
 const source=read('tools/bake-drive-model.mjs'),a=source.indexOf('function transform('),b=source.indexOf('function bakeVehicle');
 const ctx={};vm.runInNewContext(source.slice(a,b)+';globalThis.apply=transform;',ctx);
 const m=[2,0,0,0,0,3,0,0,0,0,4,0,10,20,30,1];
 assert.deepEqual(Array.from(ctx.apply([1,2,3],{matrix:m})),[12,26,42]);
 assert.match(read('.github/workflows/deploy-pages.yml'),/bake-structural06.mjs/);
});

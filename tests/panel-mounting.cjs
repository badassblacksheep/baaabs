const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const site=path.resolve(__dirname,'../site');
class El{constructor(){this.children=[];this.events={};this.dataset={};this.checked=true;this.attrs={};this.model={materials:[]};this.loaded=false}addEventListener(t,f){(this.events[t]??=[]).push(f)}emit(t,p={}){for(const f of this.events[t]||[])f(p)}append(el){el.parent=this;this.children.push(el)}remove(){this.parent.children=this.parent.children.filter(x=>x!==this)}querySelectorAll(){return this.children}setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return k==='src'?this.src:this.attrs[k]}}
const els=new Map(),el=k=>{if(!els.has(k))els.set(k,new El());return els.get(k)};
const doc={querySelector:el,createElement:()=>new El(),baseURI:'https://example.test/'};
function material(name){return {name,isLoaded:true,alpha:'OPAQUE',pbrMetallicRoughness:{baseColorFactor:[.4,.4,.4,1],setBaseColorFactor(c){this.baseColorFactor=c}},getAlphaMode(){return this.alpha},setAlphaMode(a){this.alpha=a}}}
const viewer=el('#mount-model'),skin=material('Mount_skin'),contextMaterial=material('Mount_context');viewer.model.materials=[skin,contextMaterial];
const data=JSON.parse(fs.readFileSync(path.join(site,'assets/panel-mounting-v1.json')));
const context=vm.createContext({document:doc,URL,Date,console,customElements:{whenDefined:async()=>{}},fetch:async()=>({ok:true,json:async()=>data})});
(async()=>{
 await vm.runInContext('(async()=>{'+fs.readFileSync(path.join(site,'assets/panel-mounting.mjs'),'utf8')+'})()',context);
 assert.match(viewer.src,/panel-mounting-v1.glb$/);viewer.loaded=true;viewer.emit('load',{detail:{url:viewer.src}});assert.equal(el('#mount-layers').disabled,false);assert.equal(viewer.children.length,6);assert.equal(el('#region-weight').textContent,'48 lb');
 el('#assembled').emit('click');assert.equal(el('#mount-layers').disabled,false);
 el('#mount-skin').checked=false;el('#mount-skin').emit('change');assert.equal(skin.pbrMetallicRoughness.baseColorFactor[3],0);assert.equal(viewer.children.length,5);
 el('#exploded').emit('click');assert.match(viewer.src,/-exploded.glb$/);viewer.emit('load',{detail:{url:viewer.src}});assert.equal(el('#exploded').attrs['aria-pressed'],'true');assert.equal(skin.pbrMetallicRoughness.baseColorFactor[3],0);
 const backing=viewer.children.find(x=>x.slot==='hotspot-cassette');assert.equal(backing.dataset.position,'0.75m 3.22m 2.92m');
 el('#view-joint').emit('click');assert.match(viewer.src,/v1.glb$/);assert.equal(viewer.cameraTarget,'-0.85m 2.703m 2m');viewer.emit('load',{detail:{url:viewer.src}});
 el('#mount-labels').checked=false;el('#mount-labels').emit('change');assert.equal(viewer.children.length,0);
 viewer.emit('error');el('#assembled').emit('click');assert.match(viewer.src,/\?retry=/);
 for(const name of ['baaabs-panel-mounting-v1.glb','baaabs-panel-mounting-v1-exploded.glb']){
  const r=fs.readFileSync(path.join(site,'assets/models',name)),d=JSON.parse(r.subarray(20,20+r.readUInt32LE(12)).toString());
  const ids=d.nodes.map(n=>n.extras?.panel_id).filter(Boolean);assert.deepEqual(ids.sort(),['B-D-033','B-D-034']);assert.ok(d.nodes.filter(n=>n.extras?.joint==='C-lower').length>=10);
  const used=new Set(d.nodes.filter(n=>n.mesh!==undefined).flatMap(n=>d.meshes[n.mesh].primitives.map(p=>p.material)));assert.equal(used.size,d.materials.length);
 }
 console.log('PASS assembled/exploded controls, repeat selection, persistent layers, label positions, close-up, retry, weights and GLB panel/material integrity');
})().catch(e=>{console.error(e);process.exitCode=1});

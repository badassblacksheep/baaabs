const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),site=path.resolve(__dirname,'../site');
const html=fs.readFileSync(path.join(site,'panels.html'),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.style={};this.dataset={};this.value='';this.hidden=false;this._text='';this.checked=false;this.parentNode=null;this.classList={toggle(){}};}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
 emit(type,props={}){for(const fn of this.events[type]||[])fn({target:this,pointerId:1,pointerType:'mouse',buttons:0,clientX:100,clientY:100,detail:1,stopPropagation(){},preventDefault(){},...props})}
 append(...items){for(const item of items){item.parentNode=this;this.children.push(item)}}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this)}
 closest(){return this.slot?.startsWith('hotspot-')?this:null}
 replaceChildren(...items){this.children=items;this._text=''}
 setAttribute(k,v){this[k]=v}
 set textContent(s){this._text=String(s);this.children=[]}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 getBoundingClientRect(){return this===model?{width:800,height:480}:{width:220,height:36}}
}
const els=new Map();const el=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};
const doc=new Element(),win=new Element();doc.querySelector=el;doc.createElement=t=>new Element(t);doc.createElementNS=(ns,t)=>new Element(t);
const model=el('#model');model.model={materials:[]};let hit='B-P-050';model.materialFromPoint=()=>hit?{name:'Panel_'+hit+'_skin'}:null;model.updateHotspot=()=>{};model.cameraOrbit='0deg 75deg 24m';
model.getCameraOrbit=()=>{const [t,p,r]=model.cameraOrbit.split(' ').map(parseFloat);return {theta:t*Math.PI/180,phi:p*Math.PI/180,radius:r}};
model.queryHotspot=name=>{const m=model.children.find(x=>x.slot===name);if(!m)return null;const [x,y,z]=m.dataset.position.split(' ').map(parseFloat);return {canvasPosition:{x:400+x*25,y:400-y*35,z:0},facingCamera:true}};
el('#inspect-vertices').checked=true;
let next=1;const frames=new Map();const context=vm.createContext({document:doc,window:win,innerWidth:1000,innerHeight:700,requestAnimationFrame:f=>{const id=next++;frames.set(id,f);return id},cancelAnimationFrame:id=>frames.delete(id),setTimeout:()=>1,clearTimeout(){},console});
vm.runInContext(script,context);function flush(){for(const [id,f]of[...frames]){frames.delete(id);f()}}
const data=vm.runInContext('DATA',context),panel=id=>data.panels.find(p=>p.id===id),row=id=>el('#rows').children.find(r=>r.children[0].textContent===id),current=()=>el('#current-row').children[0].children[0].textContent;
let checks=0;function check(name,f){f();checks++;console.log('PASS',name)}
check('table hover preserves current and shows only name',()=>{row('B-P-049').emit('pointerenter');assert.equal(current(),'H-D-001');assert.equal(el('#panel-tooltip').textContent,panel('B-P-049').name);assert.equal(el('#panel-tooltip').hidden,false)});
check('tooltip follows pointer and stays on screen',()=>{row('B-P-049').emit('pointermove',{clientX:990,clientY:690});assert.equal(el('#panel-tooltip').style.left,'756px');assert.equal(el('#panel-tooltip').style.top,'640px')});
check('keyboard focus does not select, button click does',()=>{row('B-P-049').children[0].children[0].emit('focus');assert.equal(current(),'H-D-001');row('B-P-049').children[0].children[0].emit('click');assert.equal(current(),'B-P-049');assert.match(el('#title').textContent,/B-P-049/)});
check('model hover preserves selection',()=>{model.emit('pointermove');flush();assert.equal(current(),'B-P-049');assert.equal(el('#panel-tooltip').textContent,panel('B-P-050').name)});
check('model click selects picked panel',()=>{model.emit('pointerdown');model.emit('pointerup');model.emit('click');flush();assert.equal(current(),'B-P-050');assert.equal(el('#panel-tooltip').hidden,true)});
check('camera dragging never selects',()=>{hit='B-P-052';model.emit('pointerdown');model.emit('pointermove',{buttons:1,clientX:150});model.emit('pointerup',{clientX:150});model.emit('click',{clientX:150});flush();assert.equal(current(),'B-P-050')});
check('touch tap selects without hover tooltip',()=>{model.emit('pointerdown',{pointerType:'touch'});model.emit('pointerup',{pointerType:'touch'});model.emit('click',{pointerType:'touch'});flush();assert.equal(current(),'B-P-052');assert.equal(el('#panel-tooltip').hidden,true)});
check('multi-touch orbit never selects',()=>{hit='B-P-051';model.emit('pointerdown',{pointerType:'touch'});model.emit('pointerdown',{pointerId:2,pointerType:'touch'});model.emit('pointerup',{pointerId:2,pointerType:'touch'});model.emit('pointerup',{pointerType:'touch'});model.emit('click');assert.equal(current(),'B-P-052')});
check('empty model space hides tooltip without changing selection',()=>{hit=null;model.emit('pointermove');flush();assert.equal(el('#panel-tooltip').hidden,true);assert.equal(current(),'B-P-052')});
for(const type of ['pointerleave','scroll','resize','Escape'])check(type+' dismisses tooltip',()=>{hit='B-P-051';model.emit('pointermove');flush();assert.equal(el('#panel-tooltip').hidden,false);if(type==='Escape')doc.emit('keydown',{key:'Escape'});else(type==='pointerleave'?model:win).emit(type);assert.equal(el('#panel-tooltip').hidden,true);assert.equal(current(),'B-P-052')});
check('row click selects panel',()=>{row('B-P-065').emit('click');assert.equal(current(),'B-P-065')});
console.log(checks+' workshop behavior checks passed');


vm.runInContext(fs.readFileSync(path.join(site,'panel-audit.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(site,'panel-inspector.js'),'utf8'),context);
check('entrance example loads correct edges and preserves vertical jamb',()=>{
 el('#entrance-example').emit('click');flush();assert.equal(current(),'B-P-052');assert.equal(el('#compare-panel').value,'B-P-033');assert.equal(el('#edge-a').value,'0');assert.equal(el('#edge-b').value,'2');assert.match(el('#edge-comparison').textContent,/Side-view angle: 0.00°/);assert.match(el('#edge-comparison').textContent,/3D angle: 8.00°/);assert.equal(model.children.filter(x=>x.slot?.startsWith('hotspot-inspect')).length,6);
 const p=panel('B-P-052').vertices_m;assert.ok(Math.abs(p[1][0]-p[2][0])<1e-6);assert.ok(Math.abs(p[1][1]-p[2][1])<1e-6);
});
check('projected edge overlays match both triangles',()=>{flush();assert.equal(el('#edge-overlay').children.length,6);assert.equal(el('#edge-overlay').children.filter(l=>l['stroke-width']===5).length,2)});
check('comparison vertex click changes edge without changing current panel',()=>{model.children.find(x=>x.slot==='hotspot-inspect-B-1').emit('click');assert.equal(current(),'B-P-052');assert.equal(el('#edge-b').value,'1')});
check('inspector keeps hover tooltips name-only and selection unchanged',()=>{hit='B-P-049';model.emit('pointermove');flush();assert.equal(current(),'B-P-052');assert.equal(el('#panel-tooltip').textContent,panel('B-P-049').name);model.children.find(x=>x.slot==='hotspot-inspect-A-0').emit('pointerenter');assert.equal(el('#panel-tooltip').hidden,true)});
check('vertex visibility toggle removes and restores markers and edges',()=>{el('#inspect-vertices').checked=false;el('#inspect-vertices').emit('change');flush();assert.equal(model.children.filter(x=>x.slot?.startsWith('hotspot-inspect')).length,0);assert.equal(el('#edge-overlay').children.length,0);el('#inspect-vertices').checked=true;el('#inspect-vertices').emit('change');flush();assert.equal(model.children.filter(x=>x.slot?.startsWith('hotspot-inspect')).length,6)});
check('camera presets and incremental rotation use current orientation',()=>{el('#view-passenger').emit('click');assert.match(model.cameraOrbit,/^180deg 90deg /);el('#rotate-right').emit('click');assert.match(model.cameraOrbit,/^195deg 90deg /);el('#rotate-up').emit('click');assert.match(model.cameraOrbit,/ 75deg /);el('#view-driver').emit('click');assert.match(model.cameraOrbit,/^0deg 90deg /);el('#view-top').emit('click');assert.match(model.cameraOrbit,/^0deg 5deg /);el('#view-face').emit('click');assert.match(model.cameraOrbit,/ 90deg /)});
check('audit loads review pair and retains all findings',()=>{assert.equal(el('#audit-pair').children.length,24);el('#audit-pair').value='3';el('#inspect-audit-pair').emit('click');assert.equal(current(),'B-P-007');assert.equal(el('#compare-panel').value,'B-P-017');assert.match(el('#audit-summary').textContent,/21 surface-crossing pairs/)});
check('corrected tapered seam measures parallel in full 3D',()=>{el('#audit-pair').value='2';el('#inspect-audit-pair').emit('click');assert.equal(current(),'B-P-053');assert.match(el('#edge-comparison').textContent,/3D angle: 0.00°/);assert.equal(el('#vertex-coordinates').children.length,6)});
check('comparing a panel with itself clears comparison',()=>{el('#compare-panel').value='B-P-053';el('#compare-panel').emit('change');assert.equal(el('#compare-panel').value,'');assert.equal(el('#edge-b').disabled,true)});
check('material highlighting restores originals when inspector is hidden',()=>{
 const material={name:'Panel_B-P-053',pbrMetallicRoughness:{baseColorFactor:[.1,.1,.1,1],setBaseColorFactor(v){this.baseColorFactor=v}},emissiveFactor:[0,0,0],setEmissiveFactor(v){this.emissiveFactor=v}};model.model.materials=[material];vm.runInContext('clearFlash();paintHighlights()',context);assert.equal(material.pbrMetallicRoughness.baseColorFactor[0],1);el('#inspect-vertices').checked=false;el('#inspect-vertices').emit('change');assert.deepEqual([...material.pbrMetallicRoughness.baseColorFactor],[.1,.1,.1,1]);
});
console.log(checks+' total workshop and inspector checks passed');

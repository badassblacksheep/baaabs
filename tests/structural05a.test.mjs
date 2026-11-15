import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=JSON.parse(read('site/structural/iteration-05-data.json'));
const script=read('site/structural/iteration05a.js');
const context={};vm.runInNewContext(script,context);const api=context.Baaabs05a;

test('05a keeps the original dataset and never interpolates an unsolved crowd',()=>{
 assert.equal(crypto.createHash('sha256').update(read('site/structural/iteration-05-data.json')).digest('hex'),'509eff00e28acd998c36f17b526181cf4488f1d8e516375bd679ccbcb792470e');
 for(const row of data.equipment)assert.equal(api.selected(data,row.people,row.extraLbf),row);
 assert.throws(()=>api.selected(data,19,250),/not calculated/);
 assert.throws(()=>api.selected(data,20,100),/not calculated/);
 for(const n of [8,12,20])for(const row of api.comparisons(data,n)){
  assert.equal(row.people,n);assert.equal(row.share,1);assert.equal(row.alpha,2);
  assert.equal(row.extraLbf||0,0);assert.ok(Math.abs(row.dead-row.frameWeight-2311.25)<.001);
 }
 const fail=api.sensitivity(data,'3x-250');assert.equal(fail.people,20);assert.equal(fail.extraLbf,250);assert.equal(fail.alpha,3);assert.equal(api.screen(fail).color,'red');
 assert.equal(api.screen(api.sensitivity(data,'base')).color,'yellow');
 assert.equal(api.screen(api.selected(data,8,250)).color,'green');
 assert.ok(api.sensitivity(data,'pinned-250').uplift>1300);
});

test('05a controls expose exact results, the failed stress screen, and separate shoring geometry',async()=>{
 const html=read('site/structural/iteration-05a.html');
 class Element {constructor(){this.events={};this.style={};this.attrs={};this.disabled=true;}addEventListener(k,f){this.events[k]=f;}setAttribute(k,v){this.attrs[k]=v;}}
 const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const get=k=>{assert.ok(nodes.has(k),k);return nodes.get(k)};
 get('crowd05a').value='2';get('gear05a').value='250';get('path05a').value='end';get('sensitivity05a').value='base';
 const fields=[new Element(),get('path05a'),get('sensitivity05a')];
 vm.runInNewContext(script,{document:{getElementById:get,querySelectorAll:()=>fields},fetch:async()=>({ok:true,json:async()=>data}),console});
 await new Promise(setImmediate);assert.ok(fields.every(e=>!e.disabled));
 for(const row of data.equipment){
  get('crowd05a').value=String([8,12,20].indexOf(row.people));get('gear05a').value=String(row.extraLbf);get('concept-controls').events.change();
  assert.equal(get('stress-demand').textContent,row.stress.toFixed(1));
  assert.equal(get('deck-drop').textContent,row.drop.toFixed(2));
  assert.match(get('selection-summary').textContent,/no operating headcount established/);
  assert.equal((get('crowd-icons').innerHTML.match(/<circle/g)||[]).length,row.people);
 }
 get('sensitivity05a').value='3x-250';get('sensitivity05a').events.change();
 assert.equal(get('sensitivity-stress').textContent,'277.6 MPa');
 assert.equal(get('sensitivity-result').className,'sensitivity-result red');
 assert.match(get('sensitivity-explanation').textContent,/not a collapse event/);
 get('path05a').value='body';get('path05a').events.change();
 assert.match(get('path-caption').textContent,/different frame/);
 assert.match(get('path-caption').textContent,/no dedicated storage opening/);
 assert.doesNotMatch(get('load-path').innerHTML,/class="access-bay"/);
 get('path05a').value='end';get('path05a').events.change();
 assert.match(get('load-path').innerHTML,/class="access-bay"/);
 assert.match(get('path-finding').textContent,/has not been calculated/);
});

test('material schedule covers every modeled member without rounding its dimensions or wall',()=>{
 const schedule=JSON.parse(read('site/structural/iteration-05a-materials.json'));
 const model=JSON.parse(read('site/assets/structural-models-05.json')).variants[0];
 const mapped=schedule.groups.flatMap(g=>g.members);
 assert.equal(mapped.length,model.members.length);
 assert.equal(schedule.procurementApproved,false);assert.equal(schedule.stockAvailabilityVerified,false);
 assert.equal(schedule.yieldMPa,345);assert.equal(schedule.designWallFactor,.93);
 for(const m of model.members){
  const r=mapped.find(x=>x.name===m.name);assert.ok(r,m.name);
  assert.equal(r.widthM,m.width);assert.equal(r.depthM,m.depth);
  assert.ok(Math.abs(r.nominalWallM*.93-m.wall)<1e-10 || (m.wall===undefined&&Math.abs(r.nominalWallM-.003175)<1e-10));
 }
 const html=read('site/structural/iteration-05a.html');
 for(const wall of ['⅛ in','3/16 in','¼ in'])assert.ok(html.includes(wall));
 assert.match(html,/ASTM A500 Grade C/);assert.match(html,/stock selection unresolved/);
 assert.match(html,/No maximum headcount was calculated/);
});

test('05a navigation and local resources resolve and every historical page retains its own current tab',()=>{
 const names=['iteration-05a.html','index.html','iteration-04.html','iteration-03.html','iteration-02.html','baseline.html'];
 for(const name of names){
  const html=read('site/structural/'+name);
  const nav=html.match(/<nav class="design-tabs".*?<\/nav>/s)[0];
  assert.equal((nav.match(/aria-current="page"/g)||[]).length,1);
  assert.ok(nav.includes('href="'+name+'" aria-current="page"'));
  assert.ok(nav.includes('05a · Visual guide'));
  for(const [,ref] of html.matchAll(/(?:href|src)="([^"#]+)"/g)){
   if(/^(https?:|data:|mailto:)/.test(ref))continue;
   assert.ok(fs.existsSync(path.resolve(root,'site/structural',ref.split(/[?#]/)[0])),name+' '+ref);
  }
 }
});

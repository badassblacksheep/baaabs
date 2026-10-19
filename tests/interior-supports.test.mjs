import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {study,diagram} from '../site/assets/interior-support-model.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const data=JSON.parse(read('../site/assets/interior-support-study.json'));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('placement exposes cabin and eccentricity tradeoffs without claiming width acceptance',()=>{
 const center=study(data,{placement:'center'}),rail=study(data),wall=study(data,{placement:'wall'});
 close(center.aisleOverlapIn,6);close(center.eccentricMomentLbFt,0);
 close(rail.offset,.43/.0254);close(rail.aisleOverlapIn,18-.43/.0254);
 close(wall.aisleOverlapIn,0);close(wall.offset,42);
 assert.ok(center.deckReachIn<rail.deckReachIn&&rail.deckReachIn<wall.deckReachIn);
 assert.ok(wall.eccentricMomentLbFt>rail.eccentricMomentLbFt);
 close(wall.foundationOutboardReachIn,42-.43/.0254);
 assert.equal('addedSideWidthIn' in rail,false);
});
test('post envelope changes wall position and all supported layout inputs stay bounded',()=>{
 const small=study(data,{placement:'wall',post:3,cabin:84}),large=study(data,{placement:'wall',post:6,cabin:94});
 close(small.offset+small.envelope/2,42);close(large.offset+large.envelope/2,47);
 for(const layout of ['three','four'])for(const placement of ['center','rail','wall'])for(const cabin of [84,94])for(const post of [3,6]){
  const r=study(data,{layout,placement,cabin,post});assert.ok(r.fitsCabin);assert.ok(Number.isFinite(r.eccentricMomentLbFt));
  for(const view of ['plan','section','side']){const svg=diagram(data,r,view);assert.match(svg,/Individual interior posts/);assert.doesNotMatch(svg,/NaN|undefined/)}
 }
 assert.equal(study(data,{cabin:100,post:-1}).cabin,94);assert.equal(study(data,{cabin:100,post:-1}).post,3);
});
async function ui(fail=false){
 class El{constructor(dataset={}){this.dataset=dataset;this.events={};this.attributes={};this.classList={add(){}}}addEventListener(k,f){this.events[k]=f}setAttribute(k,v){this.attributes[k]=v}}
 const ids=new Map(),get=id=>{if(!ids.has(id))ids.set(id,new El());return ids.get(id)};
 const groups={layout:['three','four'],placement:['center','rail','wall'],view:['plan','section','side']};
 for(const k of Object.keys(groups))groups[k]=groups[k].map(v=>new El({[k]:v}));
 const controls=[...Object.values(groups).flat(),get('cabin-width'),get('post-width')];
 const document={getElementById:get,querySelectorAll:s=>s.startsWith('button')?controls:groups[s.slice(6,-1)]||[]};
 const context=vm.createContext({document,study,diagram,fetch:async()=>({ok:!fail,json:async()=>data})});
 await vm.runInContext('(async()=>{'+read('../site/assets/interior-supports.mjs').replace(/^import[^\n]+\n/,'')+'})()',context);
 return {get,groups,controls};
}
test('interactive controls change count, position, view and cabin assumptions',async()=>{
 const u=await ui();assert.equal(u.get('span-value').textContent,'12.8 ft');assert.equal(u.get('aisle-value').textContent,'1.1 in');
 u.groups.layout[0].events.click();assert.equal(u.get('span-value').textContent,'16.9 ft');assert.equal(u.groups.layout[0].attributes['aria-pressed'],'true');
 u.groups.placement[2].events.click();assert.equal(u.get('aisle-value').textContent,'0.0 in');assert.equal(u.get('reach-value').textContent,'7.9 ft');
 u.groups.view[1].events.click();assert.match(u.get('diagram').innerHTML,/TRANSVERSE SECTION/);
 u.get('cabin-width').events.input({target:{value:'84'}});assert.equal(u.get('cabin-value').textContent,'84 in');assert.equal(u.get('reach-value').textContent,'7.7 ft');
 assert.ok(u.controls.every(c=>!c.disabled));assert.match(u.get('comparison-rows').innerHTML,/Six exterior station pairs/);
});
test('unavailable data disables controls and does not display calculated results',async()=>{
 const u=await ui(true);assert.ok(u.controls.every(c=>c.disabled));assert.match(u.get('page-status').textContent,/could not load/);assert.match(u.get('diagram').textContent,/unavailable/);
});

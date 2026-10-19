import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {budget,defaults,diagram} from '../site/assets/frame-comparison-model.mjs';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const data=JSON.parse(read('../site/assets/frame-comparison.json'));
const road=JSON.parse(read('../site/assets/road-width-status.json'));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('mass accounting and comparison preserve the same brief',()=>{
 close(data.categories.reduce((sum,c)=>sum+c.lb,0),data.baseline_lb);
 assert.equal(Math.round(data.baseline_lb),4466);
 assert.equal(Math.round(data.concepts[1].gross_removed_station_mass_lb),524);
 assert.deepEqual(data.concepts[1].station_ids,['A','C','D','F']);
 assert.equal(data.brief.requirements.people,20);assert.equal(data.brief.requirements.total_people_allowance_lb,4500);
 assert.equal(data.brief.requirements.maximum_event_speed_mph,5);assert.equal(data.brief.requirements.exterior_panel_count,206);
 assert.equal(data.brief.requirements.road_width_maximum_in,road.maximum_inches);
 assert.match(data.brief.status,/neither concept.*load-rated/i);
});
test('four-station budget crosses at independently accounted station removal',()=>{
 const removed=data.concepts[1].gross_removed_station_mass_lb;
 const b=budget(data,{joistReduction:0,floorReduction:0,extraSteel:removed});close(b.six,b.four);
 close(budget(data,{...defaults,extraSteel:0}).difference,-removed);
 assert.ok(budget(data,{...defaults,extraSteel:1500}).difference>0);
});
test('shared floor targets cannot bias the support comparison',()=>{
 const a=budget(data,defaults),b=budget(data,{...defaults,joistReduction:25,floorReduction:20});
 close(a.difference,b.difference);close(a.six-b.six,a.four-b.four);
 close(a.six-b.six,data.categories.find(c=>c.id==='joists').lb*.25+data.categories.find(c=>c.id==='floor').lb*.2);
});
test('budget inputs remain within explicitly presented hypothetical ranges',()=>{
 const b=budget(data,{joistReduction:100,floorReduction:-20,extraSteel:Infinity});
 assert.equal(b.joistReduction,40);assert.equal(b.floorReduction,0);assert.equal(b.extraSteel,0);
});
test('diagrams identify concept and unresolved restraint, and toggle layers',()=>{
 const six=diagram(data,{concept:'six',view:'side'}),four=diagram(data,{concept:'four',view:'side',panels:false,loads:false});
 assert.match(six,/6 pairs of supports/);assert.match(four,/4 pairs of supports/);
 assert.match(four,/Dashed posts B \/ E removed/);assert.doesNotMatch(four,/marker-end=/);
 assert.match(diagram(data,{view:'end'}),/Transverse restraint unresolved/);
});

async function ui(fail=false){
 class El{
  constructor(dataset={}){this.dataset=dataset;this.value='0';this.checked=true;this.events={};this.attributes={};this.classList={add:()=>{}};}
  addEventListener(type,fn){this.events[type]=fn}
  setAttribute(k,v){this.attributes[k]=v}
 }
 const ids=new Map(),get=s=>{if(!ids.has(s))ids.set(s,new El());return ids.get(s)};
 const concepts=['six','four'].map(concept=>new El({concept})),views=['side','end'].map(view=>new El({view}));
 const buttons=[...concepts,...views,get('#reset-budget'),get('#try-joists')];
 const inputs=['#joist-reduction','#floor-reduction','#extra-steel','#show-panels','#show-loads'].map(get);
 get('#extra-steel').value='525';
 const document={querySelector:get,querySelectorAll:s=>({'button':buttons,'input':inputs,'[data-concept]':concepts,'[data-view]':views,'[data-baseline]':[get('baseline')],'[data-removal]':[get('removal')]}[s]||[])};
 const context=vm.createContext({document,budget,defaults,diagram,console:{error(){}},fetch:async url=>({ok:!fail,json:async()=>url.includes('road-width')?road:data})});
 const source=read('../site/assets/frame-comparison.mjs').replace(/^import[^\n]+\n/,'');
 await vm.runInContext('(async()=>{'+source+'})()',context);
 return {get,concepts,views,buttons,inputs};
}
test('UI switches concepts/views, updates budget, resets and toggles load arrows',async()=>{
 const u=await ui();assert.match(u.get('#six-budget').textContent,/4,466/);assert.equal(u.get('#support-count').textContent,'12');
 u.concepts[1].events.click();assert.equal(u.get('#support-count').textContent,'8');assert.equal(u.concepts[1].attributes['aria-pressed'],'true');
 u.views[1].events.click();assert.match(u.get('#diagram').innerHTML,/Transverse restraint unresolved/);
 u.get('#show-loads').events.change({target:{checked:false}});assert.doesNotMatch(u.get('#diagram').innerHTML,/marker-end=/);
 u.get('#try-joists').events.click();assert.equal(u.get('#joist-value').textContent,'25%');assert.match(u.get('#six-budget').textContent,/4,161/);
 u.get('#extra-steel').value=0;u.get('#extra-steel').events.input();assert.match(u.get('#budget-verdict').textContent,/524 lb lighter/);
 u.get('#reset-budget').events.click();assert.equal(u.get('#joist-value').textContent,'0%');assert.equal(u.get('#extra-value').textContent,'525 lb');
 assert.ok(u.buttons.every(b=>b.disabled===false));
});
test('fetch failure does not leave active controls or apparent calculated results',async()=>{
 const u=await ui(true);assert.match(u.get('#page-status').textContent,/could not load/);
 assert.match(u.get('#budget-verdict').textContent,/unavailable/);assert.ok(u.inputs.every(b=>b.disabled===true));
});

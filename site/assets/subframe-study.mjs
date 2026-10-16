import {budgetController} from './weight-budget.mjs';
const viewer=document.querySelector('#study'),status=document.querySelector('#status'),layers=document.querySelector('#layers'),selector=document.querySelector('#frame-layout');
const layouts={five:{revision:'v2',count:5,label:'five-station study v2'},six:{revision:'v3',count:6,label:'six-station alternative v3'}};
let manifest,ready=false,activeLayout='five';
const pounds=kg=>Math.round(kg*2.20462),fmt=n=>n.toLocaleString('en-US');
function applyLayers(){
 if(!ready)return;
 const visible=Object.fromEntries([...layers.querySelectorAll('input')].map(i=>[i.dataset.group,i.checked]));
 for(const m of viewer.model.materials){const base=manifest.materials[m.name];if(!base)continue;const show=visible[base.group];m.setAlphaMode(show?base.alphaMode:'BLEND');m.pbrMetallicRoughness.setBaseColorFactor(show?base.color:[...base.color.slice(0,3),0]);m.setEmissiveFactor(show?base.emissive:[0,0,0])}
 status.textContent=`Provisional frame ready · ${manifest.parameters.stations.length} stations · trial sections, not load-rated`;
 viewer.querySelectorAll('.station-label').forEach(el=>el.hidden=!visible.stations);
}
function drawComparison(){
 const body=document.querySelector('#frame-comparison');body.replaceChildren();
 for(const [label,key]of [['Tube steel','tube_steel_kg'],['Plywood','plywood_kg'],['Steel + floor','subtotal_kg']]){
  const a=layouts.five.manifest.mass_budget[key],b=layouts.six.manifest.mass_budget[key],row=document.createElement('tr');
  for(const [i,text]of [label,fmt(pounds(a))+' lb',fmt(pounds(b))+' lb',(b-a>0?'+':'')+fmt(pounds(b-a))+' lb'].entries()){
   const el=document.createElement(i===0?'th':'td');el.textContent=text;if(i===(activeLayout==='five'?1:2))el.classList.add('active-column');row.append(el)
  }body.append(row)
 }
}
async function loadModel(url){
 await customElements.whenDefined('model-viewer');
 if(viewer.getAttribute('src')===url&&viewer.loaded)return;
 await new Promise((resolve,reject)=>{
  const ac=new AbortController();
  viewer.addEventListener('load',event=>{if(new URL(event.detail.url,document.baseURI).href!==new URL(url,document.baseURI).href||!viewer.model)return;ac.abort();resolve()},{signal:ac.signal});
  viewer.addEventListener('error',()=>{ac.abort();reject(new Error('Model could not load'))},{once:true,signal:ac.signal});
  if(viewer.getAttribute('src')!==url)viewer.setAttribute('src',url);
 });
}
async function selectLayout(key){
 const layout=layouts[key];ready=false;layers.disabled=true;selector.disabled=true;status.classList.remove('error');status.textContent=`Loading ${layout.count}-station layout…`;
 try{
  await loadModel(`assets/models/baaabs-subframe-study-${layout.revision}.glb?v=compare-1`);
  activeLayout=key;manifest=layout.manifest;selector.value=key;
  document.querySelector('#station-heading').textContent=`${layout.count===5?'Five':'Six'} provisional stations`;
  document.querySelector('#stations').replaceChildren();
  for(const s of manifest.parameters.stations){const row=document.createElement('tr');for(const [i,text]of [s.id,(s.x_m+manifest.parameters.donor.length_m/2).toFixed(2)+' m',s.purpose].entries()){const td=document.createElement(i===0?'th':'td');td.textContent=text;row.append(td)}document.querySelector('#stations').append(row)}
  viewer.querySelectorAll('.station-label').forEach(el=>el.remove());
  for(const s of manifest.parameters.stations){const el=document.createElement('span');el.className='station-label';el.slot='hotspot-'+s.id;el.dataset.position=`${s.x_m}m 3.5m 1.3m`;el.dataset.normal='0m 0m 1m';el.textContent=s.id;viewer.append(el)}
  document.querySelector('#download-study').href=`assets/models/baaabs-subframe-study-${layout.revision}.glb`;
  document.querySelector('#download-members').href=`assets/subframe-members-${layout.revision}.csv`;
  document.querySelector('#download-parameters').href=`assets/subframe-parameters-${layout.revision}.json`;
  const mass=manifest.mass_budget;document.querySelector('#mass').textContent=`${layout.count}-station layout: tube steel ≈ ${fmt(mass.tube_steel_kg)} kg; plywood ≈ ${fmt(mass.plywood_kg)} kg. Subtotal ≈ ${fmt(mass.subtotal_kg)} kg (${fmt(pounds(mass.subtotal_kg))} lb).`;
  document.querySelector('#layout-description').textContent=key==='six'?'Alternative: B moves forward to just behind the front wheelwell; D moves aft to just ahead of the rear wheelwell; F adds a rear pair. A, C and E stay put.':'Current layout: five paired stations A–E. Preserved as the comparison baseline.';
  document.querySelector('#layout-fit').textContent=key==='six'?'B/D posts have 100 mm (3.94 in) longitudinal clearance from the modeled arch edges. F sits 148 mm (5.83 in) ahead of the rear deck edge. Actual suspension, rear-engine service and mounting clearances remain unverified.':'Both alternatives use the same reference bus and unchanged equipment. Comparing mass does not establish equal strength or stiffness.';
  budgetController?.setFrameEstimate(pounds(mass.subtotal_kg),layout.label);
  drawComparison();ready=true;layers.disabled=false;applyLayers();
 }catch(error){console.error('Subframe viewer:',error);selector.value=activeLayout;status.textContent='This layout could not load. Choose a layout to retry.';status.classList.add('error')}
 finally{selector.disabled=false}
}
selector.addEventListener('change',()=>selectLayout(selector.value));layers.addEventListener('change',applyLayers);
const views={driver:'0deg 78deg',passenger:'180deg 78deg',top:'0deg 0deg',three:'-35deg 68deg'};
const narrow=matchMedia('(max-width:850px)');let activeView='driver';
function frameView(){
 if(activeView==='entrance'){viewer.cameraTarget='-5.48m 1.6m -2m';viewer.cameraOrbit='185deg 80deg '+(narrow.matches?12:9)+'m';if(ready){layers.querySelector('[data-group=skin]').checked=true;applyLayers()}return}
 if(activeView==='generator'){viewer.cameraTarget='0.35m 1.7m -1.95m';viewer.cameraOrbit='145deg 70deg '+(narrow.matches?7:6)+'m';return}
 viewer.cameraTarget='0m 2.3m 0m';viewer.cameraOrbit=views[activeView]+' '+(narrow.matches?44:28)+'m';
}
frameView();narrow.addEventListener('change',frameView);
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.view;frameView()}));
document.querySelector('#frame-only').addEventListener('click',()=>{layers.querySelectorAll('input').forEach(i=>i.checked=['stations','deckframe','bracing','mounts','chassis'].includes(i.dataset.group));applyLayers()});
document.querySelector('#reset').addEventListener('click',()=>{layers.querySelectorAll('input').forEach(i=>i.checked=!['skin','head','masts'].includes(i.dataset.group));applyLayers()});
try{
 await Promise.all(Object.values(layouts).map(async layout=>{const r=await fetch(`assets/subframe-study-${layout.revision}.json?v=compare-1`);if(!r.ok)throw new Error('Layout data unavailable');layout.manifest=await r.json()}));
 await selectLayout(new URLSearchParams(location.search).get('layout')==='six'?'six':'five');
}catch(error){console.error(error);status.textContent='Comparison data unavailable. Reload to try again.';status.classList.add('error')}

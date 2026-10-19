import {budgetController} from './weight-budget.mjs';
const viewer=document.querySelector('#study'),status=document.querySelector('#status'),layers=document.querySelector('#layers'),selector=document.querySelector('#frame-layout');
const layouts={five:{revision:'v2',count:5,label:'five-station study v2'},six:{revision:'v5',count:6,label:'six-station 2×6 first contender v5'}};
let manifest,ready=false,activeLayout='six';
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
  const a=layouts.six.manifest.mass_budget[key],b=layouts.five.manifest.mass_budget[key],row=document.createElement('tr');
  for(const [i,text]of [label,fmt(pounds(a))+' lb',fmt(pounds(b))+' lb',(b-a>0?'+':'')+fmt(pounds(b-a))+' lb'].entries()){
   const el=document.createElement(i===0?'th':'td');el.textContent=text;if(i===(activeLayout==='six'?1:2))el.classList.add('active-column');row.append(el)
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
  for(const s of manifest.parameters.stations){const el=document.createElement('span');el.className='station-label';el.slot='hotspot-'+s.id;el.dataset.position=`${s.x_m}m 3.5m ${manifest.parameters.upright_y_m}m`;el.dataset.normal='0m 0m 1m';el.textContent=s.id;viewer.append(el)}
  document.querySelector('#download-study').href=`assets/models/baaabs-subframe-study-${layout.revision}.glb`;
  document.querySelector('#download-members').href=`assets/subframe-members-${layout.revision}.csv`;
  document.querySelector('#download-parameters').href=`assets/subframe-parameters-${layout.revision}.json`;
  const mass=manifest.mass_budget;document.querySelector('#mass').textContent=`${layout.count}-station layout: tube steel ≈ ${fmt(mass.tube_steel_kg)} kg; plywood ≈ ${fmt(mass.plywood_kg)} kg. Subtotal ≈ ${fmt(mass.subtotal_kg)} kg (${fmt(pounds(mass.subtotal_kg))} lb).`;
  document.querySelector('#layout-description').textContent=key==='six'?'First contender: six paired stations A–F with rectangular uprights, 2 inches across the bus and 6 inches fore-and-aft. Longitudinal locations stay fixed; the posts retain a provisional 6 mm gap to the modeled rub rails.':'Comparison option: five paired stations A–E with the previous 3×3 uprights. This changes both station count and upright section; it is not an equal-capacity comparison.';
  document.querySelector('#layout-fit').textContent=key==='six'?'Bare upright width is 102.9 in; mirrored docking pads bring it to approximately 103.3 in. Both exceed the hard 102-inch limit. The wider fore-and-aft posts leave 61.9 mm (2.44 in) at the B/D wheel-arch edges and 110 mm (4.33 in) ahead of the rear deck edge. Field clearance and strength remain unverified.':'The five-station alternative retains its original sections and lateral spacing. Comparing weight does not establish equal strength or stiffness.';
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
 await selectLayout(new URLSearchParams(location.search).get('layout')==='five'?'five':'six');
}catch(error){console.error(error);status.textContent='Comparison data unavailable. Reload to try again.';status.classList.add('error')}

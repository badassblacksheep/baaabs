const q=s=>document.querySelector(s),viewer=q('#mount-model'),status=q('#status');
let mode='assembled',ready=false;const original=new Map();
const labels=[['station','1 · Station',[-.85,2.13,1.2938]],['fixed','2 · Removable arm',[-.85,2.44,1.65]],['seat','3 · Removable seat',[-.85,2.675,2.02]],['fastener','4 · Panel retainer',[-.795,3.08,1.99]],['cassette','5 · Backing frame',[.75,3.08,2.02]],['skin','6 · Existing panels',[.75,3.37,2.33]],['dock','7 · Station docking pad',[-.85,2.703,1.3379]],['stationbolt','8 · Removable station bolts',[-.85,2.743,1.3538]]];
const names={assembled:'Assembled',exploded:'Exploded',transport:'Arms removed'};
function refreshLabels(){
 viewer.querySelectorAll('.label').forEach(el=>el.remove());
 if(!q('#mount-labels').checked)return;
 for(const [group,name,point]of labels){
  if(mode==='transport'&&!['station','dock'].includes(group))continue;
  if(group==='skin'&&!q('#mount-skin').checked||group==='station'&&!q('#mount-station').checked)continue;
  const el=document.createElement('span');el.className='label';el.textContent=name;el.slot='hotspot-'+group;
  const [x,y,z]=point,moving=['cassette','skin'].includes(group),offset={fixed:.32,seat:.32,fastener:.65,stationbolt:.16}[group]||0;
  el.dataset.position=`${x}m ${y+(moving && mode==='exploded' ? .14 : 0)}m ${z+(mode==='exploded'?(moving ? .9 : offset):0)}m`;el.dataset.normal='0m 0m 1m';viewer.append(el);
 }
}
function layers(){
 if(!ready)return;
 for(const m of viewer.model.materials){
  if(m.isLoaded===false)continue;
  if(!original.has(m))original.set(m,{color:[...m.pbrMetallicRoughness.baseColorFactor],alpha:m.getAlphaMode()});
  const base=original.get(m),input={Mount_skin:'#mount-skin',Mount_context:'#mount-context',Mount_station:'#mount-station'}[m.name],visible=input?q(input).checked:true;
  m.setAlphaMode(visible?base.alpha:'BLEND');m.pbrMetallicRoughness.setBaseColorFactor(visible?base.color:[...base.color.slice(0,3),0]);
 }
 refreshLabels();
}
function camera(view){
 if(view==='joint'){viewer.cameraTarget='-0.85m 2.703m 2m';viewer.cameraOrbit='35deg 65deg 0.8m';q('#view-note').textContent='Panel-to-arm connection: the seat, outer receiver and brace leave with the orange bracket. The teal panel region can detach separately.'}
 else if(view==='station'){viewer.cameraTarget='-0.85m 2.703m 1.2938m';viewer.cameraOrbit='40deg 65deg 0.65m';q('#view-note').textContent='Arm-to-station connection: remove the station bolts to release the orange root flange. Turn off Station tubes to inspect the full-depth sleeves; captive nuts are enclosed inside them. Bolts release from outside; tool clearance and connection strength remain unverified.'}
 else{viewer.cameraTarget=mode==='exploded'?'0.75m 2.6m 2.3m':mode==='transport'?'0.75m 2.1m 1.2938m':'0.75m 2.6m 1.9m';viewer.cameraOrbit=`${view==='outside'?25:145}deg 65deg ${mode==='exploded'?8:7}m`;q('#view-note').textContent=mode==='transport'?'Arms removed from this local bay. Station pads, sleeves and enclosed captive nuts remain; purple pieces are existing frame references. The current paired uprights alone are 104.9 inches wide, so this is not a verified road configuration.':'Local bay cutaway: driver-side uprights C and D are 10.62 ft apart. The remainder of the sheep is omitted so the connection is visible.'}
}
function layout(value){
 if(value===mode&&ready){camera('back');return}
 const url=`assets/models/baaabs-panel-mounting-v3${value==='assembled'?'':'-'+value}.glb`,retry=viewer.getAttribute('src')===url&&!ready;
 mode=value;ready=false;original.clear();q('#mount-layers').disabled=true;status.textContent='Loading '+names[value].toLowerCase()+' concept…';
 for(const key of Object.keys(names))q('#'+key).setAttribute('aria-pressed',String(value===key));
 viewer.src=retry?url+'?retry='+Date.now():url;camera('back');refreshLabels();
}
viewer.addEventListener('load',event=>{if(event.detail?.url&&new URL(event.detail.url,document.baseURI).href!==new URL(viewer.src,document.baseURI).href)return;ready=true;layers();q('#mount-layers').disabled=false;status.textContent=names[mode]+' concept · Drag to rotate; scroll or pinch to zoom.'});
viewer.addEventListener('error',()=>{ready=false;status.textContent='The 3D model could not load. Choose a view to retry; downloads remain available.'});
for(const key of Object.keys(names))q('#'+key).addEventListener('click',()=>layout(key));
for(const id of ['skin','context','labels','station'])q('#mount-'+id).addEventListener('change',layers);
q('#view-back').addEventListener('click',()=>camera('back'));q('#view-outside').addEventListener('click',()=>camera('outside'));
for(const view of ['joint','station'])q('#view-'+view).addEventListener('click',()=>{if(mode!=='assembled')layout('assembled');camera(view)});
await customElements.whenDefined('model-viewer');layout('assembled');
try{const r=await fetch('assets/panel-mounting-v3.json');if(!r.ok)throw Error('Weight data unavailable');const data=await r.json();q('#region-weight').textContent=Math.round(data.moving_region_kg*2.20462)+' lb';q('#mount-weight').textContent=Math.round(data.added_mounting_kg*2.20462)+' lb';q('#bracket-weight').textContent=Math.round(data.removable_arm_assemblies_kg['C-lower']*2.20462)+' lb'}catch{for(const id of ['region-weight','mount-weight','bracket-weight'])q('#'+id).textContent='See download'}

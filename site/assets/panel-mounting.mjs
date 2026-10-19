const q=s=>document.querySelector(s),viewer=q('#mount-model'),status=q('#status');
let exploded=false,ready=false;const original=new Map();
const labels=[['station','1 · Station',[-.85,2.13,1.30],false],['fixed','2 · Braced arm',[-.85,2.44,1.65],false],['seat','3 · Seat',[-.85,2.675,2.02],false],['fastener','4 · Retainer',[-.795,3.08,1.99],false],['cassette','5 · Backing frame',[.75,3.08,2.02],true],['skin','6 · Existing panels',[.75,3.37,2.33],true]];
function refreshLabels(){
 viewer.querySelectorAll('.label').forEach(el=>el.remove());
 if(!q('#mount-labels').checked)return;
 for(const [group,name,point,moving]of labels){
  if(group==='skin'&&!q('#mount-skin').checked)continue;
  const el=document.createElement('span');el.className='label';el.textContent=name;el.slot='hotspot-'+group;
  const [x,y,z]=point;el.dataset.position=`${x}m ${y+(moving && exploded ? .14 : 0)}m ${z+(moving && exploded ? .9 : group==='fastener' && exploded ? .42 : 0)}m`;el.dataset.normal='0m 0m 1m';viewer.append(el);
 }
}
function layers(){
 if(!ready)return;
 for(const m of viewer.model.materials){
  if(m.isLoaded===false)continue;
  if(!original.has(m))original.set(m,{color:[...m.pbrMetallicRoughness.baseColorFactor],alpha:m.getAlphaMode()});
  const base=original.get(m),visible=m.name==='Mount_skin'?q('#mount-skin').checked:m.name==='Mount_context'?q('#mount-context').checked:true;
  m.setAlphaMode(visible?base.alpha:'BLEND');m.pbrMetallicRoughness.setBaseColorFactor(visible?base.color:[...base.color.slice(0,3),0]);
 }
 refreshLabels();
}
function camera(view){
 if(view==='joint'){viewer.cameraTarget='-0.85m 2.703m 2m';viewer.cameraOrbit='35deg 65deg 0.8m';q('#view-note').textContent='Lower joint C: orange seat below the teal frame, pink isolators between materials, bolted flanges retaining the region. Inboard nut access still needs design.'}
 else{viewer.cameraTarget=exploded?'0.75m 2.6m 2.3m':'0.75m 2.6m 1.9m';viewer.cameraOrbit=`${view==='outside'?25:145}deg 65deg ${exploded?8:7}m`;q('#view-note').textContent='Local bay cutaway: driver-side uprights C and D are 10.62 ft apart. The remainder of the sheep is omitted so the connection is visible.'}
}
function layout(value){
 if(value===exploded&&ready){camera('back');return}
 const url=`assets/models/baaabs-panel-mounting-v1${value?'-exploded':''}.glb`;
 const retry=viewer.getAttribute('src')===url&&!ready;
 exploded=value;ready=false;original.clear();q('#mount-layers').disabled=true;status.textContent='Loading '+(value?'exploded':'assembled')+' concept…';
 q('#assembled').setAttribute('aria-pressed',String(!value));q('#exploded').setAttribute('aria-pressed',String(value));
 viewer.src=retry?url+'?retry='+Date.now():url;camera('back');refreshLabels();
}
viewer.addEventListener('load',event=>{if(event.detail?.url&&new URL(event.detail.url,document.baseURI).href!==new URL(viewer.src,document.baseURI).href)return;ready=true;layers();q('#mount-layers').disabled=false;status.textContent=(exploded?'Exploded':'Assembled')+' concept · Drag to rotate; scroll or pinch to zoom.'});
viewer.addEventListener('error',()=>{ready=false;status.textContent='The 3D model could not load. Choose Assembled or Exploded to retry; downloads remain available.'});
q('#assembled').addEventListener('click',()=>layout(false));q('#exploded').addEventListener('click',()=>layout(true));
for(const id of ['skin','context','labels'])q('#mount-'+id).addEventListener('change',layers);
q('#view-back').addEventListener('click',()=>camera('back'));q('#view-outside').addEventListener('click',()=>camera('outside'));
q('#view-joint').addEventListener('click',()=>{if(exploded)layout(false);camera('joint')});
await customElements.whenDefined('model-viewer');layout(false);
try{const r=await fetch('assets/panel-mounting-v1.json');if(!r.ok)throw Error('Weight data unavailable');const data=await r.json();q('#region-weight').textContent=Math.round(data.moving_region_kg*2.20462)+' lb';q('#mount-weight').textContent=Math.round(data.added_mounting_kg*2.20462)+' lb'}catch{q('#region-weight').textContent='See download';q('#mount-weight').textContent='See download'}

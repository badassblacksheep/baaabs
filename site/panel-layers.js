// Framing visibility shares the highlight lifecycle, so hidden panels stay hidden.
(()=>{
 const groups=['subframe','deckframe','mounts','panels','bus','deck','equipment'].filter(g=>document.querySelector('#layer-'+g));
 const inputs=Object.fromEntries(groups.map(g=>[g,document.querySelector('#layer-'+g)]));
 const originals=new Map();
 // Road configuration is a conservative visibility study, not a certified road model.
 const roadLabel=document.createElement('label');
 roadLabel.style.cssText='display:flex;gap:8px;align-items:center;margin:10px 0;font-weight:650';
 const roadInput=document.createElement('input');
 roadInput.type='checkbox';roadInput.id='road-configuration';roadInput.style.cssText='min-width:0;flex:none';
 roadLabel.append(roadInput,document.createTextNode('Road configuration · retained modifications only'));
 const roadNote=document.createElement('p');
 roadNote.className='note';
 roadNote.textContent='Conservative preview: shows the donor bus only. Permanent post foundations and other retained modifications are not yet separated in this model; hidden does not mean removable or road-compliant.';
 document.querySelector('#workshop-layers .layer-options')?.before(roadLabel,roadNote);
 const roadSaved=new Map();
 roadInput.addEventListener('change',()=>{
   if(roadInput.checked){
     for(const [g,input] of Object.entries(inputs)){roadSaved.set(g,input.checked);input.checked=g==='bus';input.disabled=true;}
   }else{
     for(const [g,input] of Object.entries(inputs)){input.disabled=false;input.checked=roadSaved.get(g)??true;}
   }
   apply();
 });
 const groupOf=m=>m.name.startsWith('Panel_')?'panels':m.name.match(/^Workshop_([^_]+)_/)?.[1];
 window.workshopMaterialVisible=m=>inputs[groupOf(m)]?.checked!==false;
 window.workshopPanelsVisible=()=>inputs.panels.checked;
 function apply(){
  if(!model.model)return;
  stopPicking();restoreHighlights();
  for(const material of model.model.materials){
   if(material.isLoaded===false)continue;
   const group=groupOf(material);if(!inputs[group])continue;
   if(!originals.has(material))originals.set(material,{color:[...material.pbrMetallicRoughness.baseColorFactor],emissive:[...material.emissiveFactor],alpha:material.getAlphaMode()});
   const base=originals.get(material),visible=inputs[group].checked;
   material.setAlphaMode(visible?base.alpha:'BLEND');
   material.pbrMetallicRoughness.setBaseColorFactor(visible?base.color:[...base.color.slice(0,3),0]);
   material.setEmissiveFactor(visible?base.emissive:[0,0,0]);
  }
  document.querySelector('.model-stage').classList.toggle('panels-hidden',!inputs.panels.checked);
  paintHighlights();
 }
 window.revealWorkshopPanels=()=>{if(!inputs.panels.checked){inputs.panels.checked=true;apply()}};
 for(const input of Object.values(inputs))input.addEventListener('change',apply);
 document.querySelector('#show-framing').addEventListener('click',()=>{
   if(roadInput.checked){roadInput.checked=false;roadInput.dispatchEvent(new Event('change'))}
   for(const g of groups)inputs[g].checked=['bus','deckframe','mounts'].includes(g);
   apply();model.cameraTarget='-0.6m 2m 0m';model.cameraOrbit='-125deg 70deg 18m';
 });
 document.querySelector('#restore-layers').addEventListener('click',()=>{for(const input of Object.values(inputs))input.checked=true;apply()});
 model.addEventListener('load',()=>{originals.clear();apply();document.querySelector('#workshop-layers').disabled=false});
 if(model.model){apply();document.querySelector('#workshop-layers').disabled=false}
})();

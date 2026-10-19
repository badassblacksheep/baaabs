// Framing visibility shares the highlight lifecycle, so hidden panels stay hidden.
(()=>{
 const groups=['subframe','deckframe','panels','bus','deck','equipment'];
 const inputs=Object.fromEntries(groups.map(g=>[g,document.querySelector('#layer-'+g)]));
 const originals=new Map();
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
 document.querySelector('#show-framing').addEventListener('click',()=>{for(const g of groups)inputs[g].checked=['subframe','deckframe'].includes(g);apply();model.cameraTarget='0m 2m 0m';model.cameraOrbit='-35deg 68deg 24m'});
 document.querySelector('#restore-layers').addEventListener('click',()=>{for(const input of Object.values(inputs))input.checked=true;apply()});
 model.addEventListener('load',()=>{originals.clear();apply();document.querySelector('#workshop-layers').disabled=false});
 if(model.model){apply();document.querySelector('#workshop-layers').disabled=false}
})();

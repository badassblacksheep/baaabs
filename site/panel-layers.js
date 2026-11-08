// Framing visibility shares the highlight lifecycle, so hidden panels stay hidden.
(()=>{
 const groups=['subframe','deckframe','mounts','panels','bus','deck','equipment'].filter(g=>document.querySelector('#layer-'+g));
 const inputs=Object.fromEntries(groups.map(g=>[g,document.querySelector('#layer-'+g)]));
 const originals=new WeakMap();
 const paintBlack=document.querySelector('#paint-black');
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
 const eyeMaterials=new Set();
 function identifyEyes(){
  eyeMaterials.clear();
  const gltf=model.originalGltfJson;
  for(const node of gltf?.nodes??[]){
   if(node.extras?.component!=='eye_effect')continue;
   for(const primitive of gltf.meshes[node.mesh]?.primitives??[]){
    eyeMaterials.add(gltf.materials[primitive.material]?.name);
   }
  }
 }
 window.workshopMaterialVisible=m=>inputs[groupOf(m)]?.checked!==false &&
  (!eyeMaterials.has(m.name) || inputs.panels.checked);
 window.workshopPanelsVisible=()=>inputs.panels.checked;
 function apply(){
  if(!model.model)return;
  stopPicking();restoreHighlights();
  for(const material of model.model.materials){
   if(material.isLoaded===false)continue;
   const group=groupOf(material);if(!inputs[group])continue;
   const pbr=material.pbrMetallicRoughness;
   if(!originals.has(material))originals.set(material,{
    color:[...pbr.baseColorFactor],emissive:[...material.emissiveFactor],alpha:material.getAlphaMode(),
    metallic:pbr.metallicFactor,roughness:pbr.roughnessFactor
   });
   const base=originals.get(material),visible=window.workshopMaterialVisible(material);
   const paintedPanel=group==='panels' && paintBlack?.checked;
   const color=paintedPanel?[0.006,0.006,0.006,base.color[3]]:base.color;
   if(group==='panels'){
    pbr.setMetallicFactor(paintedPanel?0:base.metallic);
    pbr.setRoughnessFactor(paintedPanel?1:base.roughness);
   }
   material.setAlphaMode(visible?base.alpha:'BLEND');
   pbr.setBaseColorFactor(visible?color:[...color.slice(0,3),0]);
   material.setEmissiveFactor(visible?base.emissive:[0,0,0]);
  }
  document.querySelector('.model-stage').classList.toggle('panels-hidden',!inputs.panels.checked);
  paintHighlights();
 }
 window.revealWorkshopPanels=()=>{if(!inputs.panels.checked){inputs.panels.checked=true;apply()}};
 paintBlack?.addEventListener('change',apply);
 for(const input of Object.values(inputs))input.addEventListener('change',apply);
 document.querySelector('#show-framing').addEventListener('click',()=>{
   if(roadInput.checked){roadInput.checked=false;roadInput.dispatchEvent(new Event('change'))}
   for(const g of groups)inputs[g].checked=['bus','deckframe','mounts'].includes(g);
   apply();model.cameraTarget='-0.6m 2m 0m';model.cameraOrbit='-125deg 70deg 18m';
 });
 document.querySelector('#restore-layers').addEventListener('click',()=>{for(const input of Object.values(inputs))input.checked=true;apply()});
 model.addEventListener('load',()=>{identifyEyes();apply();document.querySelector('#workshop-layers').disabled=false});
 if(model.model){identifyEyes();apply();document.querySelector('#workshop-layers').disabled=false}
})();

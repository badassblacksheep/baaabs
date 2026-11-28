// Framing visibility shares the highlight lifecycle, so hidden panels stay hidden.
(()=>{
 const groups=['subframe','deckframe','mounts','panels','bus','deck','equipment'].filter(g=>document.querySelector('#layer-'+g));
 const inputs=Object.fromEntries(groups.map(g=>[g,document.querySelector('#layer-'+g)]));
 const originals=new WeakMap();
 const barePreview=document.querySelector('#preview-bare-steel');
 // Keep the donor and the retained floor visible together in travel trim.
 const roadLabel=document.createElement('label');
 roadLabel.style.cssText='display:flex;gap:8px;align-items:center;margin:10px 0;font-weight:650';
 const roadInput=document.createElement('input');
 roadInput.type='checkbox';roadInput.id='road-configuration';roadInput.style.cssText='min-width:0;flex:none';
 roadLabel.append(roadInput,document.createTextNode('Road configuration · retained modifications only'));
 const roadNote=document.createElement('p');
 roadNote.className='note';
 const hasWings=document.querySelector('#model')?.hasAttribute?.('data-folding-floor');
 roadNote.textContent=hasWings?'Road view shows Earl with the plywood fitted, wings folded down and support arms retracted.':'Road preview shows the donor bus.';

 document.querySelector('#workshop-layers .layer-options')?.before(roadLabel,roadNote);
 let supportDetail=false;
 const roadSaved=new Map();
 roadInput.addEventListener('change',()=>{
   supportDetail=false;
   if(roadInput.checked){
     for(const [g,input] of Object.entries(inputs)){roadSaved.set(g,input.checked);input.checked=g==='bus' || (hasWings && ['deck','deckframe','mounts'].includes(g));input.disabled=true;}
   }else{
     for(const [g,input] of Object.entries(inputs)){input.disabled=false;input.checked=roadSaved.get(g)??true;}
   }
   apply();
 });
 const specialMaterials=new Map();
 const specialComponents=new Map(DATA.special_items.map(item=>[item.component,item]));
 window.workshopSpecialItem=material=>specialMaterials.get(material?.name);
 const groupOf=m=>specialMaterials.has(m.name)||m.name.startsWith('Panel_')?'panels':m.name.match(/^Workshop_([^_]+)_/)?.[1];
 const eyeMaterials=new Set(), retained=new Set(), poses=new Map();
 function identifyLayerMaterials(){
  specialMaterials.clear();
  eyeMaterials.clear();
  const gltf=model.originalGltfJson;
  retained.clear();poses.clear();
  for(const m of gltf?.materials??[])if(m.extras?.floor_pose)poses.set(m.name,m.extras.floor_pose);
  for(const node of gltf?.nodes??[]){
   const item=specialComponents.get(node.extras?.component);
   const eye=node.extras?.component==='eye_effect';
   if(!item && !eye && !node.extras?.road_retained)continue;
   for(const primitive of gltf.meshes[node.mesh]?.primitives??[]){
    const name=gltf.materials[primitive.material]?.name;
    if(item)specialMaterials.set(name,item);
    if(eye)eyeMaterials.add(name);
    if(node.extras?.road_retained)retained.add(name);
   }
  }
 }
 window.workshopMaterialVisible=m=>inputs[groupOf(m)]?.checked!==false &&
  (!eyeMaterials.has(m.name) || inputs.panels.checked) &&
  (!roadInput.checked || !hasWings || retained.has(m.name)) &&
  (poses.get(m.name)!=='folded' || (!inputs.panels.checked && !supportDetail)) &&
  (poses.get(m.name)!=='event' || inputs.panels.checked || supportDetail) &&
  (!supportDetail || ['deckframe','mounts'].includes(groupOf(m)));
 window.workshopPanelsVisible=()=>inputs.panels.checked;
 function apply(){
  if(!model.model)return;
  stopPicking();restoreHighlights();
  for(const material of model.model.materials){
   if(material.isLoaded===false)continue;
   const group=groupOf(material);if(!inputs[group] && !hasWings)continue;
   const pbr=material.pbrMetallicRoughness;
   if(!originals.has(material))originals.set(material,{
    color:[...pbr.baseColorFactor],emissive:material.name.startsWith('Workshop_equipment_Eye_')?null:[...material.emissiveFactor],alpha:material.getAlphaMode(),
    cutoff:material.getAlphaMode()==='MASK'?material.getAlphaCutoff():null,
    metallic:pbr.metallicFactor,roughness:pbr.roughnessFactor
   });
   const base=originals.get(material),visible=window.workshopMaterialVisible(material);
   const bare=material.name.startsWith('Panel_') && barePreview?.checked;
   const folded=poses.get(material.name)==='folded';
   const color=folded?[...base.color.slice(0,3),1]:bare?[1,1,1,base.color[3]]:base.color;
   if(group==='panels'){
    pbr.setMetallicFactor(bare?Number(barePreview.dataset.metallic):base.metallic);
    pbr.setRoughnessFactor(bare?Number(barePreview.dataset.roughness):base.roughness);
   }
   const mode=visible?(folded?'OPAQUE':base.alpha):(poses.has(material.name)?'MASK':'BLEND');
   if(material.getAlphaMode()!==mode){
    material.setAlphaMode(mode);
    // model-viewer resets MASK to 0.5, which clips the entire sheet at distant mip levels.
    if(mode==='MASK')material.setAlphaCutoff(base.cutoff??.5);
   }
   pbr.setBaseColorFactor(visible?color:[...color.slice(0,3),0]);
   if(base.emissive)material.setEmissiveFactor(visible?base.emissive:[0,0,0]);
  }
  document.querySelector('.model-stage').classList.toggle('panels-hidden',!inputs.panels.checked);
  if(hasWings)document.querySelector('#rear-frame-status').textContent=supportDetail?
    'Support detail · wings level, arms extended, outer bearing saddles visible.':
    inputs.panels.checked?'Event configuration · wings level, arms extended, perimeter guard on the equipment layer.':
    (roadInput.checked?'Road configuration':'Wings folded')+' · support arms retracted inside the fixed receivers.';
  window.updatePanelVisibility?.(model, true);
  paintHighlights();
 }
 function leaveRoad(){
  if(roadInput.checked){roadInput.checked=false;roadInput.dispatchEvent(new Event('change'))}
 }
 window.revealWorkshopPanels=()=>{leaveRoad();supportDetail=false;if(!inputs.panels.checked){inputs.panels.checked=true;apply()}};
 barePreview?.addEventListener('change',apply);
 for(const input of Object.values(inputs))input.addEventListener('change',()=>{supportDetail=false;apply()});
 document.querySelector('#inspect-wing-supports')?.addEventListener('click',()=>{
   leaveRoad();supportDetail=true;
   for(const g of groups)inputs[g].checked=['deckframe','mounts'].includes(g);
   apply();model.cameraTarget='0m 3.8m 0m';model.cameraOrbit='-125deg 101deg 12m';
 });
 document.querySelector('#show-framing').addEventListener('click',()=>{
   leaveRoad();supportDetail=false;
   for(const g of groups)inputs[g].checked=['bus','deckframe','mounts'].includes(g);
   apply();model.cameraTarget='-0.6m 2m 0m';model.cameraOrbit='-125deg 70deg 18m';
 });
 document.querySelector('#restore-layers').addEventListener('click',()=>{leaveRoad();supportDetail=false;for(const input of Object.values(inputs))input.checked=true;apply()});
 model.addEventListener('load',()=>{identifyLayerMaterials();apply();document.querySelector('#workshop-layers').disabled=false});
 if(model.model){identifyLayerMaterials();apply();document.querySelector('#workshop-layers').disabled=false}
})();

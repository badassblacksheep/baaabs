import {foldingFloor} from './floor.mjs';
import {wingGeometry,shellFit,deployedSeats} from './wings.mjs';
import {createViewer} from '../modular-07/viewer.mjs?v=wing-color';
import {IN} from '../modular-07/backbone.mjs';

const byId=id=>document.getElementById(id);
const num=(v,d=0)=>v.toLocaleString('en-US',{maximumFractionDigits:d});
async function read(url) {
  const response=await fetch(url);
  if(!response.ok) throw Error('Could not load '+url.pathname);
  return response.json();
}
async function run() {
  const moduleUrl=new URL(import.meta.url);
  const old=new URL('../modular-07/design.json',moduleUrl);
  const [design,shape]=await Promise.all([read(old),read(new URL('design.json',moduleUrl))]);
  const [recipe,material,prior,outline,panels,datum]=await Promise.all([
    read(new URL(design.inputs.recipe,old)),read(new URL(design.inputs.material,old)),
    read(new URL(shape.baseline,moduleUrl)),read(new URL('../road-08/donor.json',moduleUrl)),
    read(new URL(design.inputs.panels,old)),read(new URL(design.inputs.shellConfig,old))]);
  const study=foldingFloor({design,frame:recipe.candidate,donor:recipe.donor,material},prior,shape);
  const {base,layout,fixedArea,wingArea}=study;
  const fit=shellFit(layout,panels,datum);
  const donor=outline.map(points=>({layer:'donor',kind:'line',points}));
  const visible=new Set(['primary','deck','shores','wing','donor','panels']);
  const viewer=createViewer(byId('viewport'),()=>{});
  let underside=false;
  function draw() {
    const angle=Number(byId('wing-angle').value);
    const fitted=byId('faces').value==='fitted';
    const overlay=byId('show-fit');
    overlay.disabled=angle===0;
    const steel=base.modes.open.items.filter(i=>!underside || i.layer!=='shores');
    const items=[...(underside?[]:donor),...steel,...study.trimmers,...(fitted?study.fixedFaces:[]),
      ...wingGeometry(layout,angle,fitted)];
    if(angle===90) items.push(...deployedSeats(layout));
    if(overlay.checked && angle>0) items.push(...fit.crowns,...fit.head);
    viewer.setScene(items,visible,{mode:'road',nodes:[],label:'Gold · wings     Blue · center floor'});
    const state=angle===0?'Folded for the travel study':angle===90?'Level for the event layout':'Swinging out and up';
    byId('scene-note').textContent=state+' · '+(fitted?'plywood fitted':'bare frames')+
      (overlay.checked && angle>0?' · pink shows the crown above the deployed wings and the head section at floor height.':'.');
  }
  for(const id of ['wing-angle','faces','show-fit']) byId(id).onchange=draw;
  byId('reset').onclick=()=>{underside=false;draw();viewer.reset();};
  for(const button of document.querySelectorAll('[data-angle]')) button.onclick=()=>{
    underside=button.dataset.angle==='underside';draw();viewer.angle(button.dataset.angle);
  };
  const rows=[
    ['Fixed walking surface',num(base.areaFt2)+' ft²',num(fixedArea)+' ft² with the narrower nose'],
    ['Side extensions','None',num(wingArea)+' ft² across both wings'],
    ['Gross deployed footprint',num(base.areaFt2)+' ft²',num(fixedArea+wingArea)+' ft² · net gain '+num(fixedArea+wingArea-base.areaFt2)+' ft²'],
    ['Intermediate shores',base.stationsIn.length+' pairs',base.stationsIn.length+' pairs plus the end portals'],
    ['Modeled steel, plywood stowed',num(base.modes.open.installedLb)+' lb',num(study.steelLb)+' lb'],
    ['Modeled steel and plywood',num(base.modes.decked.installedLb)+' lb',num(study.deckedLb)+' lb · adds '+num(study.deckedLb-base.modes.decked.installedLb)+' lb'],
    ['Nominal sheet stock',num(base.deck.plyStock)+' sheets',num(study.stockCore)+' center + '+study.stockWings+' wing sheets']];
  for(const [label,a,b] of rows) {
    const row=byId('changes').insertRow(), th=document.createElement('th');
    th.scope='row';th.textContent=label;row.append(th);
    row.insertCell().textContent=a;row.insertCell().textContent=b;
  }
  const minimum=fit.crowns.reduce((a,b)=>a.gapIn<=b.gapIn?a:b);
  byId('shell-gap').textContent='At the tightest overlap the crown is only '+num(minimum.gapIn,1)+
    ' in above the proposed wing. The pink overlay shows the parts of the registered crown that occupy standing space. Move those portions outboard in the panel phase and keep the DJ window below.';
  byId('crown-ids').textContent=fit.crowns.map(s=>s.label).join(' · ');
  byId('wing-weight').textContent='A nominal leaf contributes about '+num((study.wingPlyLb+study.wingFrameLb)/(2*study.leavesPerSide))+
    ' lb of steel and plywood before hardware. Give each leaf controlled lifting and lowering, with a positively locked bearing in the open position and a captive travel latch plus secondary retention when folded.';
  byId('fold-width').textContent='With the modeled pivot at the underside of the leaf, the folded plywood faces span '+num(2*(layout.half+layout.thickness+layout.tubeDepth)/IN,1)+
    ' in across Earl. Knuckles, latch handles, guards and real installation tolerances can increase that width. A photo of Pearl in travel trim cannot establish road clearance or authorization for Earl.';
  draw(); viewer.angle('plan');
}
run().catch(e=>{byId('scene-note').textContent=e.message+'. The design notes remain available below.';});

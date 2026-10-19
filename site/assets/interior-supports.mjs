import {study,diagram} from './interior-support-model.mjs';
const $=id=>document.getElementById(id),fmt=(n,d=0)=>n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const controls=[...document.querySelectorAll('button[data-layout],button[data-placement],button[data-view],input')];
controls.forEach(c=>c.disabled=true);
try{
 const response=await fetch('assets/interior-support-study.json');if(!response.ok)throw new Error('Study data unavailable');const data=await response.json();
 const state={layout:data.defaults.layout,placement:data.defaults.placement,view:'plan',cabin:data.defaults.clear_interior_width_in,post:data.defaults.post_width_in};
 const notes={center:['Centerline posts','Balanced reach to both roof edges, with a foundation bridge between the chassis rails. Posts interrupt the central cabin route. Check usable paths around them against the real interior.'],rail:['Posts above one chassis rail','Shorter vertical load path to a rail, but the offset roof load still creates bending and torsion to resolve. The default finished-post zone clips the centered aisle band; furniture integration or an offset aisle needs a real cabin plan.'],wall:['Posts near one interior wall','Keeps the centered aisle band clear in this layout. The roof reaches farther across the bus, while a transfer assembly extends outboard of the chassis rail. Both can add weight.']};
 function render(){const r=study(data,state);
  $('diagram').innerHTML=diagram(data,r,state.view);
  for(const key of ['layout','placement','view'])document.querySelectorAll(`[data-${key}]`).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[key]===state[key])));
  $('cabin-value').textContent=fmt(r.cabin)+' in';$('post-value').textContent=fmt(r.post,1)+' in';
  $('span-value').textContent=fmt(r.layout.max_span_m/.3048,1)+' ft';$('reach-value').textContent=fmt(r.deckReachIn/12,1)+' ft';
  $('load-value').textContent=fmt(r.layout.peak_uniform_static_load_per_post_lb)+' lb';$('aisle-value').textContent=fmt(r.aisleOverlapIn,1)+' in';
  $('placement-title').textContent=notes[r.placement][0];$('placement-note').textContent=notes[r.placement][1];
  $('moment-note').textContent=`Under the uniform static scenario, the offset load implies about ${fmt(r.eccentricMomentLbFt)} lb-ft of transverse moment to resolve at the most-loaded post region (allocated load × offset). This is not a calculated joint demand or allowable capacity; actual distribution depends on frame stiffness. Centerline zero excludes unbalanced and lateral loads. Foundation reach outboard of the nearest assumed rail: ${fmt(r.foundationOutboardReachIn,1)} in.`;
 }
 $('comparison-rows').innerHTML=data.layouts.map(l=>`<tr><th>${l.name}</th><td>${l.post_count}</td><td>${fmt(l.max_span_m/.3048,1)} ft</td><td>${fmt(l.peak_uniform_static_load_per_post_lb)} lb</td></tr>`).join('');
 for(const key of ['layout','placement','view'])document.querySelectorAll(`[data-${key}]`).forEach(b=>b.addEventListener('click',()=>{state[key]=b.dataset[key];render()}));
 for(const [id,key] of [['cabin-width','cabin'],['post-width','post']])$(id).addEventListener('input',e=>{state[key]=Number(e.target.value);render()});
 render();controls.forEach(c=>c.disabled=false);$('page-status').textContent='Study loaded · Individual posts confirmed by user; all layouts remain illustrative and unsized.';
}catch(error){$('page-status').textContent='Interactive study could not load. Reload the page or use the study-data download. No numerical results are available.';$('page-status').classList.add('error');$('diagram').textContent='Diagram unavailable. The written comparison below remains available.';}

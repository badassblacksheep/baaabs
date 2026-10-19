import {budget,defaults,diagram} from './frame-comparison-model.mjs';
const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const pounds=n=>Math.round(n).toLocaleString('en-US'),colors=['#86d4c7','#f49ac9','#f2c179','#a799e2','#aeb3c2'];
const state={concept:'six',view:'side',panels:true,loads:true};
const controls=['#joist-reduction','#floor-reduction','#extra-steel'];
const interactive=[...all('button'),...all('input')];
interactive.forEach(e=>e.disabled=true);
try{
  const fetchJSON=async url=>{const r=await fetch(url);if(!r.ok)throw new Error(`Could not load ${url}`);return r.json()};
  const [data,road]=await Promise.all([fetchJSON('assets/frame-comparison.json'),fetchJSON('assets/road-width-status.json')]);
  if(data.brief.requirements.road_width_maximum_in!==road.maximum_inches)throw new Error('Road-width requirements disagree');
  all('[data-baseline]').forEach(e=>e.textContent=pounds(data.baseline_lb));
  all('[data-removal]').forEach(e=>e.textContent=pounds(data.concepts[1].gross_removed_station_mass_lb));
  $('#current-width').textContent=road.bus_stations_and_mirrored_dock_estimate.width_in.toFixed(2)+' inches';
  $('#moment-change').textContent=Math.round((data.span_sensitivity.moment_ratio-1)*100)+'%';
  $('#deflection-change').textContent=data.span_sensitivity.deflection_ratio.toFixed(2)+'×';
  $('#mass-bar').innerHTML=data.categories.map((c,i)=>`<div class="mass-segment" style="width:${c.lb/data.baseline_lb*100}%;background:${colors[i]}" title="${c.label}: ${pounds(c.lb)} lb"></div>`).join('');
  $('#mass-list').innerHTML=data.categories.map((c,i)=>`<div class="mass-item" style="--mass-color:${colors[i]}"><strong>${pounds(c.lb)} <small>lb</small></strong><span>${c.label}</span></div>`).join('');
  function renderDiagram(){
    const c=data.concepts.find(c=>c.id===state.concept);
    $('#diagram').innerHTML=diagram(data,state);
    all('[data-concept]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.concept===state.concept)));
    all('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
    $('#concept-label').textContent=state.concept==='six'?'Concept A':'Concept B';
    $('#concept-name').textContent=c.name;
    $('#support-count').textContent=String(c.station_ids.length*2);
    $('#longest-span').textContent=(c.maximum_span_m/.3048).toFixed(1)+' ft';
    $('#concept-description').textContent=state.concept==='six'?'Keep the shorter spans. Rework floor construction and member efficiency before removing supports.':'Retain A, C, D and F for this trial. Longitudinal trusses would redistribute floor loads to four pairs of supports; their net added weight remains unknown.';
    $('#diagram-note').textContent=state.view==='end'?'Both concepts need designed transverse restraint. This diagram shows only the gravity load path; it does not imply that the pictured unbraced frame is stable.':'Side view shows one row of supports; each station is a pair. Positions follow the current unmeasured model. Truss depth, panel connections and member sections are schematic; bracing details are omitted.';
  }
  function renderBudget(){
    const result=budget(data,{joistReduction:$('#joist-reduction').value,floorReduction:$('#floor-reduction').value,extraSteel:$('#extra-steel').value});
    $('#joist-value').textContent=result.joistReduction+'%';$('#floor-value').textContent=result.floorReduction+'%';$('#extra-value').textContent=pounds(result.extraSteel)+' lb';
    $('#six-budget').textContent=pounds(result.six)+' lb';$('#four-budget').textContent=pounds(result.four)+' lb';
    $('#budget-verdict').textContent=Math.abs(result.difference)<2?'Approximately equal under these mass assumptions.':`Four stations would be ${pounds(Math.abs(result.difference))} lb ${result.difference<0?'lighter':'heavier'} under these mass assumptions.`;
    $('#shared-saving').textContent=`Shared floor/joist target removes ${pounds(result.sharedSaving)} lb from both reference subtotals. No strength or fit result is implied.`;
  }
  all('[data-concept]').forEach(b=>b.addEventListener('click',()=>{state.concept=b.dataset.concept;renderDiagram()}));
  all('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;renderDiagram()}));
  $('#show-panels').addEventListener('change',e=>{state.panels=e.target.checked;renderDiagram()});
  $('#show-loads').addEventListener('change',e=>{state.loads=e.target.checked;renderDiagram()});
  controls.forEach(s=>$(s).addEventListener('input',renderBudget));
  $('#reset-budget').addEventListener('click',()=>{$('#joist-reduction').value=defaults.joistReduction;$('#floor-reduction').value=defaults.floorReduction;$('#extra-steel').value=defaults.extraSteel;renderBudget()});
  $('#try-joists').addEventListener('click',()=>{$('#joist-reduction').value=25;renderBudget()});
  renderDiagram();renderBudget();interactive.forEach(e=>e.disabled=false);
  $('#page-status').textContent='Brief revision 1 · Reference masses and span comparisons loaded · Measurements deferred · Neither concept approved';
}catch(error){
  console.error(error);$('#page-status').textContent='Interactive comparison could not load. The written brief remains available; use the data downloads below. Reload to try again.';$('#page-status').classList.add('error');
  $('#diagram').innerHTML='<p>Diagram data unavailable. Use the written comparison and downloadable brief.</p>';
  $('#budget-verdict').textContent='Budget unavailable until comparison data loads.';
}

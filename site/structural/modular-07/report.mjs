import {compareDecks,buildBackbone,equipmentDemand,IN} from './backbone.mjs';
import {buildShell} from './shell.mjs';
import {buildPacking} from './packing.mjs';
import {createViewer} from './viewer.mjs';

const $=id=>document.getElementById(id);
const fmt=(v,n=1)=>v.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n});
const say=(id,text)=>$(id).textContent=text;
const p=text=>Object.assign(document.createElement('p'),{textContent:text});
const option=(label,value)=>new Option(label,value);
const layers={donor:'Earl survey datums',primary:'Primary framing',shores:'Six body shores',deck:'Deck cassettes & carriers',panels:'Panel infrastructure',skin:'Registered skin & DJ frame',audio:'Audio infrastructure & MVP'};
const names={'06-archive':'Rev 06 archived','06-survey':'36 ft survey frame','07':'Rev 07'};
const dir=new URL('./',import.meta.url);
async function json(path){const r=await fetch(new URL(path,dir));if(!r.ok)throw Error('Missing '+path);return r.json()}
function row(id,values){const tr=document.createElement('tr');values.forEach((text,i)=>{const td=document.createElement(i?'td':'th');if(!i)td.scope='row';td.textContent=text;tr.append(td)});$(id).append(tr)}
function surveyStr(measurements,id){const v=measurements.find(m=>m.id===id);return v.value??v.nominal}
function broadsideAreaXZ(points){return Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[2]-q[0]*p[2]},0))/2}

async function run(){
  const design=await json('design.json');
  const entries=await Promise.all(Object.entries(design.inputs).map(async([key,path])=>[key,await json(path)]));
  const ctx={design,...Object.fromEntries(entries)};
  const {recipe,stiffness,survey,panels}=ctx;
  Object.assign(ctx,{frame:recipe.candidate,donor:recipe.donor});
  if(recipe.revision!==ctx.surveyResults.revision||recipe.surveyDate!==survey.survey_date||recipe.surveyDate!==panels.survey_date)throw Error('Survey revisions disagree');
  const opts=compareDecks(ctx);
  const active=new Set(Object.keys(layers));
  let model,shell,packing,blobUrl;
  const viewer=createViewer($('viewport'),selectNode);
  for(const [key,name] of Object.entries(layers)){
    const input=Object.assign(document.createElement('input'),{type:'checkbox',checked:true,value:key});
    const label=document.createElement('label');label.dataset.layer=key;label.append(input,' '+name);$('layers').append(label);
    input.onchange=()=>{if(input.checked)active.add(key);else active.delete(key);draw()};
  }
  for(const o of opts){$('format').add(option(o.widthIn/12+' × '+o.lengthIn/12+' ft',o.id));
    row('decks',[o.widthIn/12+' × '+o.lengthIn/12+' ft',o.count+' / '+o.seats,o.sheets+' / '+fmt(o.yield*100,0)+'%',fmt(o.eachLb,0)+' lb',fmt(o.deckLb,0)+' lb',o.rows+1]);}
  $('format').value=design.deck.selected;
  for(const [id,c] of Object.entries(design.classes))$('family').add(option(c.label,id));
  for(const m of design.audio.studyMassesKg)$('audio-mass').add(option(m+' kg',m));
  const d=design.deck, f=ctx.frame, donor=ctx.donor, a=design.audio, load=recipe.loadInputs;
  say('deck-basis',`One-piece nominal blanks from ${d.stockSheetIn.join(' × ')} in sheets, before kerf, edge gaps or trim. Estimates use ${d.plyThicknessIn} in plywood at ${d.plyLbFt2} lb/ft² and ${d.frameSectionIn.join(' × ')} in trial tube, with ribs no more than ${d.maxRibPitchIn} in apart. One pick per cassette. Four conceptual bearing contacts per pick. Weigh the shop sample with its hardware.`);
  say('audio-description',`The parked MVP is the owned pair of ${a.mvp.model} speakers, ${fmt(a.mvp.eachKg)} kg each. Both stand on the ground on the driver side and project outward. Ground reaction bypasses Earl. The upper receivers are empty and the lower cradle is an interchangeable equipment study. No audio load is assigned to plywood.`);
  const manual=document.createElement('a');manual.href=a.mvp.manual;manual.textContent='JBL owner’s manual';$('audio-description').append(' ',manual,'.');
  for(const c of stiffness.cases)row('stiffness',[names[c.model],c.jointFactor??'Continuous',fmt(c.shoreKLbfPerIn,0),fmt(c.dropMm,3),fmt(c.twistMrad,3),fmt(c.driverLoadDropMm,3),fmt(c.maxSeamTravelMm,3)]);
  const rigid=stiffness.cases.find(c=>c.model==='07' && c.jointFactor===null && c.shoreKLbfPerIn>0),
    surveyRef=stiffness.cases.find(c=>c.model==='06-survey'),flex=stiffness.cases.find(c=>c.model==='07'&&c.jointFactor===design.stiffnessStudy.crowdJointFactor && c.shoreKLbfPerIn>0);
  say('stiff-findings',`In the ${stiffness.testForceN/1000} kN vertical and ${stiffness.testTorqueNm/1000} kN·m roll probes, the continuous Rev 07 geometry retains ${fmt(100*rigid.verticalKNPerM/surveyRef.verticalKNPerM,0)}% of the surveyed baseline’s vertical stiffness and ${fmt(100*rigid.torsionalKNmPerRad/surveyRef.torsionalKNmPerRad,0)}% of its roll stiffness. At illustrative joint factor ${flex.jointFactor}, the candidate retains ${fmt(100*flex.verticalKNPerM/rigid.verticalKNPerM,0)}% and ${fmt(100*flex.torsionalKNmPerRad/rigid.torsionalKNmPerRad,0)}% of its own continuous-joint values. Stiffness of a real splice remains unknown.`);
  $('method').append(...[stiffness.method,stiffness.coordinates,stiffness.jointModel,stiffness.bounds,stiffness.idealization,stiffness.crowdBasis,stiffness.publishedBasis,...stiffness.published.map(v=>names[v.model]+' · '+fmt(v.stressMPa,2)+' MPa peak normal stress and '+fmt(v.dropIn,3)+' in peak deck drop in its own historical sweep.')].map(p));
  for(const c of stiffness.crowdCases)row('crowd-cases',[c.distribution==='centered-full'?'Full deck width':'Driver half',c.multiplier+'×',fmt(c.appliedLbf,0),fmt(c.peakVerticalDropMm,2),fmt(c.peakShoreLbf,0)]);
  say('crowd',`${load.people} people at the inherited ${load.personLbf} lbf per person gives ${fmt(load.people*load.personLbf,0)} lbf of static live load. The illustrated patch spans ${design.stiffnessStudy.crowdPatchFt} ft at midlength. These increments use joint factor ${flex.jointFactor} and ${fmt(flex.shoreKLbfPerIn,0)} lbf/in per shore. They omit dead-load preload, cassette deflection, ultimate strength and the rest of the operating load combinations.`);
  const sample=panels.pieces.find(p=>p.id===design.shell.runs[0].flankPanelId);
  const area=broadsideAreaXZ(sample.vertices_m)-sample.holes_m.reduce((v,h)=>v+broadsideAreaXZ(h),0);
  say('wind',`Sheet ${sample.id} presents ${fmt(area,2)} m² broadside to a crosswind. Illustrative net pressures of ${design.windStudy.netPressuresKPa.join(' / ')} kPa produce ${design.windStudy.netPressuresKPa.map(q=>fmt(q*area,2)).join(' / ')} kN of lateral force on that projection (F = pA). These inputs illustrate sensitivity. The perforation percentage alone does not set pressure reduction or suction.`);
  const read=id=>surveyStr(survey.measurements,id);
  say('survey-readings',`Owner’s field readings, ${survey.survey_date}: roof centerline ${read('EXT-005')} in, wheelbase ${read('EXT-002')} in, interior floor width ${read('INT-002')} in, wall/crown height ${read('INT-004')}/${read('INT-003')} in and typical pillar pitch ${read('INT-006')} in. Roof and bumper lengths have distinct endpoints. The model centers the proposed deck on the nominal bumper envelope. Aisle endpoints and pillar phase remain open.`);
  function audioDemand(){
    const v=equipmentDemand(ctx,model,Number($('audio-mass').value));
    say('audio-demand',`A hypothetical cabinet and adapter mass at x = ${fmt(v.x,2)} m aft of the front bumper, y = ${fmt(v.cgY,2)} m, adds ${fmt(v.weightKN,2)} kN downward. At the ${fmt(a.trialCradleOutreachM,2)} m trial arm it contributes ${fmt(v.localMomentKNm,2)} kN·m at the driver-side structure, or ${fmt(v.rollKNm,2)} kN·m about vehicle centerline. A ${a.brakingStudyG}g braking sensitivity gives ${fmt(v.brakeKN,2)} kN longitudinal. Static incremental axle loads are ${fmt(v.frontKg)} kg equivalent front and ${fmt(v.rearKg)} kg rear. These are total applied demands before load sharing. Cabinet restraint, dynamic amplification and restraint-point loads remain open.`);
  }
  function refresh(){
    ctx.analysis={selected:opts.find(v=>v.id===$('format').value)};
    model=buildBackbone(ctx);shell=buildShell(ctx,model.nodes);packing=buildPacking({...ctx,cargo:[...model.cargo,...shell.cargo]});
    const chosen=ctx.analysis.selected;
    $('sheet').replaceChildren(...shell.traces.map(t=>option(t.panelId,t.panelId)));
    say('geometry',`The selected layout has ${design.primary.bayCount} longitudinal bays of ${fmt(model.pitch/IN/12,1)} ft on each side and ${design.primary.bayCount-1} field seam planes. Its deck is ${f.deckLengthIn/12} × ${f.deckWidthIn/12} ft on a ${donor.roofCenterlineIn} in measured roof centerline. The six analytical shore positions retain the surveyed study’s ${f.pairPitchIn} in pair pitch. Upper and lower cross ties and plan X bracing close the assembled frame. The trial carrier stack places the walking surface ${fmt((model.deckTop-model.high)/IN,1)} in above the upper-chord centerline. Recheck rail height, stairs and roof access against that changed elevation.`);
    const flank=shell.traces.find(t=>t.panelId===design.shell.runs.find(r=>r.side===a.partySide).flankPanelId);
    const indices=[...new Set(flank.nodeIds.map(id=>model.nodes.find(n=>n.id===id).station))].sort((u,v)=>u-v);
    const crown=shell.traces.find(t=>t.panelId!==flank.panelId && t.nodeIds.every(id=>flank.nodeIds.includes(id)));
    say('prototype-bay',`Use the bay between truss positions ${indices.join(' and ')}. Its study footprint is ${fmt(model.pitch/IN/12,0)} ft long by ${f.deckWidthIn/12} ft across the deck. It picks up driver-side crown sheet ${crown.panelId} and triangular flank sheet ${flank.panelId}. One end also carries a candidate stage receiver. Mock up one ${chosen.widthIn/12} × ${chosen.lengthIn/12} ft cassette, one outer bent and those two sheet outlines. This exercises the four interfaces on a single floor-level fixture.`);
    say('shell-scope',`The view preserves ${panels.pieces.length} registered sheets and the DJ frame. It traces ${shell.traces.length} crown and flank sheets to the backbone. The remaining adapters, including the head, hooves and lower skirt, require separate pickup and stability studies. Registration stays independent of the cassette choice.`);
    $('inventory').replaceChildren();
    for(const [key,name] of Object.entries(layers).filter(([k])=>k!=='skin'&&k!=='donor')){
      const parts=packing.metrics.inventory.filter(v=>v.layer===key), sum=k=>parts.reduce((s,v)=>s+v[k],0);
      const kg=model.ledger.filter(v=>v.layer===key).reduce((s,v)=>s+(v.massKg??0)*v.count,0);
      row('inventory',[name,sum('count'),sum('inside'),sum('staged'),kg?fmt(kg,0)+' kg · '+(key==='audio'?'owned pair only':'study items only'):'Unweighed']);
    }
    $('packing-notes').replaceChildren(...packing.notes.map(p));
    $('packing-notes').append(p('Mass estimates cover the listed primary, shore, cassette/carrier and owned audio items. Secondary steel, the cradle, skins, guards, stairs, fasteners, racks and lashings need a weighed manifest before a total payload or center of gravity can be reported.'));
    if(blobUrl)URL.revokeObjectURL(blobUrl);
    blobUrl=URL.createObjectURL(new Blob([JSON.stringify({revision:design.revision,cassette:chosen.id,datum:recipe.coordinates,axes:'normal × tangent supplies the third local axis; forces and moments remain unrated',classes:design.classes,nodes:model.nodes},null,2)],{type:'application/json'}));
    $('registry-download').href=blobUrl;
    audioDemand();listNodes();draw();
  }
  function listNodes(){
    const keep=$('node').value,list=model.nodes.filter(n=>n.classId===$('family').value);
    $('node').replaceChildren(...list.map(n=>option(n.side+' · '+n.station+' · '+n.level,n.id)));
    if(list.some(n=>n.id===keep))$('node').value=keep;
  }
  function selectNode(id){const n=model.nodes.find(n=>n.id===id);if(!n)return;$('family').value=n.classId;listNodes();$('node').value=n.id;draw()}
  const datums = [
    {layer:'donor',kind:'line',points:[[0,0,0],[donor.lengthIn*IN,0,0]],label:'Nominal bumper span',guide:true},
    ...[[0,'Front bumper'],[donor.frontAxleIn,'Front axle'],[donor.rearAxleIn,'Rear axle'],[donor.lengthIn,'Rear bumper']].map(([x,label])=>({
      layer:'donor',kind:'line',points:[[x*IN,0,0],[x*IN,0,-0.23]],label,caption:true
    }))
  ];
  function draw(){
    const mode=$('mode').value, transport=mode==='transport', n=model.nodes.find(n=>n.id===$('node').value), c=design.classes[n.classId];
    const traces=shell.traces.filter(t=>(t.nodeIds??[t.nodeId]).includes(n.id));
    const trace=traces.find(t=>t.panelId===$('sheet').value)??traces[0];
    $('trace-field').hidden = n.classId!=='panel';
    if(trace)$('sheet').value=trace.panelId;
    $('inspection').hidden=transport;
    for(const id of ['skin','donor']){
      const input=$('layers').querySelector('input[value="'+id+'"]');
      input.disabled=transport;input.parentElement.title=transport?'Shown in assembled and exploded views':'';
    }
    const {metrics}=packing;
    say('scene-note',transport?`${metrics.inside} of ${metrics.modeled} envelopes in study lanes · ${metrics.staged} staged outside. Skin, DJ frame and unmeasured equipment are deferred. See inventory below.`:mode==='exploded'?'Parts separate by assembly. Offsets and gaps illustrate removal order and have no dimensional meaning. The detailed interface coordinates below are in the assembled datum.':'Drag to orbit, use the view buttons, or select an interface below. Gold projection arrows point outward on the driver side. The bright ring marks the selected visible node.');
    say('case-label',transport?'Cabin fit study':mode==='exploded'?'Exploded view':'Assembled view');
    say('node-detail',`${c.family} · ${n.id}. Model xyz [${n.positionM.map(v=>fmt(v,3)).join(', ')}] m. Face normal [${n.normal}] and tangent [${n.tangent}]. ${c.connection} Compatible with ${c.compatible.join(', ')}. ${c.access}`);
    say('trace',`${trace?trace.panelId+' · '+trace.description+' ':''}Cases: ${c.cases.join(', ')}. Verify ${c.dependencies.join(', ')}. Allowable forces and moments, hole pattern and tool envelope await review.`);
    $('trace-link').hidden=!trace;if(trace)$('trace-link').href='../the_build.html#'+trace.panelId;
    viewer.setScene(transport?packing.items:[...datums,...model.items,...shell.items],active,{mode,nodes:model.nodes,focus:n.id,trace:trace?.panelId,bayCount:design.primary.bayCount,label:transport?'Cabin floor datum · overflow beside envelope':'Earl · front bumper datum · +x aft'});
  }
  $('sheet').onchange=()=>{const t=shell.traces.find(t=>t.panelId===$('sheet').value);if(t)selectNode(t.nodeId)};
  $('family').onchange=()=>{listNodes();draw()};$('node').onchange=draw;$('format').onchange=refresh;$('mode').onchange=draw;
  $('audio-mass').onchange=audioDemand;$('reset').onclick=()=>viewer.reset();$('closer').onclick=()=>viewer.scale(1.2);$('farther').onclick=()=>viewer.scale(1/1.2);
  document.querySelectorAll('[data-angle]').forEach(b=>b.onclick=()=>viewer.angle(b.dataset.angle));
  refresh();
}
run().catch(error=>{console.error(error);say('scene-note','The assembly study could not load. '+error.message+'. The field and prototype notes below remain available.')});

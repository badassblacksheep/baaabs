(() => {
 'use strict';
 const get=id=>document.getElementById(id),form=get('design-controls'),labels=['⅛″','3/16″','¼″'];
 const fmt=(v,n=0)=>v.toLocaleString('en-US',{maximumFractionDigits:n,minimumFractionDigits:n});
 const evaluate=(r,m,min,w)=>{const reserve=207/r.stress;return {reserve,color:reserve>=1.25?'green':reserve>=1?'yellow':'red',score:100*(w*Math.min(reserve/1.25,1)+(1-w)*min/m)};};
 function show(data){
  let previousPair;
  function update(){
   const n=+get('people').value,pairs=+get('pairs').value,share=+get('panels').value/2,priority=+get('priority').value,wallIndex=+get('wall').value;
   get('people-value').textContent=n;get('pairs-value').textContent=pairs+' pairs · '+2*pairs+' shores';get('panels-value').textContent=fmt(share*100)+'% · '+fmt(share*data.panelAllowanceLbf)+' lb';get('wall-value').textContent=labels[wallIndex];
   for(const id of ['people','pairs','panels','wall'])get(id).setAttribute('aria-valuetext',get(id+'-value').textContent);
   const options=data.scenarios.filter(s=>s.share===share).map(s=>({...s,...evaluate(s.results[n],s.frameWeight,data.minFrameWeight,priority)}));
   const selected=options.filter(s=>s.pairs===pairs).sort((a,b)=>a.wallMm-b.wallMm);
   selected.forEach((s,i)=>{const r=s.results[n];get('card-'+i).className='capacity-card '+s.color+(i===wallIndex?' selected':'');
    for(const [key,value]of Object.entries({ceiling:(s.bounded?'':'≥')+s.ceiling,score:fmt(s.score),factor:fmt(345/r.stress,2),stress:fmt(r.stress),drop:fmt(r.drop,2),shore:fmt(r.shore),weight:fmt(s.frameWeight)}))get(key+'-'+i).textContent=value;
    get('status-'+i).textContent=({green:'● More stress reserve',yellow:'▲ Near the stress ceiling',red:'■ Above the stress ceiling'})[s.color]+' at '+n+' people';get('score-bar-'+i).style.width=s.score+'%';});
   const qualifying=options.filter(s=>s.reserve>=1).sort((a,b)=>b.score-a.score||a.pairs-b.pairs||a.wallMm-b.wallMm);
   const best=qualifying[0];
   get('recommendation').textContent=best?best.pairs+' shore pairs + '+labels[data.wallMm.indexOf(best.wallMm)]+' roof walls rank highest among these nine concepts below the stress ceiling at '+n+' people. Cabin uprights: zero. Body support and occupant protection remain unverified.':'None of these nine concepts clears the stress ceiling at '+n+' people with this hanging-panel allowance.';
   get('matrix-body').innerHTML=options.sort((a,b)=>a.pairs-b.pairs||a.wallMm-b.wallMm).map(s=>'<tr><th>'+s.pairs+' pairs / '+labels[data.wallMm.indexOf(s.wallMm)]+'</th><td>'+s.ceiling+'</td><td class="'+s.color+'">'+fmt(s.score)+' · '+s.color+'</td><td>'+fmt(s.results[n].stress)+'</td><td>'+fmt(s.results[n].drop,2)+'</td><td>'+fmt(s.frameWeight)+'</td></tr>').join('');
   const r=selected[wallIndex].results[n];get('case-detail').textContent='Selected thickness: '+labels[wallIndex]+'. Governing stress: '+r.member+'; '+r.stressCase+'. Peak shore reaction placement: '+r.shoreCase+'. These maxima can occur in different cases.';
   get('score-explanation').textContent=fmt(priority*100)+'% stress reserve + '+fmt((1-priority)*100)+'% lower frame, floor and shore weight. Hanging-panel weight is applied to the structure but excluded from the score denominator so changing it cannot earn a weight bonus.';
   if(previousPair!==pairs){get('shore-model').dispatchEvent(new CustomEvent('structural-variant',{detail:{id:'shores-'+pairs}}));previousPair=pairs;}
   get('model-caption').textContent=pairs+' transverse shore pairs, spaced between the front and rear portals. No cabin uprights. Outer tube geometry is common to all three wall trials; wall thickness is a calculation input. All landing locations require alignment to surveyed HDX structural members.';
  }
  form.addEventListener('input',update);form.addEventListener('change',update);form.querySelector('fieldset').disabled=false;update();
 }
 fetch('iteration-04-data.json').then(r=>{if(!r.ok)throw Error('Data unavailable');return r.json();}).then(show).catch(()=>get('design-error').hidden=false);
 get('shore-model').addEventListener('load',()=>{const model=get('shore-model');for(const material of model.model?.materials||[]){const group=material.name.match(/^Workshop_([^_]+)_/)?.[1];if(material.name.startsWith('Panel_')||['deck','equipment','rails','sound','eye_effect'].includes(group)){material.setAlphaMode('BLEND');material.pbrMetallicRoughness.setBaseColorFactor([...material.pbrMetallicRoughness.baseColorFactor.slice(0,3),0]);}}});
})();

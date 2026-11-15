(() => {
 'use strict';
 const get=id=>document.getElementById(id),form=get('capacity-controls');
 const labels=['⅛-inch','3/16-inch','¼-inch'];
 const fmt=(value,digits=0)=>value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
 function evaluate(result,weight,minWeight,priority,ceiling,yieldMPa){
  const reserve=ceiling/result.stress;
  return {reserve,factor:yieldMPa/result.stress,
   color:reserve>=1.25?'green':reserve>=1?'yellow':'red',
   score:100*(priority*Math.min(reserve/1.25,1)+(1-priority)*minWeight/weight)};
 }
 function show(data){
  const minWeight=Math.min(...data.walls.map(w=>w.dead));
  function update(){
   const n=Number(form.elements.target.value),priority=Number(form.elements.priority.value);
   get('target-value').textContent=n;form.elements.target.setAttribute('aria-valuetext',n+' people');
   const evaluations=data.walls.map((wall,i)=>{
    const r=wall.scenarios.find(s=>s.multiplier===2&&s.stiffness===5000).results[n];
    const e=evaluate(r,wall.dead,minWeight,priority,data.stressCeilingMPa,data.yieldMPa);
    get('card-'+i).className='capacity-card '+e.color;
    get('status-'+i).textContent=({green:'● More screening reserve',yellow:'▲ Near the stress ceiling',red:'■ Above the stress ceiling'})[e.color]+' at '+n+' '+(n===1?'person':'people');
    for(const [key,value]of Object.entries({score:fmt(e.score),factor:fmt(e.factor,2),stress:fmt(r.stress),drop:fmt(r.drop,2),shore:fmt(r.shore)}))get(key+'-'+i).textContent=value;
    get('score-bar-'+i).style.width=e.score+'%';return {...e,index:i};
   });
   const qualifying=evaluations.filter(e=>e.reserve>=1).sort((a,b)=>b.score-a.score||a.index-b.index);
   const best=[...evaluations].sort((a,b)=>b.score-a.score||a.index-b.index)[0];
   get('recommendation').textContent=qualifying.length?
    labels[qualifying[0].index]+' ranks highest among the concepts below the stress ceiling at '+n+' '+(n===1?'person':'people')+'. This is a concept comparison; Earl’s survey and the remaining engineering checks must establish the admission limit.':
    'None of these walls clears the declared stress criterion at '+n+' people. Revise the design for that target. '+labels[best.index]+' has the highest comparison score, while still exceeding the criterion.';
   get('score-explanation').textContent=fmt(priority*100)+'% stress reserve + '+fmt((1-priority)*100)+'% lower frame-and-plywood weight. Scores compare these three concepts; they are not probabilities of safety.';
  }
  form.addEventListener('input',update);form.addEventListener('change',update);
  form.querySelector('fieldset').disabled=false;update();
 }
 fetch('capacity-data.json').then(r=>{if(!r.ok)throw Error('Unavailable capacity data');return r.json();}).then(show).catch(()=>{
  get('capacity-error').hidden=false;
 });
 // Keep this dedicated report view focused on the bus and load-carrying concepts.
 const model=get('shore-model');
 model.addEventListener('load',()=>{
  for(const material of model.model?.materials||[]){
   const group=material.name.match(/^Workshop_([^_]+)_/)?.[1];
   if(material.name.startsWith('Panel_')||['deck','equipment','rails','sound','eye_effect'].includes(group)){
    const color=material.pbrMetallicRoughness.baseColorFactor;
    material.setAlphaMode('BLEND');material.pbrMetallicRoughness.setBaseColorFactor([...color.slice(0,3),0]);
   }
  }
 });
})();

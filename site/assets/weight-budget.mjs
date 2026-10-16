// Gross-weight planning only. No axle reactions or stability model is implied.
export const defaults = Object.freeze({gvwr:34200,wetBus:22000,seats:2000,frame:4023,other:4000,people:21,personWeight:225,reserve:2000});
export function calculateBudget(input){
 const s={...defaults,...input};
 for(const key of Object.keys(defaults))if(!Number.isFinite(s[key])||s[key]<0)throw new Error('Enter a non-negative number for every assumption.');
 if(s.gvwr<=0||s.wetBus<=0)throw new Error('Bus weight and GVWR must be greater than zero.');
 if(s.seats>=s.wetBus)throw new Error('Removed seats must weigh less than the original bus.');
 if(!Number.isInteger(s.people))throw new Error('Use a whole number of people.');
 const stripped=s.wetBus-s.seats,capacity=s.gvwr-stripped,occupants=s.people*s.personWeight,added=s.frame+s.other+occupants,gross=stripped+added,remaining=s.gvwr-gross;
 return {...s,stripped,capacity,occupants,added,gross,remaining,planningRemaining:remaining-s.reserve,percent:capacity>0?100*added/capacity:null,state:remaining<0?'over':remaining<s.reserve?'reserve':'within'};
}
const format=n=>Math.round(n).toLocaleString('en-US');
export function mountBudget(root){
 const form=root.querySelector('form'),fields=Object.fromEntries(Object.keys(defaults).map(k=>[k,form.elements.namedItem(k)]));
 const controls=root.querySelectorAll('[data-sync]');
 let modeledFrame=defaults.frame;
 function updateFrameNote(description){const note=root.querySelector('#frame-source-note');if(note)note.textContent=`The ${format(modeledFrame)} lb steel/floor subtotal comes from ${description}. Switching layouts loads that model’s subtotal; other weight inputs stay as entered. Changing this field alone does not resize the model.`}
 function render(){
  let b;
  try{b=calculateBudget(Object.fromEntries(Object.entries(fields).map(([k,el])=>[k,el.value.trim()===''?NaN:Number(el.value)])))}catch(error){root.dataset.state='invalid';root.querySelector('#weight-message').textContent=error.message;root.querySelector('#weight-results').hidden=true;return}
  root.querySelector('#weight-results').hidden=false;root.dataset.state=b.state;
  for(const [id,value] of Object.entries({stripped:b.stripped,capacity:b.capacity,frame:b.frame,other:b.other,occupants:b.occupants,added:b.added,gross:b.gross,remaining:Math.abs(b.remaining)}))root.querySelector(`[data-weight="${id}"]`).textContent=format(value)+' lb';
  root.querySelector('#weight-remaining-label').textContent=b.remaining<0?'Over assumed GVWR':'Room to assumed GVWR';
  root.querySelector('#weight-percent').textContent=b.percent===null?'No payload available':`${Math.round(b.percent)}% of payload budget used`;
  root.querySelector('#weight-status').textContent=b.remaining<0?`${format(-b.remaining)} lb over the assumed rating.`:b.planningRemaining<0?`${format(-b.planningRemaining)} lb into your ${format(b.reserve)} lb planning reserve.`:`${format(b.planningRemaining)} lb available before your ${format(b.reserve)} lb planning reserve.`;
  root.querySelector('#weight-message').textContent='';
  root.querySelector('#people-output').textContent=`${b.people} people · ${format(b.occupants)} lb`;
  root.querySelector('#other-output').textContent=`${format(b.other)} lb`;
  // Scale expands for overload rather than silently clamping the total to 100%.
  const span=Math.max(b.capacity,b.added,1),meter=root.querySelector('#weight-meter');
  for(const key of ['frame','other','occupants'])root.querySelector(`[data-segment="${key}"]`).style.width=`${100*b[key]/span}%`;
  const rating=root.querySelector('#weight-rating');rating.style.left=`${100*Math.max(0,b.capacity)/span}%`;rating.hidden=b.capacity<=0;
  const reserve=root.querySelector('#weight-reserve');reserve.style.left=`${100*Math.max(0,b.capacity-b.reserve)/span}%`;
  meter.setAttribute('aria-label',`Added load ${format(b.added)} pounds of ${format(Math.max(0,b.capacity))} pounds available under assumed GVWR. ${b.remaining<0?'Over by':'Remaining'} ${format(Math.abs(b.remaining))} pounds.`);
  for(const el of controls){if(b[el.dataset.sync]>Number(el.max))el.max=Math.ceil(b[el.dataset.sync]/Number(el.step))*Number(el.step);if(document.activeElement!==el)el.value=b[el.dataset.sync]}
  root.querySelector('#frame-below-note').hidden=b.frame>=modeledFrame;
 }
 form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('input',render);
 controls.forEach(el=>el.addEventListener('input',()=>{fields[el.dataset.sync].value=el.value;render()}));
 root.querySelector('#weight-reset').addEventListener('click',()=>{for(const [k,v]of Object.entries(defaults))fields[k].value=k==='frame'?modeledFrame:v;render()});
 render();
 return {setFrameEstimate(value,description){if(!Number.isFinite(value)||value<0)throw new Error('Invalid model mass');modeledFrame=value;fields.frame.value=value;updateFrameNote(description);render()}};
}
export const budgetController=typeof document!=='undefined'&&document.querySelector('#weight-budget')?mountBudget(document.querySelector('#weight-budget')):null;

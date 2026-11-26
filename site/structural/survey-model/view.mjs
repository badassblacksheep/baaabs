const recipeUrl='/assets/earl-survey-model.json';
const SVG='http://www.w3.org/2000/svg';
const $=id=>document.getElementById(id);
function element(svg,name,attrs={},text){const el=document.createElementNS(SVG,name);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;svg.append(el);return el}
function line(svg,x1,y1,x2,y2,stroke='#66e0e9',width=2){return element(svg,'line',{x1,y1,x2,y2,stroke,'stroke-width':width,'stroke-linecap':'round'})}
function label(svg,x,y,text,fill='#f3f0f7',anchor='middle'){return element(svg,'text',{x,y,fill,'font-size':14,'text-anchor':anchor},text)}
function row(tbody,values){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td)}tbody.append(tr)}
const fmt=(n,d=1)=>Number(n).toFixed(d);
try {
 const response=await fetch(recipeUrl);if(!response.ok)throw Error('Geometry unavailable');const r=await response.json();
 const d=r.donor, f=r.candidate, inch=.0254;
 for(const a of r.alternatives)row($('alternatives'),[a.deckLengthIn/12+' × '+a.deckWidthIn/12+' ft',a.grossAreaFt2+' ft²',(a.deltaFromBusIn>0?'+':'')+a.deltaFromBusIn+' in',(a.nominalCenteredEndProjectionIn>0?'+':'')+fmt(a.nominalCenteredEndProjectionIn)+' in']);
 $('geometry').textContent='Nominal bus length '+d.lengthIn+' in · Wheelbase '+d.wheelbaseIn+' in · Candidate deck '+f.deckLengthIn/12+' ft · Shore-pair pitch '+f.pairPitchIn+' in · Largest modeled joist gap '+fmt(f.maxJoistGapIn)+' in.';
 const x=m=>50+860*m/(d.lengthIn*inch);
 const side=$('side'), z=m=>305-65*m;
 for(const m of f.members)line(side,x(m.a[0]),z(m.a[2]),x(m.b[0]),z(m.b[2]),'#66e0e9',1.7);
 for(const p of f.shorePositions.filter(p=>p[1]<0)){line(side,x(p[0]),z(f.shoreGeometry.landingM),x(p[0]),z(p[2]),'#ff9c4a',5)}
 const datum=350;line(side,x(0),datum,x(d.lengthIn*inch),datum,'#a9a4b2');
 for(const [name,position] of [['Front bumper',0],['Front axle',d.frontAxleIn],['Rear axle',d.rearAxleIn],['Rear bumper',d.lengthIn]]){
   const px=x(position*inch);line(side,px,datum-8,px,datum+8,'#a9a4b2');label(side,px,datum+25,name,'#d5d0de',position===0?'start':position===d.lengthIn?'end':'middle');
 }
 const plan=$('plan'), y=m=>125+74*m;
 for(const m of f.members.filter(m=>m.a[2]>3.8&&m.b[2]>3.8))line(plan,x(m.a[0]),y(m.a[1]),x(m.b[0]),y(m.b[1]),'#66e0e9',1.4);
 for(const p of f.shorePositions)element(plan,'circle',{cx:x(p[0]),cy:y(p[1]),r:4,fill:'#ff9c4a'});
 const cabin=$('cabin'), scale=2.65, half=d.floorWidthIn/2, origin=180, bottom=268;
 const rise=d.ceilingRiseIn, R=(half*half+rise*rise)/(2*rise), sx=t=>origin+t*scale, sz=t=>bottom-t*scale;
 const left=sx(-half),right=sx(half),wall=sz(d.wallIn);
 element(cabin,'path',{d:'M '+left+' '+bottom+' V '+wall+' A '+(R*scale)+' '+(R*scale)+' 0 0 1 '+right+' '+wall+' V '+bottom+' Z',fill:'#252332',stroke:'#66e0e9','stroke-width':2});
 line(cabin,origin,sz(d.crownIn),origin,bottom,'#ff9c4a',1.5);
 label(cabin,origin+9,sz(d.crownIn/2),d.crownIn+' in','#ffcc85','start');
 label(cabin,left+9,sz(d.wallIn/2),d.wallIn+' in','#d5d0de','start');
 label(cabin,origin,bottom+26,d.floorWidthIn+' in floor width');
 try {
   const response=await fetch('results.json',{cache:'no-cache'});if(!response.ok)throw Error('not published');
   const results=await response.json();
   if(results.revision!==r.revision||results.deckLengthIn!==f.deckLengthIn||results.pairPitchIn!==f.pairPitchIn)throw Error('revision mismatch');
   for(const s of results.cases)row($('results'),[s.label,s.people,fmt(s.stressMPa,2),fmt(s.deckDropIn,3),fmt(s.peakShoreLbf,0),fmt(s.peakSeatLbf,0),fmt(s.frameFloorShoreLbf,0)]);
   $('result-status').textContent='Solved candidate cases; the original solver enforces applied crowd-load and force/moment equilibrium checks. Results do not establish an operating headcount.';
 }catch(e){$('result-status').textContent='Candidate solver results have not been published or do not match this geometry. Do not substitute iteration 06 results.'}
}catch(e){$('geometry').textContent='Survey geometry could not be loaded. See the downloadable recipe.';$('result-status').textContent='No candidate result available.'}

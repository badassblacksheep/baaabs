export const defaults=Object.freeze({joistReduction:0,floorReduction:0,extraSteel:525});
export function budget(data,inputs){
  const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(x))?Number(x):lo));
  const joistReduction=clamp(inputs.joistReduction,0,40),floorReduction=clamp(inputs.floorReduction,0,30),extraSteel=clamp(inputs.extraSteel,0,1500);
  const mass=id=>data.categories.find(c=>c.id===id).lb;
  const sharedSaving=mass('joists')*joistReduction/100+mass('floor')*floorReduction/100;
  const grossRemoval=data.concepts.find(c=>c.id==='four').gross_removed_station_mass_lb;
  const six=data.baseline_lb-sharedSaving,four=six-grossRemoval+extraSteel;
  return {six,four,sharedSaving,grossRemoval,difference:four-six,joistReduction,floorReduction,extraSteel};
}

const fmt=n=>Number(n).toFixed(1);
const line=(x1,y1,x2,y2,color,width=3,extra='')=>`<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${color}" stroke-width="${width}" ${extra}/>`;
const label=(x,y,t,size=13,color='#c0b9c4',anchor='middle')=>`<text x="${fmt(x)}" y="${fmt(y)}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${t}</text>`;
const colors={post:'#86d4c7',floor:'#f49ac9',panel:'#a99cb7',load:'#f2c179'};
const defs='<defs><marker id="load-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#f2c179"/></marker></defs>';

export function diagram(data,{concept='six',view='side',panels=true,loads=true}={}){
  const c=data.concepts.find(c=>c.id===concept)||data.concepts[0],g=data.diagram;
  let s=defs;
  if(view==='end'){
    s+='<rect x="330" y="150" width="340" height="220" rx="40" fill="#38343f" stroke="#686170" stroke-width="2"/>';
    s+='<path d="M350 210H650V260H350Z" fill="#24212a" stroke="#686170"/>';
    s+='<rect x="350" y="365" width="30" height="42" rx="8" fill="#101014"/><rect x="620" y="365" width="30" height="42" rx="8" fill="#101014"/>';
    if(panels)s+='<path d="M250 345L230 235L275 135L345 85H655L725 135L770 235L750 345" fill="#a99cb4" fill-opacity=".035" stroke="#a99cb7" stroke-width="2" stroke-dasharray="6 7"/>';
    s+=line(310,135,690,135,colors.floor,7)+line(315,135,315,375,colors.post,7)+line(685,135,685,375,colors.post,7)+line(315,375,685,375,colors.post,7);
    s+='<rect x="430" y="365" width="25" height="28" fill="#131016" stroke="#bbb1bd"/><rect x="545" y="365" width="25" height="28" fill="#131016" stroke="#bbb1bd"/>';
    if(loads){
      for(const x of [380,460,540,620])s+=line(x,63,x,120,colors.load,3,'marker-end="url(#load-arrow)"');
      for(const x of [315,685])s+=line(x,205,x,310,colors.load,3,'marker-end="url(#load-arrow)"');
      s+=line(342,353,435,353,colors.load,2,'marker-end="url(#load-arrow)"')+line(658,353,565,353,colors.load,2,'marker-end="url(#load-arrow)"');
    }
    s+=label(500,35,'BOTH CONCEPTS NEED THIS COMPLETE LOAD PATH',14,'#f6f0e6');
    s+=label(500,290,'Transverse restraint unresolved',17,colors.load)+label(500,315,'Bus body shown; no capacity credited',12);
    s+=label(500,435,'Chassis attachments must resist load and uplift',14)+label(500,460,'End view is schematic. No bracket or brace design is implied.',12);
    s+=label(220,180,'Panel subframe',12,colors.panel,'end')+label(220,200,'connections TBD',12,colors.panel,'end');
    s+=line(235,187,300,187,colors.panel,1,'stroke-dasharray="3 5"');
  }else{
    const x=v=>75+(v+g.donor_length_m/2)/g.donor_length_m*850;
    const deckY=155,baseY=370;
    s+='<rect x="75" y="187" width="850" height="182" rx="24" fill="#38343f" stroke="#686170" stroke-width="2"/>';
    for(let i=0;i<12;i++)s+=`<rect x="${101+i*64}" y="213" width="47" height="54" rx="3" fill="#24212a" stroke="#5b5562"/>`;
    for(const axle of g.axles_x_m)s+=`<circle cx="${fmt(x(axle))}" cy="367" r="34" fill="#101014" stroke="#6a626f" stroke-width="3"/><circle cx="${fmt(x(axle))}" cy="367" r="13" fill="#45404b"/>`;
    if(panels)s+='<path d="M49 340L38 265L91 175L178 128H817L911 174L966 265L950 340" fill="#a99cb7" fill-opacity=".04" stroke="#a99cb7" stroke-width="2" stroke-dasharray="6 7"/>';
    const left=x(-g.deck_length_m/2),right=x(g.deck_length_m/2);
    s+=line(left,deckY,right,deckY,colors.floor,7);
    if(c.id==='four'){
      // Truss depth is deliberately diagrammatic; the available envelope is unresolved.
      const top=92,n=12;
      s+=line(left,top,right,top,colors.floor,4);
      for(let i=0;i<n;i++){
        const a=left+(right-left)*i/n,b=left+(right-left)*(i+1)/n;
        s+=line(a,i%2?top:deckY,b,i%2?deckY:top,colors.floor,2.5);
      }
      s+=line(left,top,left,deckY,colors.floor,3)+line(right,top,right,deckY,colors.floor,3);
      s+=label(500,55,'Longitudinal truss · depth and members to be designed',14,colors.floor);
    }else{
      s+=label(500,55,'Shorter spans · lighter floor and member options to investigate',14,colors.floor);
    }
    for(const st of g.stations){
      const selected=c.station_ids.includes(st.id),xx=x(st.x_m);
      if(selected){s+=line(xx,deckY,xx,baseY,colors.post,6)+line(xx-12,baseY,xx+12,baseY,colors.post,4);}
      else{s+=line(xx,deckY+10,xx,baseY,'#6a5c70',2,'stroke-dasharray="4 7"');}
      s+=label(xx,423,st.id,15,selected?colors.post:'#8b7e92');
      if(loads&&selected)s+=line(xx+10,285,xx+10,332,colors.load,2.5,'marker-end="url(#load-arrow)"');
    }
    if(loads)for(const xx of [210,320,430,540,650,760])s+=line(xx,74,xx,c.id==='four'?88:145,colors.load,2.5,'marker-end="url(#load-arrow)"');
    const spans=c.spans_m,max=Math.max(...spans),i=spans.indexOf(max),a=x(c.station_x_m[i]),b=x(c.station_x_m[i+1]);
    s+=line(a,453,b,453,'#a99cb7',1)+line(a,446,a,460,'#a99cb7',1)+line(b,446,b,460,'#a99cb7',1)+label((a+b)/2,479,`${fmt(max/.3048)} ft · longest support span`,13);
    s+=label(78,190,'FRONT',10,'#aaa0b3','start');
    s+=label(500,332,'Donor body · unmeasured reference',13,'#aaa0b3');
    if(c.id==='four')s+=label(820,475,'Dashed posts B / E removed',11,'#aaa0b3');
  }
  return `<svg viewBox="0 0 1000 500" role="img" aria-labelledby="diagram-title diagram-description"><title id="diagram-title">${c.name} — ${view==='end'?'end load path':'side layout'}</title><desc id="diagram-description">Concept sketch only. ${c.station_ids.length} pairs of supports. Panel subframes, bracing, member sections and connections are not sized. Bus dimensions are unmeasured.</desc>${s}</svg>`;
}

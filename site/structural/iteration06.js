/* Display directly solved cases; never interpolate an occupancy or support rating. */
(() => {
  'use strict';
  const get=id=>document.getElementById(id), put=(id,v)=>{get(id).textContent=v;};
  const fmt=(x,n=0)=>x.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n});
  const screen=r=>({ratio:r.stress/207,color:r.stress>207?'red':r.stress>165.6?'yellow':'green'});
  function selected(data,n,gear){const r=data.equipment.find(r=>r.people===n&&r.extraLbf===gear);if(!r)throw Error('Unsolved case');return r;}
  function scenario(data,label){const r=[data.selected,...data.sensitivity].find(r=>r.label===label);if(!r)throw Error('Unsolved scenario');return r;}
  function diagram(data){
    const a=data.placement.portalXsM[0],b=data.placement.portalXsM[1],x=v=>55+(v-a)/(b-a)*790;
    const main=[a,...data.placement.pairXsM,b],xs=main.flatMap((v,i)=>i<4?[v,(v+main[i+1])/2]:[v]).map(x);
    const web=xs.slice(0,-1).map((v,i)=>`<path d="M${v} ${i%2?65:132}L${xs[i+1]} ${i%2?132:65}"/>`).join('');
    const vertical=xs.slice(1,-1).map(v=>`<path d="M${v} 65V132"/>`).join('');
    const shores=data.placement.pairXsM.map((v,i)=>`<g><path d="M${x(v)} 132V166m-13 0h26"/><path stroke-dasharray="5 5" d="M${x(v)} 166V247"/><text class="svg-label" x="${x(v)}" y="42" text-anchor="middle">Pair ${i+1}</text></g>`).join('');
    const dims=data.placement.pairXsM.slice(0,2).map((v,i)=>`<path d="M${x(v)} 297H${x(data.placement.pairXsM[i+1])}M${x(v)} 290V304M${x(data.placement.pairXsM[i+1])} 290V304"/><text class="svg-label" x="${(x(v)+x(data.placement.pairXsM[i+1]))/2}" y="286" text-anchor="middle">115 in · 9 ft 7 in</text>`).join('');
    return `<title>Three equidistant shore pairs beneath a full-depth truss</title><rect class="bus-body" x="55" y="166" width="790" height="82" rx="14"/><path class="chassis" d="M65 248H835"/><circle class="wheel" cx="175" cy="248" r="22"/><circle class="wheel" cx="728" cy="248" r="22"/><g class="truss-lines"><path d="M55 65H845V132H55Z"/>${web}${vertical}</g><g class="end-supports"><path d="M55 65V248M845 65V248"/></g><g class="body-supports">${shores}</g><g class="dimensions">${dims}</g>`;
  }
  globalThis.Baaabs06={screen,selected,scenario,diagram};
  if(typeof document==='undefined')return;
  function show(data){
    function update(){
      const r=selected(data,Number(get('people06').value),Number(get('gear06').value)),s=screen(r);
      get('result06').className='selected-result '+s.color;
      put('use06',fmt(s.ratio*100)+'%');put('stress06',fmt(r.stress,1));
      get('fill06').style.width=Math.min(100,s.ratio/1.5*100)+'%';
      put('drop06',fmt(r.drop,2)+' in');put('shore06',fmt(r.shore)+' lbf');
      put('summary06',r.people+' people and '+fmt(r.extraLbf)+' lb service gear. '+(r.stress>207?'Above':'Below')+' the chosen stress ceiling; no safe headcount established.');
      get('crowd06').innerHTML=Array.from({length:r.people},(_,i)=>`<g transform="translate(${18+i%10*35} ${20+Math.floor(i/10)*40})"><circle r="5"/><path d="M0 8v15m-8-11h16m-8 11-7 9m7-9 7 9"/></g>`).join('');
      put('loads-working06',fmt(r.frameWeight,2)+' + 2,311.25 + '+fmt(r.extraLbf)+' + 2 × '+r.people+' × 225 = '+fmt(r.total,2)+' lbf');
      put('physical06',fmt(r.dead+r.people*225)+' lb physically carried in this model. The force multiplier adds no physical mass.');
      put('governing06',r.member+' · '+r.stressCase);
    }
    function sensitivity(){
      const r=scenario(data,get('scenario06').value),s=screen(r);
      get('sensitivity06').className='sensitivity-result '+s.color;
      put('s-stress06',fmt(r.stress,1)+' MPa');put('s-status06',(r.stress>207?'Above':'Below')+' the chosen stress ceiling · '+fmt(s.ratio*100)+'%');
      for(const [id,key]of [['s-drop06','drop'],['s-shore06','shore'],['s-seat06','portalReaction'],['s-uplift06','uplift']])put(id,fmt(r[key],key==='drop'?2:0)+(key==='drop'?' in':' lbf'));
      put('scenario-note06',r.label==='3x'?'A larger assumed people force exceeds the screen. This is not a simulated collapse or a validated dance category.':r.label==='k-0'?'All six shores remain in the weight estimate but contribute no vertical support. The end portals carry the frame.':r.label==='pinned'?'Allowing end seats to rotate changes load sharing and may introduce hold-down demand. Connections remain unverified.':r.disabled.length?'Support stiffness is set to zero at '+r.disabled.length+' shore'+(r.disabled.length>1?'s':'')+' before loading. Remaining support and connection demands still need verified capacity.':r.shift?'The entire three-pair grid moves '+fmt(Math.abs(r.shift)/.0254,3)+' in '+(r.shift<0?'forward':'rearward')+'. Equal spacing and deck height are preserved. This tests layout sensitivity, not actual bow alignment.':r.label==='fine'?'Five beam subdivisions reproduce the three-subdivision baseline; this checks numerical resolution.':'Effective stiffness is '+fmt(r.k)+' lbf/in per shore. This includes the tube, saddle, body and connection compliance, and has not been measured on Earl.');
    }
    get('loads06').addEventListener('change',update);get('scenario06').addEventListener('change',sensitivity);
    get('placement06').innerHTML=diagram(data);update();sensitivity();
    for(const el of document.querySelectorAll('[data-needs-data]'))el.disabled=false;
  }
  fetch('iteration-06-data.json').then(r=>{if(!r.ok)throw Error('Data unavailable');return r.json();}).then(show).catch(error=>{get('data-error06').hidden=false;put('data-error06','Interactive data did not load. Controls remain unavailable; static results and the source download remain below.');console.error(error);});
  const model=get('model06'),colors=new WeakMap();
  async function modelView(){
    for(const material of model.model?.materials||[]){
      await material.ensureLoaded();
      if(!colors.has(material))colors.set(material,[...material.pbrMetallicRoughness.baseColorFactor]);
      const color=colors.get(material),group=material.name.match(/^Workshop_([^_]+)_/)?.[1];
      if(material.name.startsWith('Panel_')||['deck','equipment','rails','sound','eye_effect'].includes(group)){
        material.setAlphaMode('BLEND');material.pbrMetallicRoughness.setBaseColorFactor([...color.slice(0,3),get('skin06').checked?color[3]:0]);
      }
    }
  }
  model.addEventListener('load',modelView);get('skin06').addEventListener('change',modelView);
})();

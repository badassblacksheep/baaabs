/* Coordinates and edge comparisons use the same numbered register as the workbook. */
(()=>{
 const q=s=>document.querySelector(s),viewer=q('#model'),NS='http://www.w3.org/2000/svg';
 const state={reference:'',edgeA:0,edgeB:0,lastId:null,neighbors:new Set(),markers:[],frame:0};
 const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),length=v=>Math.hypot(...v),degrees=r=>r*180/Math.PI;
 const ref=()=>panelById.get(state.reference),enabled=()=>q('#inspect-vertices').checked;
 // Nearby boundaries include imperfect seams; audited crossings remain available for repair.
 const neighborTolerance=.0254,neighborCache=new Map();
 const auditNeighbors=[...window.PANEL_ALIGNMENT_AUDIT.corrected,...window.PANEL_ALIGNMENT_AUDIT.reviewPairs];
 function pointSegmentDistance(p,a,b){
  const v=sub(b,a),w=sub(p,a),vv=dot(v,v),t=vv?Math.max(0,Math.min(1,dot(w,v)/vv)):0;
  return length(w.map((x,i)=>x-t*v[i]));
 }
 function segmentDistance(p,q,r,s){
  const u=sub(q,p),v=sub(s,r),w=sub(p,r),a=dot(u,u),b=dot(u,v),c=dot(v,v),d=dot(u,w),e=dot(v,w),den=a*c-b*b;
  let distance=Math.min(pointSegmentDistance(p,r,s),pointSegmentDistance(q,r,s),pointSegmentDistance(r,p,q),pointSegmentDistance(s,p,q));
  if(den>1e-12*a*c){const t=(b*e-c*d)/den,k=(a*e-b*d)/den;if(t>=0&&t<=1&&k>=0&&k<=1)distance=Math.min(distance,length(w.map((x,i)=>x+t*u[i]-k*v[i])))}
  return distance;
 }
 function neighbors(p){
  if(!neighborCache.has(p.id))neighborCache.set(p.id,DATA.panels.filter(other=>other.id!==p.id&&(
   auditNeighbors.some(pair=>(pair.a===p.id&&pair.b===other.id)||(pair.b===p.id&&pair.a===other.id))||
   p.vertices_m.some((a,i)=>other.vertices_m.some((b,j)=>segmentDistance(a,p.vertices_m[(i+1)%p.vertices_m.length],b,other.vertices_m[(j+1)%other.vertices_m.length])<=neighborTolerance))
  )));
  return neighborCache.get(p.id);
 }
 function comparisonOptions(){
  const nearby=neighbors(selected);state.neighbors=new Set(nearby.map(p=>p.id));choose.replaceChildren();
  const none=text('option',nearby.length?'None':'No neighboring panels');none.value='';choose.append(none);
  for(const p of nearby){const o=text('option',`${p.id} · ${p.name}`);o.value=p.id;choose.append(o)}
  choose.disabled=!nearby.length;
 }

 const edge=(p,i)=>sub(p.vertices_m[(i+1)%p.vertices_m.length],p.vertices_m[i]);
 const angle=(a,b)=>length(a)<1e-10||length(b)<1e-10?null:degrees(Math.acos(Math.min(1,Math.max(0,Math.abs(dot(a,b)/(length(a)*length(b)))))));
 const num=n=>n.toFixed(2),inches=n=>num(n/.0254),edgeName=(p,i)=>`${i+1}–${(i+1)%p.vertices_m.length+1}`;
 const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el};
 const svgEl=(tag,attrs)=>{const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el};
 function normal(p){const n=[...p.normal];if((p.side==='Passenger'&&n[1]<0)||(p.side==='Driver'&&n[1]>0))for(let i=0;i<3;i++)n[i]*=-1;return n}
 function modelPoint(p){return `${p[0]}m ${p[2]}m ${-p[1]}m`}
 function options(node,p,index){node.replaceChildren();node.disabled=!p;if(!p)return;for(let i=0;i<p.vertices_m.length;i++){const o=text('option',edgeName(p,i));o.value=String(i);node.append(o)}node.value=String(index)}
 function renderFlat(svg,p,index,prefix,color){
  svg.replaceChildren();if(!p)return;
  const pts=p.flat_vertices_m,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)];
  const scale=Math.min(500/Math.max(hi[0]-lo[0],.001),240/Math.max(hi[1]-lo[1],.001));
  const map=v=>[300+(v[0]-(lo[0]+hi[0])/2)*scale,165-(v[1]-(lo[1]+hi[1])/2)*scale];
  const holes=p.holes_m.map(loop=>loop.map(v=>{const d=sub(v,p.origin_m);return[dot(d,p.u_axis),dot(d,p.v_axis)]}));
  const d=[pts,...holes].map(loop=>loop.map((v,i)=>(i?'L':'M')+map(v).join(',')).join(' ')+'Z').join(' ');
  svg.append(svgEl('path',{d,fill:'#35243e','fill-rule':'evenodd',stroke:color,'stroke-width':2}));
  const a=map(pts[index]),b=map(pts[(index+1)%pts.length]);svg.append(svgEl('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:color,'stroke-width':7}));
  pts.forEach((v,i)=>{const xy=map(v),label=svgEl('text',{x:xy[0]+8,y:xy[1]-8,fill:color,'font-size':20});label.textContent=prefix+(i+1);svg.append(label)});
 }
 function readings(){
  const p=selected,b=ref(),a=edge(p,state.edgeA),box=q('#edge-comparison');box.replaceChildren();
  box.append(text('div',`A · ${p.id} · edge ${edgeName(p,state.edgeA)} · ${inches(length(a))} in`));
  if(b){const v=edge(b,state.edgeB),full=angle(a,v),side=angle([a[0],a[2]],[v[0],v[2]]);
   box.append(text('div',`B · ${b.id} · edge ${edgeName(b,state.edgeB)} · ${inches(length(v))} in`));
   box.append(text('strong',`3D angle: ${full===null?'undefined':num(full)+'°'} · Side-view angle: ${side===null?'undefined':num(side)+'°'}`));
   box.append(text('div','0° means parallel. Side view uses X/Z only; 3D also includes depth. Edge direction is ignored.'));
  }else box.append(text('div','Choose a comparison panel to measure the angle between two edges.'));
  const coords=q('#vertex-coordinates');coords.replaceChildren();for(const [item,prefix]of [[p,'A'],[b,'B']])if(item)item.vertices_m.forEach((v,i)=>{const tr=document.createElement('tr');for(const val of [prefix+(i+1),...v.map(inches)])tr.append(text('td',val));coords.append(tr)});
  renderFlat(q('#shape'),p,state.edgeA,'A','#ffbc64');renderFlat(q('#comparison-shape'),b,state.edgeB,'B','#67dcf4');
 }
 function overlays(){
  const overlay=q('#edge-overlay');overlay.replaceChildren();if(!enabled())return;
  const box=viewer.getBoundingClientRect();overlay.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
  for(const [p,prefix,index,color]of [[selected,'A',state.edgeA,'#ffbc64'],[ref(),'B',state.edgeB,'#67dcf4']]){
   if(!p)continue;const points=p.vertices_m.map((_,i)=>viewer.queryHotspot?.(`hotspot-inspect-${prefix}-${i}`)?.canvasPosition);
   for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(!a||!b||Math.abs(a.z)>1||Math.abs(b.z)>1)continue;
    overlay.append(svgEl('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':i===index?5:1.5,opacity:i===index?1:.65}));
   }
  }
 }
 function scheduleOverlay(){cancelAnimationFrame(state.frame);state.frame=requestAnimationFrame(()=>{state.frame=0;overlays()})}
 function markers(){
  for(const m of state.markers)m.remove();state.markers=[];
  if(enabled())for(const [p,prefix,index]of [[selected,'A',state.edgeA],[ref(),'B',state.edgeB]]){
   if(!p)continue;const n=normal(p);
   p.vertices_m.forEach((v,i)=>{const el=text('button',prefix+(i+1));el.className='vertex-marker'+(prefix==='B'?' reference':'')+(i===index?' active':'');el.slot=`hotspot-inspect-${prefix}-${i}`;el.dataset.position=modelPoint(v);el.dataset.normal=modelPoint(n);el.dataset.inspector='true';el.setAttribute('aria-label',`${p.id} vertex ${i+1}, select outgoing edge`);
    el.addEventListener('pointerenter',stopPicking);
    for(const t of ['pointerdown','pointerup','pointermove'])el.addEventListener(t,e=>e.stopPropagation());
    el.addEventListener('click',e=>{e.stopPropagation();if(prefix==='A')state.edgeA=i;else state.edgeB=i;refresh()});viewer.append(el);state.markers.push(el);
   });
  }
  scheduleOverlay();
 }
 function orientation(){const o=viewer.getCameraOrbit?.();if(!o)return;q('#camera-orientation').textContent=`Camera rotation ${num(degrees(o.theta))}° · elevation ${num(90-degrees(o.phi))}°`}
 function fit(theta,phi){
  const pts=[...selected.vertices_m,...(ref()?.vertices_m||[])],lo=[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...pts.map(p=>p[i]))),center=lo.map((x,i)=>(x+hi[i])/2);
  viewer.cameraTarget=modelPoint(center);viewer.cameraOrbit=`${theta}deg ${phi}deg ${Math.max(2.5,length(sub(hi,lo))*2)}m`;scheduleOverlay();
 }
 function rotate(theta,phi){const o=viewer.getCameraOrbit?.();if(!o)return;viewer.cameraOrbit=`${degrees(o.theta)+theta}deg ${Math.max(5,Math.min(175,degrees(o.phi)+phi))}deg ${o.radius}m`}
 function refresh(){
  if(state.lastId!==selected.id){state.edgeA=0;state.lastId=selected.id;comparisonOptions()}
  if(!state.neighbors.has(state.reference)){state.reference='';state.edgeB=0}q('#compare-panel').value=state.reference;
  options(q('#edge-a'),selected,state.edgeA);options(q('#edge-b'),ref(),state.edgeB);readings();markers();paintHighlights();orientation();
 }
 window.inspectionPanelColors=()=>enabled()?new Map([[selected.id,[1,.58,.16,1]],...(ref()?[[ref().id,[.12,.78,.95,1]]]:[])]):new Map();
 window.refreshPanelInspector=refresh;
 const choose=q('#compare-panel');
 choose.addEventListener('change',()=>{state.reference=choose.value;state.edgeB=0;refresh()});q('#inspect-vertices').addEventListener('change',refresh);
 for(const [id,key]of [['#edge-a','edgeA'],['#edge-b','edgeB']])q(id).addEventListener('change',e=>{state[key]=Number(e.target.value);refresh()});
 q('#view-face').addEventListener('click',()=>{const n=normal(selected);fit(degrees(Math.atan2(n[0],-n[1])),degrees(Math.acos(Math.max(-1,Math.min(1,n[2])))))});
 q('#view-passenger').addEventListener('click',()=>fit(180,90));q('#view-driver').addEventListener('click',()=>fit(0,90));q('#view-top').addEventListener('click',()=>fit(0,5));
 for(const [id,t,p]of [['#rotate-left',-15,0],['#rotate-right',15,0],['#rotate-up',0,-15],['#rotate-down',0,15]])q(id).addEventListener('click',()=>rotate(t,p));
 q('#entrance-example').addEventListener('click',()=>{select(panelById.get('B-P-052'));state.reference='B-P-033';state.edgeA=0;state.edgeB=2;q('#inspect-vertices').checked=true;refresh();fit(180,90)});
 const audit=window.PANEL_ALIGNMENT_AUDIT,pairs=[...audit.corrected,...audit.reviewPairs];
 q('#audit-summary').textContent=`All ${audit.panelCount} panel surfaces audited, including ${audit.triangleCount} triangles and the merged crown panels. ${audit.reviewPairs.length} existing surface-crossing pairs remain for review; no new junction pairs after matching changed panel IDs. The audit now also includes quadrilateral-to-quadrilateral crossings.`;
 pairs.forEach((pair,i)=>{const o=text('option',`${i<audit.corrected.length?'Corrected':'Review'} · ${pair.a} / ${pair.b}`);o.value=String(i);q('#audit-pair').append(o)});q('#audit-pair').value='0';
 q('#inspect-audit-pair').addEventListener('click',()=>{const pair=pairs[Number(q('#audit-pair').value)];if(!pair)return;select(panelById.get(pair.a));state.reference=pair.b;state.edgeA=pair.edgeA;state.edgeB=pair.edgeB;q('#inspect-vertices').checked=true;refresh();fit(selected.side==='Driver'?0:180,90)});
 q('#handling-example').addEventListener('click',()=>{const pair=audit.handlingExample;select(panelById.get(pair.a));state.reference=pair.b;state.edgeA=pair.edgeA;state.edgeB=pair.edgeB;q('#inspect-vertices').checked=true;refresh();fit(180,90)});
 viewer.addEventListener('camera-change',()=>{orientation();scheduleOverlay()});viewer.addEventListener('load',()=>{refresh();requestAnimationFrame(scheduleOverlay)});window.addEventListener('resize',scheduleOverlay);
 refresh();
})();

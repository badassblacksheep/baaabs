// Orthographic, depth-sorted study geometry. Model coordinates remain available in the inspector.
const colors={donor:'#9b9baa',primary:'#91e8d4',shores:'#ffa35e',deck:'#94b9ff',panels:'#e7a0e5',skin:'#b3aebe',audio:'#ffe17f',context:'#737586'};
const fills={donor:'transparent',primary:'rgba(67,169,148,.63)',shores:'rgba(230,134,80,.8)',deck:'rgba(96,136,212,.20)',panels:'rgba(191,109,186,.65)',skin:'rgba(156,148,175,.07)',audio:'rgba(222,179,69,.7)',context:'transparent'};
const boxFaces=[[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]];
const pointsOfBox=([a,b])=>Array.from({length:8},(_,i)=>a.map((v,k)=>i&(1<<k)?b[k]:v));

export function createViewer(canvas,onPick) {
  const g=canvas.getContext('2d');
  if(!g)throw Error('This browser could not initialize the drawing surface');
  let scene=[],nodes=[],mode='assembled',visible=new Set(Object.keys(colors)),focus=null,trace=null;
  let yaw,pitch,zoom,drag,pointsToPick=[],stats={},cameraLabel='';
  function reset(){yaw=mode==='transport'?-0.47:-0.38;pitch=mode==='transport'?0.53:0.24;zoom=1}
  reset();
  function offset(item,p) {
    if(mode!=='exploded')return p;
    const sign=Math.sign(item.points.reduce((sum,q)=>sum+q[1],0)) || 1;
    let dx=0,dy=0,dz=0;
    if(item.group==='ladder'){dx=(item.bay+0.5-stats.bayCount/2)*0.46;dy=sign*0.87}
    if(item.layer==='deck'){dz=0.52;if(item.group==='cassette'){dz=1.18;dx=(item.bay+0.5-item.rows/2)*0.18;dy=(item.lane+0.5-item.cols/2)*0.45}}
    if(item.layer==='shores')dz=-0.55;
    if(item.layer==='panels')dy=sign*1.45;
    if(item.layer==='skin'){dy=sign*2.25;dz=0.5}
    if(item.layer==='audio' && item.group!=='mvp')dy=-1.05;
    return [p[0]+dx,p[1]+dy,p[2]+dz];
  }
  function render(){
    const {width:w,height:h}=canvas.getBoundingClientRect(); if(!w||!h)return;
    const ratio=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);g.setTransform(ratio,0,0,ratio,0,0);
    const c=Math.cos(yaw),s=Math.sin(yaw),t=Math.cos(pitch),u=Math.sin(pitch);
    const project=([x,y,z])=>[x*c+y*s,(x*s-y*c)*u-z*t,(x*s-y*c)*t+z*u];
    const bounds=[Infinity,Infinity,-Infinity,-Infinity];
    const include=([x,y])=>{bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y)};
    let faces=[];
    for(const item of scene){
      const pts=(item.kind==='box'?pointsOfBox(item.points):item.points).map(p=>project(offset(item,p)));
      // Frame against the complete view so toggles reveal layers without moving the camera.
      pts.forEach(include);
      if(!visible.has(item.layer) && item.layer!=='context')continue;
      const holes=(item.holes||[]).map(loop=>loop.map(p=>project(offset(item,p))));
      const part=(q,inner=[])=>faces.push({item,q,inner,depth:q.reduce((v,p)=>v+p[2],0)/q.length});
      if(item.kind==='box')boxFaces.forEach(idx=>part(idx.map(i=>pts[i])));
      else part(pts,holes);
    }
    if(!faces.length && !scene.length)return;
    const sc=Math.min((w-36)/Math.max(0.1,bounds[2]-bounds[0]),(h-65)/Math.max(0.1,bounds[3]-bounds[1]))*zoom;
    const map=([x,y])=>[w/2+(x-(bounds[0]+bounds[2])/2)*sc,h/2+(y-(bounds[1]+bounds[3])/2)*sc];
    const path=(pts,closed)=>{pts.forEach((p,i)=>{const xy=map(p);i?g.lineTo(...xy):g.moveTo(...xy)});if(closed)g.closePath()};
    pointsToPick=[];
    for(const {item,q,inner} of faces.sort((a,b)=>a.depth-b.depth)){
      const poly=q.length>2, highlighted=trace && item.panelId===trace;
      g.lineWidth=highlighted?2.8:item.layer==='primary'?2.4:item.layer==='shores'?3.8:item.layer==='audio'?2.3:item.layer==='panels'?1.55:item.layer==='skin'?0.65:1.3;
      g.strokeStyle=highlighted?'white':colors[item.layer];g.fillStyle=highlighted?'rgba(255,255,255,.5)':fills[item.layer];
      if(mode==='transport' && item.layer==='deck')g.fillStyle='rgba(104,145,220,.62)';
      g.setLineDash(item.guide?[3,3]:[]);g.beginPath();path(q,poly);inner.forEach(loop=>path(loop,true));
      if(poly)g.fill('evenodd');g.stroke();
      if(item.caption && Math.abs(c)>.4 && pitch<1){
        const [tx,ty]=map(q.at(-1));g.font='11px monospace';g.fillStyle='#c9c8d3';g.textAlign='center';g.fillText(item.label,tx,ty+13);g.textAlign='left';
      }
      if(item.arrow){const [a,b]=q.map(map),r=Math.atan2(b[1]-a[1],b[0]-a[0]);g.beginPath();for(const k of [-1,1]){g.moveTo(...b);g.lineTo(b[0]-9*Math.cos(r+k*0.48),b[1]-9*Math.sin(r+k*0.48))}g.stroke()}
    }
    g.setLineDash([]);
    if(mode==='assembled'){
      for(const n of nodes.filter(n=>visible.has(n.layer))){
        const [x,y]=map(project(n.positionM));pointsToPick.push({n,x,y});
        if(n.id!==focus)continue;
        g.beginPath();g.arc(x,y,7,0,Math.PI*2);g.fillStyle='#0b0a10';g.fill();g.lineWidth=2.2;g.strokeStyle='#fff';g.stroke();
        g.fillStyle='white';g.beginPath();g.arc(x,y,2,0,Math.PI*2);g.fill();
      }
    }
    g.font='13px monospace';g.fillStyle='#c8cbd6';g.fillText(cameraLabel,12,h-12);
  }
  function rotate(dx,dy){yaw+=dx;pitch=Math.max(-1.29,Math.min(1.55,pitch+dy));render()}
  function scale(f){zoom=Math.max(.55,Math.min(3,zoom*f));render()}
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;rotate((e.clientX-drag.x)*.009,(e.clientY-drag.y)*.008);Object.assign(drag,{x:e.clientX,y:e.clientY})});
  canvas.addEventListener('pointerup',e=>{if(drag && mode==='assembled' && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5){
    const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    const hit=pointsToPick.map(h=>[Math.hypot(h.x-x,h.y-y),h.n]).sort((a,b)=>a[0]-b[0])[0];
    if(hit&&hit[0]<=14)onPick(hit[1].id);
  }drag=null});
  canvas.addEventListener('pointercancel',()=>drag=null);
  canvas.addEventListener('keydown',e=>{const keys={ArrowLeft:()=>rotate(-.12,0),ArrowRight:()=>rotate(.12,0),ArrowUp:()=>rotate(0,.1),ArrowDown:()=>rotate(0,-.1),'+':()=>scale(1.15),'-':()=>scale(1/1.15),Home:()=>{reset();render()}};if(keys[e.key]){e.preventDefault();keys[e.key]()}});
  new ResizeObserver(render).observe(canvas);
  return {setScene(next,layers,opts){if(mode!==opts.mode){mode=opts.mode;reset()}scene=next;visible=layers;nodes=opts.nodes;focus=opts.focus;trace=opts.trace;stats=opts;cameraLabel=opts.label;render()},
    reset(){reset();render()},scale,angle(name){
      yaw=name==='end'?-Math.PI/2:name==='underside'?-.38:0;
      pitch=name==='plan'?Math.PI/2:name==='underside'?-.75:0;
      render()
    }};
}

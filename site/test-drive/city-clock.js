// A compressed sketch of the BRC plan. Twelve points into deep playa (+Z).
// https://survival.burningman.org/wp-content/uploads/2025/07/BMSG-2025.pdf
import {art} from './landmarks.js?v=playa-models';
const center=art[2], radii=[112,129,146,163,180,197], inner=radii[0],outer=radii.at(-1);
const point=(hour,r)=>[center.x-r*Math.sin(hour*Math.PI/6),.035,center.z+r*Math.cos(hour*Math.PI/6)];
const spokes=Array.from({length:17},(_,i)=>2+i/2);
export function buildCity(g){
  const road=[.72,.54,.48],esplanade=[.78,.59,.5],tent=[.46,.36,.41];
  function strip(a,b,c,d,color){g.tri(a,b,c,color,false);g.tri(a,c,d,color,false);}
  for(const r of radii){
    const w=r===inner?2.8:1.85;
    for(let i=0;i<128;i++){
      const h=2+i/16,k=h+1/16;
      strip(point(h,r-w),point(k,r-w),point(k,r+w),point(h,r+w),r===inner?esplanade:road);
    }
  }
  for(const h of spokes){
    const normal=[Math.cos(h*Math.PI/6)*1.85,0,Math.sin(h*Math.PI/6)*1.85];
    const corner=(r,side)=>point(h,r).map((v,i)=>v+side*normal[i]);
    strip(corner(inner,-1),corner(inner,1),corner(outer,1),corner(outer,-1),road);
  }
  // Camp silhouettes mark the blocks and leave each radial sightline open.
  for(let j=0;j<radii.length-1;j++)for(let i=0;i<48;i++){
    const h=2+(i+.5)/6, r=radii[j]+8+1.6*Math.sin(3*i+j);
    const [x,,z]=point(h,r),w=1.6+.8*(1+Math.sin(i+j)),height=2+.9*Math.cos(3*i-j);
    const top=[x,height,z],base=[[-w,0,-1.5],[w,0,-1.5],[w,0,1.5],[-w,0,1.5]].map(([a,b,c])=>[x+a,b,z+c]);
    for(let k=0;k<4;k++)g.tri(base[k],base[(k+1)%4],top,tent);
  }
}
export function createClockMap(canvas){
  const ctx=canvas.getContext('2d'),size=canvas.width,mid=size/2;
  const base=document.createElement('canvas');base.width=base.height=size;
  const bg=base.getContext('2d'),scale=size/(outer*2.6);
  const pixel=p=>[mid-(p[0]-center.x)*scale,mid-(p[2]-center.z)*scale];
  bg.strokeStyle='#d7b894';bg.lineWidth=size/200;
  for(const r of radii){bg.beginPath();bg.arc(mid,mid,r*scale,-Math.PI/6,7*Math.PI/6);bg.stroke();}
  for(const h of spokes){bg.beginPath();bg.moveTo(...pixel(point(h,inner)));bg.lineTo(...pixel(point(h,outer)));bg.stroke();}
  bg.textAlign='center';bg.textBaseline='middle';bg.fillStyle='#ffebd1';bg.font='bold '+Math.round(size*.075)+'px monospace';
  for(const h of [2,6,10])bg.fillText(h+':00',...pixel(point(h,outer+25)));
  bg.fillStyle='#ffcf89';bg.beginPath();bg.arc(mid,mid,3,0,2*Math.PI);bg.fill();
  return state=>{
    ctx.clearRect(0,0,size,size);ctx.drawImage(base,0,0);
    let [x,y]=pixel([state.x,0,state.z]);
    const d=Math.hypot(x-mid,y-mid),limit=mid*.94;
    if(d>limit){x=mid+(x-mid)*limit/d;y=mid+(y-mid)*limit/d;}
    ctx.save();ctx.translate(x,y);ctx.rotate(state.yaw+Math.PI);ctx.fillStyle='#a4ffdc';
    ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.restore();
  };
}

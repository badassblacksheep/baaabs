import {rgb as color} from './geometry.js';
export function buildHeadMaze(g,head={x:0,z:0}){
  const tau=Math.PI*2;
  // Sculpt the closed eyelids, cheeks, nose and mouth into a continuous head
  // surface. The changing jaw width leaves a chin below a broad cranium.
  const H=40*.3048, paper=color(0xd9d3c9), crease=color(0x877d7a);
  const glass=[0x6ce0ca,0x274259,0x7881bf,0xe9b366,0x2a9ea9,0xca6489].map(color);
  const bump=(x,y,cx,cy,w,h)=>Math.exp(-(((x-cx)/w)**2+((y-cy)/h)**2));
  function face(a,v){
    const t=(1-Math.cos(v))/2,y=H*t,s=Math.sin(v);
    const x=4.25*s*Math.sin(a)*(.73+.27*Math.min(1,t*2));
    const abs=Math.abs(x),front=Math.max(0,Math.cos(a));
    const relief=1.2*bump(x,y,0,5.85,.65,1.65)+1.06*bump(x,y,0,4.95,.85,.57)
      +.65*bump(abs,y,1.55,6.94,1.25,.48)-.73*bump(abs,y,1.48,6.27,1.02,.56)
      +.57*bump(abs,y,2.04,4.95,1.08,1.1)+.63*bump(x,y,0,3.32,1.45,.39)
      +.57*bump(x,y,0,2.86,1.39,.35)+.81*bump(x,y,0,1.66,1.56,.82);
    return [head.x+x,y,head.z+3.95*s*Math.cos(a)+relief*front**3];
  }
  for(let i=0;i<64;i++)for(let j=0;j<40;j++){
    const a=(i-32)*tau/64,v=j*Math.PI/40;
    const p=face(a,v),q=face(a+tau/64,v),r=face(a,v+Math.PI/40),s=face(a+tau/64,v+Math.PI/40);
    const exposed=a>.24+.11*Math.sin(j*.85)&&a<1.35+.15*Math.cos(j*.72)&&p[1]>6.9+Math.abs(a-.75)*3&&p[1]<11.45;
    const flesh=paper.map(c=>c*(.965+.035*Math.sin(i*11+j*7)));
    g.tri(p,q,r,exposed?glass[(i*7+j)%6]:flesh);g.tri(q,s,r,exposed?glass[(i+j*5)%6]:flesh);
    if(exposed)g.beam(q,r,.036,color(0x383747),4);
  }
  // Follow the projected skin to draw eyelid folds and the lip seam.
  function line(x,y){
    const v=Math.acos(1-2*y/H),w=4.25*Math.sin(v)*(.73+.27*Math.min(1,y/H*2));
    const p=face(Math.asin(x/w),v);p[2]+=.045;return p;
  }
  for(const side of [-1,1])for(let i=0;i<10;i++){
    const lid=t=>line(side*(.62+1.82*t),6.22-.20*Math.sin(t*Math.PI)+.09*t);
    g.beam(lid(i/10),lid((i+1)/10),.07,crease,5);
  }
  for(let i=0;i<14;i++){
    const lips=t=>line(2.62*(t-.5),3.08+.19*(2*t-1)**2);
    g.beam(lips(i/14),lips((i+1)/14),.055,crease,5);
  }
  // Bent wrists, cupped palms and five articulated fingers on each side.
  const local=([x,y,z])=>[head.x+x,y,head.z+z];
  for(const side of [-1,1]){
    const raised=side===1,cy=raised?6.25:3.0;
    const limb=(a,b,r)=>g.beam(local(a),local(b),r,paper,10);
    limb([side*4.7,.15,1],[side*4.55,cy-1.15,1.19],.83);
    limb([side*4.55,cy-1.15,1.19],[side*4.05,cy+.45,1.88],.87);
    for(let i=0;i<4;i++){
      const z=1.02+i*.41,len=1.48+.30*Math.sin(i*Math.PI/3);
      const a=[side*4.14,cy+.18,z],b=[side*4.06,cy+len,z+.2],c=[side*(raised?3.25:3.42),cy+len+.72,z+.78];
      limb(a,b,.22);limb(b,c,.19);
    }
    limb([side*4.1,cy-.28,2.15],[side*3.1,cy+.2,3.05],.31);
  }
}

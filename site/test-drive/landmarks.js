// Coordinates are metres, with +Y up. Heights come from the Burning Man annual
// report (2014) and the Journal's 2019 Head Maze description. Other dimensions
// are visual estimates from Eric Cheng's 2014 photo and Schultz's front view.
export const art=[
  {name:'Event Horizon',credit:'Ben Bartlett · 2025',url:'https://www.eventhorizon.art/',x:3,z:-24,footprint:3.8,orbit:14},
  {name:'Head Maze',credit:'Matt Schultz & The Pier Group · 2019',url:'https://www.mattschultzart.com/artwork/headmaze',x:-18,z:-59,footprint:6.4,orbit:17},
  {name:'The Man',credit:'Caravansary · 2014 · 105 ft',url:'https://annualreport2014.burningman.org/the-burning-man-event-in-black-rock-city/',x:20,z:-94,footprint:7.5,orbit:21}
];
export const targets=art.flatMap((piece,i)=>[.95,.05,-.85].map(angle=>({
  x:piece.x+piece.orbit*Math.cos(angle),z:piece.z+piece.orbit*Math.sin(angle),angle,art:i
})));
export const otherSculptures=[[21,-58,6],[-54,-74,9],[60,16,5],[-32,45,7]];
export const obstacles=[...art,...otherSculptures.map(([x,z,r])=>({x,z,footprint:r,name:'the light sculpture'}))];
export function partyAlignment(state,piece){
  const dx=state.x-piece.x,dz=state.z-piece.z;
  return (dx*Math.cos(state.yaw)+dz*Math.sin(state.yaw))/(Math.hypot(dx,dz)||1);
}
// Rounded footprint of Earl, with an oriented central segment between bumpers.
export function clearance(x,z,yaw,piece){
  const dx=piece.x-x,dz=piece.z-z;
  const along=Math.max(-6.1,Math.min(6.1,dx*Math.sin(yaw)-dz*Math.cos(yaw)));
  return Math.hypot(dx-along*Math.sin(yaw),dz+along*Math.cos(yaw))-piece.footprint-1.65;
}
export function buildLandmarks(g){
  const color=h=>[h>>16,(h>>8)&255,h&255].map(v=>v/255);
  const tau=Math.PI*2;
  // Slatted timber shells: open gaps between each run of staves.
  const manStart=g.vertices.length;
  const man=art[2], wood=[0xeac18f,0xf1ca9f,0xca9870,0xdbb487].map(color);
  function shell(levels,count){
    const point=([cx,y,rx,rz],a)=>[man.x+cx+rx*Math.cos(a),y,man.z+rz*Math.sin(a)];
    for(let i=0;i<count;i++){
      const a=i*tau/count,b=(i+.81)*tau/count;
      for(let k=1;k<levels.length;k++){
        const lo=levels[k-1],hi=levels[k],p=point(lo,a),q=point(lo,b),r=point(hi,a),s=point(hi,b);
        const c=wood[(i+3*k)%4];g.tri(p,q,r,c);g.tri(q,s,r,c);
      }
    }
  }
  for(const side of [-1,1]){
    const mirror=rows=>rows.map(([x,y,rx,rz])=>[x*side,y,rx,rz]);
    shell(mirror([[3.7,0,1.26,1.65],[2.95,7.65,1.23,1.2],[1.8,15.3,1.55,1.45]]),26);
    shell(mirror([[6.6,13.45,.68,.71],[5.65,18.45,.98,.94],[4.15,24.8,1.23,1.14]]),21);
  }
  shell([[0,14.7,3.45,1.72],[0,18.4,3.0,1.64],[0,23.3,4.0,1.98],[0,25.35,3.7,1.72]],54);
  const height=105*.3048;
  // The lantern head broadens above the neck, with a sloping crown.
  const rows=[[25.35,1.26,1.13],[26.4,1.65,1.35],[29.9,2.14,1.72],[31.05,1.45,1.25],[height,.12,.16]];
  const corner=(row,i)=>[man.x+(i===0||i===3?-1:1)*row[1],row[0],man.z+(i<2?1:-1)*row[2]];
  for(let k=1;k<rows.length;k++)for(let i=0;i<4;i++){
    const a=corner(rows[k-1],i),b=corner(rows[k-1],(i+1)%4),c=corner(rows[k],i),d=corner(rows[k],(i+1)%4);
    const mix=(p,q,t)=>p.map((v,j)=>v+(q[j]-v)*t);
    g.tri(a,b,c,color(0xb49366));g.tri(b,d,c,color(0xbc9d73));
    for(let j=0;j<7;j++)g.beam(mix(a,b,j/7),mix(c,d,j/7),.055,wood[0],4);
    for(let j=0;j<4;j++)g.beam(mix(a,c,j/4),mix(b,d,j/4),.052,wood[1],4);
  }
  for(let y=16;y<24.8;y+=.9)g.beam([man.x-.51,y,man.z+1.9],[man.x+.51,y,man.z+1.9],.12,color(0x8c633f),4);

  // Include the thickness of the crown rails in the published overall height.
  let top=0;
  for(let i=manStart+1;i<g.vertices.length;i+=6)top=Math.max(top,g.vertices[i]);
  for(let i=manStart+1;i<g.vertices.length;i+=6)g.vertices[i]*=height/top;

  // Sculpt the closed eyelids, cheeks, nose and mouth into a continuous head
  // surface. The changing jaw width leaves a chin below a broad cranium.
  const head=art[1], H=40*.3048, paper=color(0xd9d3c9), crease=color(0x877d7a);
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

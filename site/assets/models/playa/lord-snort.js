import {Geometry,rgb} from './geometry.js';

// Bryan Tedrick's running boar: a perforated rib cage between two plate-built masses.
// Game interpretation from Aaron Huey's 2016 photograph. Coordinates are metres.
export function lordSnort(){
  const boar=new Geometry(),base=new Geometry(),tau=2*Math.PI;
  const steel=[0x575050,0x82746c,0x998a7c,0x6b605c,0xab9988].map(rgb);
  const edge=rgb(0xc6b4a2),dark=rgb(0x362e31);
  function panel(a,b,c,d,color){boar.tri(a,b,c,color);boar.tri(a,c,d,color);}
  // Each longitudinal station describes a section normal to the snout-to-tail axis.
  function skin(profile,segments,material){
    const point=([x,y,h,w],a)=>[x,y+h*Math.cos(a),w*Math.sin(a)];
    for(let k=1;k<profile.length;k++)for(let i=0;i<segments;i++){
      const a=tau*i/segments,b=tau*(i+.98)/segments;
      panel(point(profile[k-1],a),point(profile[k],a),point(profile[k],b),point(profile[k-1],b),material[(i+3*k)%material.length]);
    }
  }
  function oval(x,y,z,rx,ry,rz,c){
    const p=(a,b)=>[x+rx*Math.sin(b),y+ry*Math.cos(b)*Math.cos(a),z+rz*Math.cos(b)*Math.sin(a)];
    for(let i=0;i<16;i++)for(let j=0;j<7;j++){
      const a=tau*i/16,b=-Math.PI/2+Math.PI*j/7;
      panel(p(a,b),p(a+tau/16,b),p(a+tau/16,b+Math.PI/7),p(a,b+Math.PI/7),c);
    }
  }
  function path(points,widths,col){
    for(let i=1;i<points.length;i++)boar.beam(points[i-1],points[i],widths[i-1],col,7);
  }
  skin([[-5.72,3.70,.31,.43],[-5.25,3.66,.39,.56],[-4.55,3.59,.47,.57],
    [-3.6,3.71,.68,.76],[-2.58,3.83,.99,1.01],[-1.90,3.63,1.19,1.1],[-1.28,3.28,1.19,.98]],20,steel);
  skin([[-1.92,3.10,.87,.82],[-1.49,3.13,1.43,1.11],[-.89,3.17,1.43,1.2],[-.35,3.23,1.19,1.06]],20,steel);
  skin([[2.10,3.06,.91,.80],[2.69,3.08,1.16,1.03],[3.46,3.05,1.20,.99],[4.12,3.02,.87,.68],[4.36,3,.3,.35]],16,steel);
  for(let i=0;i<9;i++){
    const x=-.38+i*.32,bow=Math.sin(i*Math.PI/9)*.15;
    skin([[x,3.19,1.13+bow,1+bow],[x+.14,3.19,1.13+bow,1+bow]],22,[steel[i%5],steel[2]]);
  }
  boar.beam([-.7,4.26,0],[2.8,4.11,0],.11,steel[0]);
  oval(-5.73,3.7,0,.14,.33,.52,steel[2]);
  for(const side of [-1,1]){
    const pt=(x,y,z)=>[x,y,z*side];
    oval(-5.856,3.74,side*.23,.028,.105,.12,dark);
    oval(-3.27,4.10,side*.82,.19,.17,.13,dark);
    path([pt(-3.66,4.12,.74),pt(-3.31,4.34,.84),pt(-3.02,4.27,.91)],[.09,.08],edge);
    // Wide folded ear cupping a dark hollow.
    const ear=[pt(-2.96,4.39,.61),pt(-2.24,5.10,1.18),pt(-2.02,4.86,1.12),pt(-2.51,4.31,.75)];
    for(let i=0;i<4;i++)boar.tri(ear[i],ear[(i+1)%4],pt(-2.53,4.59,.91),i%2?dark:steel[0]);
    path([...ear,ear[0]],[.062,.062,.062,.062],steel[2]);
    // Paired tusks curl upward from the stepped lower jaw.
    path([pt(-4.58,3.42,.48),pt(-4.70,3.60,.65),pt(-4.82,3.91,.81),pt(-4.83,4.18,.85),pt(-4.70,4.40,.84)],
      [.136,.12,.091,.054],edge);
    path([pt(-5.3,3.42,.45),pt(-4.7,3.28,.58),pt(-3.52,3.33,.76),pt(-2.86,3.52,.97)],[.085,.09,.105],steel[0]);
    for(let j=0;j<18;j++){
      const curl=k=>{const a=k*.27,r=.51-.018*k;return pt(-2.56+r*Math.cos(a),3.69+r*Math.sin(a),1.04);};
      boar.beam(curl(j),curl(j+1),.062,steel[2],5);
    }
    // Bent knees, hocks and cloven feet suspended clear of the fixed shaft.
    for(const rear of [false,true]){
      const stride=side*.30;
      const leg=rear?[pt(3.07,3.01,.76),pt(2.57+stride,2.13,.84),pt(3.79+stride,1.44,.83),pt(3.41+stride,.78,.78)]:
        [pt(-1.16,3.22,.82),pt(-.95+stride,2.04,1),pt(-1.68+stride,1.08,.87),pt(-1.18+stride,.62,.82)];
      path(leg,[.32,.21,.135],steel[1]);oval(...leg[1],.32,.36,.24,steel[2]);
      const [x,y,z]=leg[3];
      for(const toe of [-1,1])oval(x-.15,y,z+toe*.085,.29,.13,.084,steel[0]);
    }
  }
  for(let i=0;i<36;i++){
    const t=i/35,x=-2.77+2.18*t,y=4.53+.18*Math.sin(Math.PI*t);
    boar.beam([x,y,(i%3-1)*.10],[x+.20,y+.55+.22*Math.sin(i*1.8),(i%3-1)*.18],.039,steel[i%5],4);
  }
  path([[4,3.52,0],[4.57,3.72,.09],[4.92,4.06,.17],[5.28,4.21,.22]],[.11,.085,.06],steel[1]);
  for(let i=0;i<13;i++)boar.beam([5.22,4.20,.22],[5.65+.07*Math.cos(i),4.27+.19*Math.sin(i),.22+.16*Math.cos(i)],.035,steel[i%5],4);
  // Match the overall envelope from Tedrick's published 38 × 18 × 8 ft dimensions.
  const mins=[Infinity,Infinity,Infinity],maxs=mins.map(v=>-v);
  for(let j=0;j<boar.vertices.length;j+=6)for(let k=0;k<3;k++){
    mins[k]=Math.min(mins[k],boar.vertices[j+k]);maxs[k]=Math.max(maxs[k],boar.vertices[j+k]);
  }
  for(let j=0;j<boar.vertices.length;j+=6){
    for(const [k,feet] of [[0,38],[2,8]])boar.vertices[j+k]=(boar.vertices[j+k]-(maxs[k]+mins[k])/2)*feet*.3048/(maxs[k]-mins[k]);
    boar.vertices[j+1]*=18*.3048/maxs[1];
  }
  base.beam([0,.08,0],[0,2.69,0],.22,steel[0],14);
  base.beam([0,.04,0],[0,.18,0],.92,steel[1],16);
  for(let j=0;j<6;j++){
    const a=tau*j/6,x=Math.cos(a),z=Math.sin(a);
    base.tri([.91*x,.15,.91*z],[.21*x,1.02,.21*z],[.21*x,.15,.21*z],steel[1]);
  }
  return {base,boar};
}

import {Geometry,rgb} from './geometry.js';

// Based on Duncan Rawlinson's 2025 installation photograph. Dimensions in metres.
export const pivotHeight=6.15;
export const identity=[1,0,0,0,1,0,0,0,1];
const tau=2*Math.PI;
const steel=rgb(0x434759),rim=rgb(0x888ea0);
const leds=[0xf191cf,0xffeee0,0xbefbff,0x94aeff,0xd3b2ff,0xfbfcca].map(rgb);
function quad(g,a,b,c,d,color,lit=true){g.tri(a,b,c,color,lit);g.tri(a,c,d,color,lit);}
function band(radius,k){
  const g=new Geometry();
  // Rectangular aluminum channel with a light diffuser on its broad faces.
  const p=(i,r,z)=>[r*Math.cos(tau*i/96),r*Math.sin(tau*i/96),z];
  for(let i=0;i<96;i++){
    const paint=leds[(Math.floor(i/12)+k)%leds.length];
    const r=radius,inner=r-.14;
    for(const z of [-.05,.05]){
      quad(g,p(i,r,z),p(i+1,r,z),p(i+1,inner,z),p(i,inner,z),paint,false);
    }
    quad(g,p(i,r,-.05),p(i+1,r,-.05),p(i+1,r,.05),p(i,r,.05),rim);
    quad(g,p(i,inner,-.05),p(i+1,inner,-.05),p(i+1,inner,.05),p(i,inner,.05),steel);
  }
  // Opposite bearing pins bridge the radial gap to the parent ring.
  for(const s of [-1,1]){
    const axis=r=>k%2?[0,s*r,0]:[s*r,0,0];
    g.beam(axis(radius-.09),axis(radius+.23),.087,steel,8);
  }
  return g;
}
export function eventHorizon(){
  const frame=new Geometry(),r=3.42;
  const point=(a,r,y)=>[r*Math.cos(a),y,r*Math.sin(a)];
  for(let i=0;i<96;i++){
    const a=tau*i/96,b=tau*(i+1)/96;
    frame.tri([0,.075,0],point(a,r,.075),point(b,r,.075),rgb(0x956977),false);
    quad(frame,point(a,r,0),point(b,r,0),point(b,r,.105),point(a,r,.105),steel);
  }
  for(const s of [-1,1]){
    const x=s*3.30;
    frame.beam([x,.10,0],[x,pivotHeight+.12,0],.083,rim,8);
    frame.beam([s*3.03,pivotHeight,0],[x,pivotHeight,0],.12,steel,8);
    // Mirrored banks of upright light pipes leave both entries open.
    for(let j=-19;j<=19;j++){
      const t=j/19,angle=(s<0?Math.PI:0)+1.09*t;
      const h=.58+3.85*(1-Math.abs(t))**2.15;
      const p=y=>point(angle,r-.08,y);
      frame.beam(p(.08),p(h),.036,steel,5);
      frame.beam(p(.19),p(h-.035),.044,rgb(Math.abs(t)>.58?0xffdb76:Math.abs(t)>.29?0xff908e:0xec73c6),6);
    }
  }
  // A subdued mirrored core leaves the open spaces between the bands legible.
  const sph=(a,b)=>[.34*Math.cos(b)*Math.cos(a),pivotHeight+.34*Math.sin(b),.34*Math.cos(b)*Math.sin(a)];
  for(let j=0;j<10;j++)for(let i=0;i<20;i++){
    const a=tau*i/20,b=(j/10-.5)*Math.PI;
    quad(frame,sph(a,b),sph(a+tau/20,b),sph(a+tau/20,b+Math.PI/10),sph(a,b+Math.PI/10),rgb(j===7?0x8987aa:0x272738));
  }
  return {frame,rings:Array.from({length:5},(_,i)=>band(3.048-i*.32,i))};
}
// Column-major orientation matrices; every child inherits its parent's rotation.
export function gimbalPose(time){
  let parent=identity;
  return [0,1,2,3,4].map(i=>{
    const angle=[.8,-1.2,.6,.92,-.74][i]+time*[.32,-.47,.52,-.61,.7][i];
    const c=Math.cos(angle),s=Math.sin(angle);
    const local=i%2?[c,0,-s,0,1,0,s,0,c]:[1,0,0,0,c,s,0,-s,c];
    const next=local.map((_,j)=>{
      const col=j-j%3,row=j%3;
      return parent[row]*local[col]+parent[row+3]*local[col+1]+parent[row+6]*local[col+2];
    });
    parent=next;return next;
  });
}

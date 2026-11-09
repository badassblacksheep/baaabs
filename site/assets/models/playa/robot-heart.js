import {Geometry,rgb} from './geometry.js';

// Game-scale interpretation of the Robot Heart bus. Its front points toward -Z.
export function robotHeart(){
  const bus=new Geometry(),ink=rgb(0x292437),metal=rgb(0x887c89),glass=rgb(0x547082);
  function box(x,y,z,w,h,l,color){
    const corners=Array.from({length:8},(_,i)=>[x+(i&1?.5:-.5)*w,y+(i&2?.5:-.5)*h,z+(i&4?.5:-.5)*l]);
    for(const [a,b,c,d] of [[0,2,3,1],[4,5,7,6],[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3]]){
      bus.tri(corners[a],corners[b],corners[c],color);bus.tri(corners[a],corners[c],corners[d],color);
    }
  }
  box(0,1.84,0,2.48,2.62,9.75,rgb(0xaf958e));
  box(0,3.3,0,2.58,.32,10,metal);
  box(0,2.09,-4.89,2.12,.88,.06,glass);
  for(const side of [-1,1]){
    const x=side*1.26;
    for(const z of [-3.12,3.0]){
      bus.beam([x*.85,.65,z],[x+side*.15,.65,z],.63,ink,20);
      bus.beam([x+side*.15,.65,z],[x+side*.18,.65,z],.31,metal,16);
    }
    for(let i=0;i<7;i++)box(x,2.18,-3.93+i*1.30,.06,.80,1.09,glass);
    // Angular paint strokes beneath the windows.
    for(let i=0;i<20;i++){
      const z=-4.8+i*.46,y=1.25+.21*Math.sin(i*1.3),outside=side*1.296;
      bus.tri([outside,y-.37,z],[outside,y+.43,z+.35],[outside,y-.11,z+.79],
        rgb([0x66435e,0x799995,0xa75a75,0x494368][i%4]),false);
    }
    for(let i=0;i<=6;i++)bus.beam([x,3.45,-4.8+i*1.6],[x,4.38,-4.8+i*1.6],.037,metal,5);
    bus.beam([x,4.38,-4.8],[x,4.38,4.8],.043,metal);
    for(const z of [-3.55,3.55]){
      const speakerX=side*1.42;
      box(speakerX,3.86,z,.60,1.50,1.24,ink);
      for(const y of [3.54,4.15])for(const dz of [-.3,.3]){
        bus.beam([side*1.72,y,z+dz],[side*1.78,y,z+dz],.248,metal,12);
        bus.beam([side*1.78,y,z+dz],[side*1.8,y,z+dz],.166,ink,12);
      }
    }
    for(const z of [-.97,.97])bus.beam([side*.83,3.48,z],[side*.68,5.0,z],.055,metal);
  }
  box(0,4.94,0,1.48,.13,2.15,metal);
  // Two contoured faces and a deep equatorial rim give the lit heart volume.
  const profile=[[0,2.56],[-.53,3.03],[-1.17,3.13],[-1.70,2.82],[-1.91,2.23],[-1.78,1.64],[-1.33,1.06],[0,0],[1.33,1.06],[1.78,1.64],[1.91,2.23],[1.7,2.82],[1.17,3.13],[.53,3.03]];
  const neon=[0xff55be,0xf489ff,0xff417e,0xffa9ef].map(rgb);
  function point(i,side){const [z,h]=profile[i%profile.length],s=side===0?1:.85;return [side*.55,5.02+1.56+(h-1.56)*s,z*s];}
  for(let i=0;i<profile.length;i++){
    bus.beam(point(i,0),point(i+1,0),.075,neon[i%4],6);
    for(const s of [-1,1]){
      const p=point(i,s);bus.beam(p,point(i+1,s),.052,neon[(i+1)%4],5);
      bus.beam(p,point(i,0),.045,neon[2],5);
      bus.beam(p,[s*.78,6.57,0],.032,neon[(i+2)%4],5);
    }
  }
  return bus;
}

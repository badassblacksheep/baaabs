import {robotHeart} from '../assets/models/playa/robot-heart.js';
import {lordSnort} from '../assets/models/playa/lord-snort.js';
import {buildCity} from './city-clock.js';
import {art,targets} from './landmarks.js?v=lord-snort';
import {Geometry,rgb,sub,add,mul,cross,unit} from '../assets/models/playa/geometry.js';
import {buildMan} from '../assets/models/playa/man-2014.js';
import {buildHeadMaze} from '../assets/models/playa/head-maze.js';
import {eventHorizon,pivotHeight,gimbalPose,identity} from '../assets/models/playa/event-horizon.js?v=rainbow';
function transform(p,n){
  const s=n.scale||[1,1,1], t=n.translation||[0,0,0], q=n.rotation||[0,0,0,1];
  const v=p.map((x,i)=>x*s[i]), r=cross(q,v);
  return add(t,add(v,mul(add(mul(r,q[3]),cross(q,r)),2)));
}
async function loadEarl(){
  const response=await fetch('../assets/models/earl-roof-attachment-study.glb');
  if(!response.ok)throw Error('Model download failed');
  const data=await response.arrayBuffer(), dv=new DataView(data), len=dv.getUint32(12,true);
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,len))), offset=28+len;
  function accessor(id){
    const a=doc.accessors[id], b=doc.bufferViews[a.bufferView], type={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];
    return new type(data,offset+(b.byteOffset||0)+(a.byteOffset||0),a.count*(a.type==='VEC3'?3:1));
  }
  const model=new Geometry(), outlets=[];
  function visit(id,parents){
    const n=doc.nodes[id], chain=[n,...parents];
    for(const prim of doc.meshes[n.mesh]?.primitives||[]){
      const pos=accessor(prim.attributes.POSITION), idx=accessor(prim.indices), mat=doc.materials[prim.material];
      const points=[];
      for(let i=0;i<pos.length;i+=3)points.push(chain.reduce(transform,Array.from(pos.subarray(i,i+3))));
      const component=n.extras?.component, panel=mat.name.startsWith('Panel_');
      let color=rgb(0x777277);
      if(panel){const shade=42+(id*17)%32;color=[shade*.94,shade,shade*1.16].map(v=>v/255);}
      else if(component==='poofer'||component==='ladder'||component==='rails')color=rgb(0xbab2c0);
      else if(component==='deck')color=rgb(0x9c795d);
      else if(component==='eye_effect')color=rgb(0xffab45);
      else if(component==='structure'||component==='equipment')color=rgb(0x494555);
      else if(mat.pbrMetallicRoughness?.baseColorFactor)color=mat.pbrMetallicRoughness.baseColorFactor.slice(0,3).map(x=>Math.min(.88,x**.48));
      if(component==='poofer')outlets.push(points.reduce((a,b)=>a[1]>b[1]?a:b));
      for(let i=0;i<idx.length;i+=3)model.tri(points[idx[i]],points[idx[i+1]],points[idx[i+2]],color);
    }
    for(const child of n.children||[])visit(child,chain);
  }
  for(const id of doc.scenes[doc.scene].nodes)visit(id,[]);
  return {model,outlets};
}
function passengers(cheering){
  const people=new Geometry();
  // Three passengers with colored goggles on the raised deck.
  for(const [x,z,coat] of [[-2,.55,0xcd729d],[.5,-.65,0x64d9d2],[2,.45,0xffae65]]){
    const y=3.95;
    for(const side of [-1,1])people.beam([x,y,z+side*.13],[x,y+.73,z+side*.09],.095,rgb(0x444052));
    people.beam([x,y+.7,z],[x,y+1.25,z],.23,rgb(coat));
    people.beam([x,y+1.28,z],[x,y+1.6,z],.15,rgb(0xc99377));
    people.beam([x-.13,y+1.48,z-.1],[x-.13,y+1.48,z+.1],.055,rgb(0x93f0dd));
    for(const side of [-1,1])people.beam([x,y+1.2,z+side*.18],[x-.16,y+(cheering?1.77:1.02),z+side*.37],.075,rgb(coat));
  }
  return people;
}

export const zoneRadius=6;
function scenery(){
  const g=new Geometry();
  buildCity(g);
  buildMan(g,art[2]);
  buildHeadMaze(g,art[1]);
  return g;
}
const vertex=`
attribute vec3 pos,col; varying vec3 tint; uniform vec3 eye,side,up,look,origin;
uniform float angle, focal, aspect, shift;uniform vec3 scale;uniform mat3 pose;uniform float lightPhase;
void main(){float c=cos(angle),s=sin(angle);vec3 p=pose*(pos*scale);
p=vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z)+origin-eye;float d=dot(look,p);
gl_Position=vec4(dot(side,p)*focal/aspect+d*shift,dot(up,p)*focal,d*1.0002-.15,d);
vec3 paint=col;
if(lightPhase>=0.){
  float phase=atan(pos.z,pos.x)+.32*pos.y-lightPhase;
  vec3 rainbow=.55+.45*cos(phase+vec3(0.,-2.0944,2.0944));
  float brightness=.76+.24*cos(2.*phase-.20*pos.y);
  paint=brightness*rainbow;
}
tint=mix(paint,vec3(.65,.46,.49),min(.6,max(d-35.,0.)*.0018));}`;
const frag='precision mediump float; varying vec3 tint; void main(){gl_FragColor=vec4(tint,1.);}';
const skyVert='attribute vec3 pos;varying vec2 uv;void main(){uv=pos.xy;gl_Position=vec4(pos.xy,0.,1.);}';
const skyFrag=`precision highp float;varying vec2 uv;uniform vec3 eye,side,up,look;uniform float focal,aspect,shift;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){vec3 ray=normalize(look+side*(uv.x-shift)*aspect/focal+up*uv.y/focal);
float a=atan(ray.x,-ray.z), h=ray.y; vec2 dir=ray.xz;
vec3 color=mix(vec3(.98,.60,.48),vec3(.32,.29,.50),smoothstep(-.02,.24,h));
color=mix(color,vec3(.105,.13,.245),smoothstep(.18,.68,h));
vec3 sun=normalize(vec3(-.38,.105,-1.));float sd=length(ray-sun);
color+=vec3(.28,.14,.07)*exp(-sd*7.);color=mix(color,vec3(1.,.86,.63),1.-smoothstep(.035,.036,sd));
vec2 star=vec2(a,h)*260.;color+=vec3(.65)*step(.996,hash(floor(star)))*(1.-smoothstep(.04,.28,length(fract(star)-.5)))*smoothstep(.09,.33,h);
float ridge=.032+.018*sin(7.*a)+.011*sin(19.*a+1.)+.006*sin(41.*a)+.002*sin(113.*a);
if(h<ridge)color=mix(vec3(.52,.35,.42),vec3(.66,.44,.49),smoothstep(0.,.08,h));
if(h<0.){float d=-eye.y/min(-.0001,h);vec2 p=eye.xz+ray.xz*d;
float grit=noise(p*1.7)*.45+noise(p*.19)*.35+noise(p*12.)*.2;
float track=abs(fract(p.x*.065+sin(p.y*.045)*.16)-.5);
vec3 clay=mix(vec3(.38,.275,.32),vec3(.78,.55,.48),grit);
clay-=.042*(1.-smoothstep(.002,.016,track));
color=mix(clay,vec3(.80,.52,.48),1.-exp(-d*.012));}
gl_FragColor=vec4(color,1.);}`;
export async function createRenderer(canvas){
  const gl=canvas.getContext('webgl',{antialias:true,alpha:false});
  if(!gl)throw Error('Earl needs WebGL. Enable graphics acceleration and reload.');
  function program(v,f){
    const p=gl.createProgram();
    for(const [type,src] of [[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){
      const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p,shader);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
  }
  const ground=program(skyVert,skyFrag),solid=program(vertex,frag);
  function buffer(g){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.vertices),gl.STATIC_DRAW);return {b,count:g.vertices.length/6};}
  const sky=new Geometry();sky.tri([-1,-1,0],[3,-1,0],[-1,3,0],[0,0,0]);
  const skyBuf=buffer(sky),world=buffer(scenery()),{model,outlets}=await loadEarl(),bus=buffer(model);
  const robotBus=buffer(robotHeart());
  const snort=lordSnort(), shaft=buffer(snort.base), boar=buffer(snort.boar);
  const installation=eventHorizon({separateLights:true}), lights=buffer(installation.lights), pavilion=buffer(installation.frame), hoops=installation.rings.map(buffer);
  const riders=buffer(passengers(false)), dancers=buffer(passengers(true));
  const circle=new Geometry();
  for(let i=0;i<72;i++){
    const point=(j,r)=>[r*Math.cos(j*Math.PI/36),.09,r*Math.sin(j*Math.PI/36)];
    const color=i%6===0?rgb(0xfff6bc):rgb(0xff54ad);
    circle.tri(point(i,1),point(i+1,1),point(i,.93),color,false);
    circle.tri(point(i+1,1),point(i+1,.93),point(i,.93),color,false);
  }
  const marker=buffer(circle),chevron=new Geometry(),lime=rgb(0xffef95);
  chevron.tri([-1.3,0,.38],[0,0,-2.55],[0,0,-1.2],lime,false);
  chevron.tri([1.3,0,.38],[0,0,-1.2],[0,0,-2.55],lime,false);
  const arrow=buffer(chevron);
  const flame=new Geometry();
  for(let i=0;i<9;i++){
    const ring=j=>[Math.cos(j*2*Math.PI/9)*.46,.65,Math.sin(j*2*Math.PI/9)*.46];
    flame.tri([0,0,0],ring(i),ring(i+1),rgb(0xffeb8b),false);
    flame.tri(ring(i),ring(i+1),[.55,2.75,0],rgb(i%2?0xff7940:0xffbb47),false);
  }
  const jet=buffer(flame), shadowGeo=new Geometry();
  for(let i=0;i<32;i++){const pt=j=>[7.8*Math.cos(j*Math.PI/16),.01,2*Math.sin(j*Math.PI/16)];shadowGeo.tri([0,.01,0],pt(i),pt(i+1),rgb(0x55424c),false);}
  const shadow=buffer(shadowGeo), locations=new Map();
  for(const p of [solid,ground])locations.set(p,Object.fromEntries(['eye','side','up','look','origin','angle','aspect','focal','shift','scale','pose','lightPhase'].map(k=>[k,gl.getUniformLocation(p,k)])));
  function drawMesh(p,mesh){
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.b);for(const [name,offset] of [['pos',0],['col',12]]){
      const a=gl.getAttribLocation(p,name);if(a<0)continue;gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,offset);
    }gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  return function draw(state,time){
    const dpr=Math.min(devicePixelRatio,1.6),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,w,h);
    const intro=state.mode==='intro', portrait=w/h<.9;
    const orbit=intro?1.95+.09*Math.sin(time*.18):.55+state.steer*.14;
    const distance=intro?(portrait?37:25):(portrait?27:21);
    const angle=orbit-state.yaw+state.cameraYaw;
    const eye=[state.x+distance*Math.sin(angle),(intro?8:9)+state.cameraLift,state.z+distance*Math.cos(angle)];
    const target=[state.x,intro?(portrait?8:3.6):3.8,state.z];
    const look=unit(sub(target,eye)),side=unit(cross(look,[0,1,0])),up=cross(side,look);
    function camera(p){
      gl.useProgram(p);const l=locations.get(p);for(const [k,v] of Object.entries({eye,side,up,look}))gl.uniform3fv(l[k],v);
      gl.uniform1f(l.focal,2.25);gl.uniform1f(l.aspect,w/h);gl.uniform1f(l.shift,intro&&!portrait?.38:0);
    }
    gl.disable(gl.DEPTH_TEST);camera(ground);drawMesh(ground,skyBuf);
    gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);camera(solid);
    const l=locations.get(solid);
    function object(mesh,origin,rotation=0,scale=[1,1,1],pose=identity){
      gl.uniformMatrix3fv(l.pose,false,pose);gl.uniform3fv(l.origin,origin);gl.uniform1f(l.angle,rotation);gl.uniform3fv(l.scale,scale);drawMesh(solid,mesh);
    }
    gl.uniform1f(l.lightPhase,-1);
    object(world,[0,0,0]);
    object(robotBus,[state.robot.x,0,state.robot.z],state.robot.yaw);
    const snortOrigin=[art[3].x,0,art[3].z];
    object(shaft,snortOrigin);
    object(boar,snortOrigin,(time%24)*Math.PI/12);
    object(pavilion,[art[0].x,0,art[0].z]);
    gl.uniform1f(l.lightPhase,(time%8)*Math.PI/4);
    object(lights,[art[0].x,0,art[0].z]);
    gl.uniform1f(l.lightPhase,-1);
    const poses=gimbalPose(time);
    for(let i=0;i<hoops.length;i++){
      object(hoops[i],[art[0].x,pivotHeight,art[0].z],0,[1,1,1],poses[i]);
    }
    const rot=Math.PI/2+state.yaw,base=[state.x,0,state.z];
    if(state.drop<=0){
      const zone=targets[state.route], radius=zoneRadius*(1+.022*Math.sin(time*4));
      object(marker,[zone.x,0,zone.z],0,[radius,1,radius]);
      object(arrow,[zone.x,.12,zone.z],zone.angle);
    }
    object(shadow,base,rot);object(bus,base,rot);
    const jumping=state.cheer>0;
    object(jumping?dancers:riders,[state.x,jumping?.70*Math.abs(Math.sin(10*state.cheer)):0,state.z],rot);
    if(state.drop>0){
      const radius=2+(2.4-state.drop)*9;
      object(marker,base,0,[radius,1,radius]);
    }
    if(state.fire>0){for(const p of outlets){
      const tip=[base[0]+p[0]*Math.cos(rot)-p[2]*Math.sin(rot),p[1],base[2]+p[0]*Math.sin(rot)+p[2]*Math.cos(rot)];
      const pulse=Math.min(1,state.fire*5)*(.88+.12*Math.sin(time*61));object(jet,tip,rot,[pulse,pulse*1.5,pulse]);
    }}
  };
}

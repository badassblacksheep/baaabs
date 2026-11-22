const canvas = document.querySelector('#home-sheep');
const poster = document.querySelector('#home-poster');
const rotateButton = document.querySelector('#rotation-toggle');
const skinButton = document.querySelector('#skin-toggle');
const eyeButton = document.querySelector('[data-eye-pause]');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const base = new URL('.', import.meta.url);
let rotate = !motion.matches, animateEyes = !motion.matches;
let angle = -.49, tilt = .24, zoom = 1, eyeTime = 0;
let lastTime = 0, lastDrag = -Infinity, frame = 0, visible = true;
let gl, program, uniforms, attributes, atlas, atlasReady = false, generation = 0;
let batches = [];
let showSkin = true;
let flameMap, flameQuad, fireReady=false, showTime=0;
const pointers = new Map();

const vertex = `
attribute vec3 pos, color;
attribute vec2 uv;
attribute float eye;
uniform vec2 viewport;
uniform vec2 orbit;
uniform float zoom;
uniform mediump float age;
uniform vec3 outlet;
varying vec3 paint;
varying vec2 eyeUV;
varying float eyeSide;
void main(){
  vec3 p = pos * .001;
  float s = sin(orbit.x), c = cos(orbit.x);
  if(eye == 3.){
    float rise = smoothstep(0.,.32,age);
    float lift = smoothstep(.44,1.,age);
    float width = (.3+.9*rise+.65*lift);
    float height = .18+3.1*rise+.5*lift;
    p = outlet + vec3(c,0.,-s)*pos.x*width + vec3(.21,1.,0.)*(pos.y*height+lift*1.15);
  }
  p -= vec3(.35,5.5,0.);
  float horizontal = c*p.x - s*p.z;
  float depth = s*p.x + c*p.z;
  float vertical = cos(orbit.y)*p.y - sin(orbit.y)*depth;
  float forward = sin(orbit.y)*p.y + cos(orbit.y)*depth;
  float aspect = viewport.x / viewport.y;
  float scale = min(.151, aspect*.102)*zoom;
  float w = 1.-forward/60.;
  gl_Position = vec4(horizontal*scale/aspect, vertical*scale, -forward/24., w);
  paint = color; eyeUV = uv; eyeSide = eye;
}`;
const fragment = `
precision mediump float;
varying vec3 paint;
varying vec2 eyeUV;
varying float eyeSide;
uniform sampler2D atlas, flameMap, busPhoto;
uniform bool showSkin;
uniform mediump float age;
uniform float seed;
uniform float tile;
uniform bool textured;
void main(){
  vec3 rgb = paint;
  if(eyeSide > 4.5 && !showSkin)discard;
  if(eyeSide > 3.5 && eyeSide < 4.5){
    gl_FragColor = vec4(texture2D(busPhoto,eyeUV).rgb,1.);return;
  }
  if(eyeSide > 2.5 && eyeSide < 3.5){
    vec2 q=eyeUV;
    float h=q.y, phase=age*12.+seed;
    // Warp a real flame photograph. The neck stays pinned while the crown rolls and sheds wisps.
    q.x += h*(.023*sin(h*10.-phase)+.016*sin(h*21.-phase*1.4+q.x*4.));
    q.y += .016*h*sin(q.x*18.+h*5.+phase);
    vec3 photo=texture2D(flameMap,vec2(q.x,1.-q.y)).rgb;
    float hot=smoothstep(.20,.57,photo.g+.24*photo.b);
    float edge=smoothstep(0.,.11,q.x)*smoothstep(0.,.11,1.-q.x)*smoothstep(0.,.07,1.-q.y);
    float release=smoothstep(.42,.97,age);
    float base=smoothstep(-.025,.08,h-.42*release);
    float opacity=edge*hot*base*(1.-smoothstep(.58,1.,age))*smoothstep(0.,.045,age);
    vec3 radiance=mix(photo*vec3(1.5,.91,.60),vec3(1.,.97,.82),smoothstep(.50,.78,photo.b)*.93);
    float blue=(1.-smoothstep(.025,.17,h))*(1.-smoothstep(.01,.10,abs(q.x-.51)));
    radiance=mix(radiance,vec3(.36,.60,1.),blue*.9);
    gl_FragColor=vec4(radiance,opacity);return;
  }
  if(eyeSide > .5 && eyeSide < 2.5){
    if(textured){
      float index = mod(tile + (eyeSide > 1.5 ? 8. : 0.),192.);
      vec2 cell = vec2(mod(index,16.),floor(index/16.));
      rgb = texture2D(atlas,(cell+(eyeUV*31.+.5)/32.)/vec2(16.,12.)).rgb;
    }else{
      vec2 p = eyeUV*2.-1.;
      float pupil = smoothstep(.2,.3,length(p/vec2(1.55,.65)));
      rgb = mix(vec3(.02,.008,.004),vec3(.95,.32,.035),pupil);
    }
  }
  gl_FragColor = vec4(rgb,1.);
}`;

function initProgram(){
  const p = gl.createProgram();
  for(const [type, source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
    const shader = gl.createShader(type);
    gl.shaderSource(shader,source); gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(p,shader); gl.deleteShader(shader);
  }
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);
  return p;
}
function schedule(){
  if(!frame && visible && !document.hidden && batches.length) frame=requestAnimationFrame(draw);
}
function draw(now){
  frame=0;
  const dt=lastTime ? Math.min(.1,(now-lastTime)/1000) : 0;
  lastTime=now;
  if(rotate && !pointers.size && now-lastDrag>1200) angle+=dt*14*Math.PI/180;
  if(rotate && !motion.matches)showTime=(showTime+dt)%6.8;
  if(animateEyes)eyeTime=(eyeTime+dt)%16;
  const ratio=Math.min(devicePixelRatio,1.75);
  const w=Math.max(1,Math.round(canvas.clientWidth*ratio)), h=Math.max(1,Math.round(canvas.clientHeight*ratio));
  if(canvas.width!==w || canvas.height!==h){canvas.width=w;canvas.height=h;}
  gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.uniform2f(uniforms.viewport,w,h);gl.uniform2f(uniforms.orbit,angle,tilt);
  gl.uniform1f(uniforms.zoom,zoom);gl.uniform1f(uniforms.tile,Math.floor(eyeTime*12));
  gl.uniform1i(uniforms.textured,atlasReady);
  gl.uniform1i(uniforms.showSkin,showSkin);
  for(const b of batches){
    gl.bindBuffer(gl.ARRAY_BUFFER,b.vertices);
    gl.vertexAttribPointer(attributes.pos,3,gl.SHORT,false,14,0);
    gl.vertexAttribPointer(attributes.color,3,gl.UNSIGNED_BYTE,true,14,6);
    gl.vertexAttribPointer(attributes.uv,2,gl.UNSIGNED_SHORT,true,14,10);
    gl.vertexAttribPointer(attributes.eye,1,gl.UNSIGNED_BYTE,false,14,9);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b.indices);
    gl.drawElements(gl.TRIANGLES,b.count,gl.UNSIGNED_SHORT,0);
  }
  if(fireReady && !motion.matches)drawFire();
  poster.hidden=true;
  if(rotate || (animateEyes && atlasReady))schedule();
}
function drawFire(){
  // Back-to-front order for the translucent plumes. Opaque vehicle depth still occludes them.
  const sides=Math.cos(angle)>0?[-1,1]:[1,-1];
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);gl.bindBuffer(gl.ARRAY_BUFFER,flameQuad);
  gl.vertexAttribPointer(attributes.pos,2,gl.FLOAT,false,16,0);
  gl.vertexAttribPointer(attributes.uv,2,gl.FLOAT,false,16,8);
  for(const name of ['color','eye'])gl.disableVertexAttribArray(attributes[name]);
  gl.vertexAttrib1f(attributes.eye,3);
  for(const side of sides){
    const age=(showTime-(side<0?.78:1.03))/1.55;
    if(age<0 || age>=1)continue;
    gl.uniform1f(uniforms.age,age);gl.uniform1f(uniforms.seed,side*2.4);
    gl.uniform3f(uniforms.outlet,7.27,8.34,side*1.25);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  for(const name of ['color','eye'])gl.enableVertexAttribArray(attributes[name]);
  gl.depthMask(true);gl.disable(gl.BLEND);
}
function loadFire(version){
  const image=new Image();
  image.onload=()=>{
    if(version!==generation)return;
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,flameMap);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
    gl.activeTexture(gl.TEXTURE0);fireReady=true;schedule();
  };
  image.src=new URL('flame.jpg',base);
}
async function loadMesh(name,version){
  const response=await fetch(new URL(name + "?v=crown-header-1",base));
  if(!response.ok)throw Error(name+' returned '+response.status);
  const data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(version!==generation)return;
  const view=new DataView(data);
  function buffer(target,offset,size){
    const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,new Uint8Array(data,offset,size),gl.STATIC_DRAW);
    return b;
  }
  for(let offset=0;offset<data.byteLength;){
    const vertices=view.getUint32(offset,true), count=view.getUint32(offset+4,true);
    offset+=8;
    const v=buffer(gl.ARRAY_BUFFER,offset,vertices*14);offset+=vertices*14;
    const i=buffer(gl.ELEMENT_ARRAY_BUFFER,offset,count*2);offset+=count*2;
    batches.push({vertices:v,indices:i,count});
  }
  schedule();
}
function loadBusPhoto(version){
  const photo = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D,photo);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([100,101,98]));
  gl.uniform1i(uniforms.busPhoto,2);
  gl.activeTexture(gl.TEXTURE0);
  const image = new Image();
  image.onload = () => {
    if(version!==generation)return;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D,photo);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
    gl.activeTexture(gl.TEXTURE0);
    schedule();
  };
  image.src = new URL('earl-photo.jpg?v=crown-header-1',base);
}
function loadAtlas(version){
  const image=new Image();
  image.onload=()=>{
    if(version!==generation)return;
    gl.bindTexture(gl.TEXTURE_2D,atlas);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
    atlasReady=true;schedule();
  };
  image.src=new URL('ovine.jpg',base);
}
function buttons(){
  rotateButton.textContent=rotate?'Pause rotation':'Resume rotation';
  eyeButton.textContent=animateEyes?'Pause eyes':'Play eyes';
  eyeButton.setAttribute('aria-pressed',String(!animateEyes));
}
async function start(){
  const version=++generation;
  try{
    gl=canvas.getContext('webgl',{alpha:true,antialias:true});
    if(!gl)throw Error('WebGL unavailable');
    program=initProgram();gl.enable(gl.DEPTH_TEST);
    uniforms=Object.fromEntries(['viewport','orbit','zoom','tile','textured','age','seed','outlet','flameMap','busPhoto','showSkin'].map(k=>[k,gl.getUniformLocation(program,k)]));
    attributes=Object.fromEntries(['pos','color','uv','eye'].map(k=>[k,gl.getAttribLocation(program,k)]));
    for(const id of Object.values(attributes))gl.enableVertexAttribArray(id);
    atlas=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,atlas);
    for(const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0]));
    flameQuad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,flameQuad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,0,0,0, 1,0,1,0, -1,1,0,1, 1,1,1,1]),gl.STATIC_DRAW);
    flameMap=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,flameMap);
    for(const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0]));
    gl.uniform1i(uniforms.flameMap,1);gl.activeTexture(gl.TEXTURE0);
    loadBusPhoto(version);
    await loadMesh('shell.mesh',version);
    if(version!==generation)return;
    buttons();rotateButton.hidden=false;eyeButton.disabled=false;
    loadAtlas(version);loadFire(version);
    loadMesh('details.mesh',version).then(()=>{if(version===generation)skinButton.hidden=false;}).catch(console.warn);
  }catch(err){console.warn('Homepage model:',err);document.querySelector('#model-hint').textContent='3D preview unavailable';}
}
skinButton.onclick=()=>{
  showSkin=!showSkin;
  skinButton.textContent=showSkin?'Hide sheep panels':'Show sheep panels';
  schedule();
};
rotateButton.onclick=()=>{rotate=!rotate;buttons();schedule();};
eyeButton.onclick=()=>{animateEyes=!animateEyes;buttons();schedule();};
motion.addEventListener('change',()=>{rotate=animateEyes=!motion.matches;buttons();schedule();});
function setTilt(v){tilt=Math.max(-1.38,Math.min(1.38,v));}
function setZoom(v){zoom=Math.max(.55,Math.min(3.5,v));}
function spread(){const [a,b]=pointers.values();return Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));}
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0 || pointers.size>=2)return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  const old=pointers.get(e.pointerId);if(!old)return;
  const gap=pointers.size===2?spread():0;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gap)setZoom(zoom*spread()/gap);
  else{angle-=(e.clientX-old.x)*.008;setTilt(tilt+(e.clientY-old.y)*.008);}
  lastDrag=performance.now();schedule();
});
for(const event of ['pointerup','pointercancel','lostpointercapture']){
  canvas.addEventListener(event,e=>{if(pointers.delete(e.pointerId)){lastDrag=performance.now();schedule();}});
}
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.001));schedule();},{passive:false});
canvas.addEventListener('keydown',e=>{
  switch(e.key){
    case 'ArrowLeft':angle-=.12;break;case 'ArrowRight':angle+=.12;break;
    case 'ArrowUp':setTilt(tilt+.1);break;case 'ArrowDown':setTilt(tilt-.1);break;
    case '+':case '=':setZoom(zoom*1.1);break;case '-':setZoom(zoom/1.1);break;default:return;
  }
  e.preventDefault();lastDrag=performance.now();schedule();
});
new ResizeObserver(schedule).observe(canvas);
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;lastTime=0;schedule();}).observe(canvas);
document.addEventListener('visibilitychange',()=>{lastTime=0;schedule();});
canvas.addEventListener('webglcontextlost',e=>{
  e.preventDefault();generation++;batches=[];atlasReady=fireReady=false;poster.hidden=false;skinButton.hidden=true;
  rotateButton.hidden=true;eyeButton.disabled=true;cancelAnimationFrame(frame);frame=0;
});
canvas.addEventListener('webglcontextrestored',start);
start();

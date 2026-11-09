import {createRenderer} from './renderer.js';
const $=id=>document.getElementById(id);
const state={mode:'intro',x:0,z:0,yaw:0,steer:0,speed:0,gear:1,fire:0};
const keys=new Set(),controls=new Set(['KeyW','KeyS','KeyA','KeyD','KeyB','KeyF','Space']);
let lastBrake=-Infinity, fireCooldown=0, elapsed=0, heckled=false, radioTime=0;
let sound=true, audio,engine,gain,ready=false,previous=0,draw;
function setMode(mode){state.mode=mode;document.body.dataset.mode=mode;}
function radio(message,seconds=2.7){$('radio').textContent=message;radioTime=seconds;}
function initAudio(){
  try{
    if(!audio){
      audio=new AudioContext();engine=audio.createOscillator();gain=audio.createGain();
      engine.type='triangle';engine.frequency.value=46;gain.gain.value=0;engine.connect(gain).connect(audio.destination);engine.start();
    }
    if(sound)audio.resume().catch(()=>{});
  }catch{/* Captions and controls also work without audio. */}
}
function hush(){if(gain)gain.gain.setTargetAtTime(0,audio.currentTime,.03);}
function whoosh(){
  if(!sound||!audio)return;
  const buf=audio.createBuffer(1,audio.sampleRate*.48,audio.sampleRate),wave=buf.getChannelData(0);
  for(let i=0;i<wave.length;i++)wave[i]=(Math.random()*2-1)*(1-i/wave.length)**2;
  const noise=audio.createBufferSource(),filter=audio.createBiquadFilter(),level=audio.createGain();
  noise.buffer=buf;filter.type='lowpass';filter.frequency.value=890;level.gain.value=.48;
  noise.connect(filter).connect(level).connect(audio.destination);noise.start();
}
function restart(){
  if(!ready)return;
  if(state.mode!=='paused'){
    Object.assign(state,{x:0,z:0,yaw:0,steer:0,speed:0,gear:1,fire:0});
    lastBrake=-Infinity;fireCooldown=elapsed=0;heckled=false;
  }
  keys.clear();setMode('drive');radio('ROOF CREW  /  Take us to the lights.');initAudio();
  window.speechSynthesis?.cancel();$('start').blur();previous=performance.now();
}
function end(){
  keys.clear();hush();radio('');state.fire=0;setMode('over');
  $('eyebrow').textContent='SKIPPO  /  KEYS CONFISCATED';
  $('title').innerHTML='Game<br><i>over.</i>';
  const line='Five. I gave you five miles an hour. Give me the fucking keys.';
  $('copy').textContent='“'+line+'”';$('start').textContent='Try again ↗';$('start').focus({preventScroll:true});
  if(sound&&window.speechSynthesis&&window.SpeechSynthesisUtterance){
    const voice=new SpeechSynthesisUtterance(line);voice.rate=1.08;window.speechSynthesis.speak(voice);
  }
}
function pause(){
  keys.clear();hush();if(state.mode!=='drive')return;
  setMode('paused');radio('');$('eyebrow').textContent='DEEP PLAYA';$('title').textContent='Paused.';
  $('copy').textContent='Earl and the crew are right where you left them.';$('start').textContent='Resume drive →';
}
function press(k){
  if(state.mode!=='drive'||keys.has(k))return;
  keys.add(k);
  if(k==='KeyW'||k==='KeyS')state.gear=k==='KeyW'?1:-1;
  if(k==='KeyB'){
    if(elapsed-lastBrake>=.42)state.speed=Math.sign(state.speed)*Math.max(0,Math.abs(state.speed)-.72);
    lastBrake=elapsed;
  }
  if(k==='KeyF'&&fireCooldown<=0){state.fire=.62;fireCooldown=.85;whoosh();}
}
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){pause();return;}
  if(state.mode!=='drive'||!controls.has(e.code))return;
  e.preventDefault();if(!e.repeat)press(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
for(const b of document.querySelectorAll('[data-key]')){
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);press(b.dataset.key);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(b.dataset.key));
}
$('shift').onclick=()=>{state.gear*=-1;};
$('start').onclick=restart;
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',sound);if(!sound){hush();window.speechSynthesis?.cancel();}else initAudio();};
function advance(dt){
  elapsed+=dt;fireCooldown-=dt;state.fire=Math.max(0,state.fire-dt);
  if(radioTime>0&&(radioTime-=dt)<=0)$('radio').textContent='';
  if(keys.has('Space'))state.speed+=state.gear*.62*dt;
  else state.speed=Math.sign(state.speed)*Math.max(0,Math.abs(state.speed)-.115*dt);
  const tenths=Math.round(Math.abs(state.speed)*10);
  $('mph').textContent=(tenths/10).toFixed(1);$('gear').textContent=state.gear===1?'DRIVE':'REVERSE';
  if(tenths>50){end();return;}
  if(!heckled&&tenths>=46){heckled=true;radio('ROOF CREW  /  Dude. Floor it.');}
  const target=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  state.steer+=(target-state.steer)*(1-Math.exp(-dt*5));
  const meters=state.speed*.44704*dt;
  state.yaw+=meters*Math.tan(state.steer*.69)/6.05;
  state.x+=Math.sin(state.yaw)*meters;state.z-=Math.cos(state.yaw)*meters;
  if(audio&&sound){engine.frequency.setTargetAtTime(40+tenths*.48,audio.currentTime,.09);gain.gain.setTargetAtTime(.055,audio.currentTime,.09);}
}
function frame(ms){
  const dt=Math.min(.1,Math.max(0,(ms-previous)/1000));previous=ms;
  if(state.mode==='drive')advance(dt);
  if(state.mode==='drive'||state.mode==='intro')draw(state,ms/1000);
  requestAnimationFrame(frame);
}
try{
  draw=await createRenderer($('playa'));ready=true;$('start').disabled=false;$('start').textContent='Start Earl →';requestAnimationFrame(frame);
}catch(err){
  console.error(err);$('copy').textContent=err.message.includes('WebGL')?err.message:'Earl couldn’t load. Check your connection and try again.';
  $('start').disabled=false;$('start').textContent='Reload';$('start').onclick=()=>location.reload();
}

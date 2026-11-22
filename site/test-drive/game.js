import {spawnRobot,advanceRobot,approachesPlayer} from './robot-traffic.js';
import {createClockMap} from './city-clock.js';
import {createRenderer,zoneRadius} from './renderer.js?v=dj-booth-1';
import {art,targets,obstacles,clearance,partyAlignment} from './landmarks.js?v=lord-snort';
import {createSoundCar} from './sound-car.js?v=duet';
const $=id=>document.getElementById(id);
const state={mode:'intro',x:0,z:0,yaw:0,steer:0,speed:0,gear:1,cruise:false,fire:0};
const keys=new Set(),controls=new Set(['KeyW','KeyS','KeyA','KeyD','Space','Digit5','Numpad5']);
let fireCooldown=0, heckled=false, radioTime=0;
let music,impactTimer=0,shownArt=-1;
let sound=true, audio,engine,gain,ready=false,previous=0,draw;
const canvas=$('playa');
const drawClock=createClockMap($('city-clock'));
state.robot=spawnRobot();
state.route=0;
state.charge=0;
state.cheer=0;
state.drop=0;
state.cameraYaw=0;
state.cameraLift=0;
let drag=null;
function releaseCamera(){
  if(!drag)return;
  const id=drag.id;
  drag=null;
  canvas.classList.remove('dragging');
  if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
}
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0||!['intro','drive'].includes(state.mode))return;
  if(e.pointerType!=='mouse' && state.mode==='drive' && !document.body.classList.contains('button-mode')){
    if(pendingStick || stickPointer!==null || drag)return;
    const hold={id:e.pointerId,x:e.clientX,y:e.clientY};
    pendingStick=hold;
    canvas.setPointerCapture(hold.id);
    hold.timer=setTimeout(()=>engageStick(hold),300);
    return;
  }
  if(drag)return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY};
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove',e=>{
  if(e.pointerId===stickPointer){moveStick(e);return;}
  if(e.pointerId===pendingStick?.id){
    const hold=pendingStick;
    if(Math.hypot(e.clientX-hold.x,e.clientY-hold.y)<9)return;
    clearTimeout(hold.timer);pendingStick=null;
    drag={id:hold.id,x:hold.x,y:hold.y};
    canvas.classList.add('dragging');
  }
  if(e.pointerId!==drag?.id)return;
  state.cameraYaw-=(e.clientX-drag.x)*.007;
  state.cameraLift=Math.max(-6,Math.min(20,state.cameraLift+(e.clientY-drag.y)*.048));
  drag.x=e.clientX;drag.y=e.clientY;
});
for(const event of ['pointerup','pointercancel','lostpointercapture']){
  canvas.addEventListener(event,e=>{
    if(e.pointerId===pendingStick?.id||e.pointerId===stickPointer)releaseStick();
    if(e.pointerId===drag?.id)releaseCamera();
  });
}
function setMode(mode){releaseStick();for(const id of touchKeys.keys())setTouch(id,null);releaseCamera();state.mode=mode;document.body.dataset.mode=mode;}
function radio(message,seconds=2.7){$('radio').textContent=message;radioTime=seconds;}
function initAudio(){
  try{
    if(!audio){
      audio=new AudioContext();engine=audio.createOscillator();gain=audio.createGain();
      engine.type='triangle';engine.frequency.value=46;gain.gain.value=0;engine.connect(gain).connect(audio.destination);engine.start();
    }
    if(!music)music=createSoundCar(audio);
    if(sound)audio.resume().catch(()=>{});
  }catch{/* Captions and controls also work without audio. */}
}
function hush(){music?.stop();if(gain)gain.gain.setTargetAtTime(0,audio.currentTime,.03);}
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
    Object.assign(state,{x:0,z:0,yaw:0,steer:0,speed:0,gear:1,cruise:false,fire:0,cameraYaw:0,cameraLift:0});
    state.robot=spawnRobot();
    state.route=state.charge=0;impactTimer=0;state.drop=state.cheer=0;
    fireCooldown=0;heckled=false;
  }
  keys.clear();setMode('drive');radio('ROOF CREW  /  Follow the arrow. Party side toward the art!');initAudio();
  window.speechSynthesis?.cancel();canvas.focus({preventScroll:true});previous=performance.now();
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
  releaseCamera();
  keys.clear();hush();if(state.mode!=='drive')return;
  setMode('paused');radio('');$('eyebrow').textContent='DEEP PLAYA';$('title').textContent='Paused.';
  $('copy').textContent='Your crew and wheels are right where you left them.';$('start').textContent='Resume drive →';
}
function targetInfo(){
  const target=targets[state.route],piece=art[target.art],dx=target.x-state.x,dz=target.z-state.z;
  const bearing=Math.atan2(dx,-dz)-state.yaw;
  return {piece,index:target.art,distance:Math.hypot(dx,dz),bearing:Math.atan2(Math.sin(bearing),Math.cos(bearing)),
    aligned:partyAlignment(state,piece)>=Math.cos(Math.PI/5)};
}
function bassSound(full){
  if(!sound||!audio)return;
  const start=audio.currentTime;
  const notes=full?[130.81,98,65.41,49]:[261.63,392];
  notes.forEach((hz,i)=>{
    const t=start+i*(full?.23:.10),len=full?.48:.15;
    const osc=audio.createOscillator(),amp=audio.createGain();
    osc.type=full?'triangle':'sine';osc.frequency.setValueAtTime(hz,t);
    if(full)osc.frequency.exponentialRampToValueAtTime(hz*.66,t+len);
    amp.gain.setValueAtTime(.001,t);amp.gain.exponentialRampToValueAtTime(full?.32:.16,t+.02);
    amp.gain.exponentialRampToValueAtTime(.001,t+len);
    osc.connect(amp).connect(audio.destination);osc.start(t);osc.stop(t+len);
  });
}
function scorePoof(){
  const info=targetInfo();
  if(state.drop>0||info.distance>zoneRadius)return;
  if(!info.aligned){radio('ROOF CREW  /  Art on our left! Follow the arrow.');return;}
  state.route=(state.route+1)%targets.length;
  state.charge++;
  const full=state.charge===3;
  state.cheer=full?2.4:1.45;
  if(full)state.drop=2.4;
  bassSound(full);
  radio(full?'BASS DROP!  /  The whole roof is jumping.':'ROOF CREW  /  Again! Hit the next ring.');
}
function press(k,keyboard=true){
  if(state.mode!=='drive')return;
  // Only continuous controls need a keyup; one-shot commands cannot get stuck.
  if(keyboard && ['KeyW','KeyS','KeyA','KeyD'].includes(k))keys.add(k);
  if(k==='KeyW'||k==='KeyS')state.cruise=false;
  if(k==='Digit5'||k==='Numpad5'){
    if(state.cruise)return;
    state.cruise=true;
    state.cruiseSpeed=5*state.gear;
    state.speed=state.cruiseSpeed;
    radio('CRUISE  /  Holding 5.0 mph.');
  }
  if(k==='Space'&&fireCooldown<=0){state.fire=.62;fireCooldown=.85;whoosh();scorePoof();}
}
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){pause();return;}
  const k=e.key==='5'?'Digit5':e.code;
  if(state.mode!=='drive'||!controls.has(k)||e.metaKey||e.ctrlKey||e.altKey)return;
  e.preventDefault();if(!e.repeat)press(k);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
// Each thumb owns its press. A captured finger can slide between paired buttons.
const touchKeys=new Map();
const touchButtons=[...document.querySelectorAll('[data-key]')];
document.addEventListener('contextmenu',e=>{
  if(e.target.closest('button,#stick,#playa'))e.preventDefault();
});
function held(code){return keys.has(code)||[...touchKeys.values()].some(b=>b.dataset.key===code);}
function setTouch(id,button){
  const previous=touchKeys.get(id);
  if(previous===button)return;
  touchKeys.delete(id);
  if(previous && ![...touchKeys.values()].includes(previous))previous.classList.remove('active');
  if(!button)return;
  touchKeys.set(id,button);
  button.classList.add('active');
  press(button.dataset.key,false);
}
const stick=$('stick'),knob=$('stick-knob'),vector=$('stick-vector');
let pendingStick=null,stickPointer=null,stickTurn=0,stickDrive=0,anchorX=0,anchorY=0;
function engageStick(hold){
  if(pendingStick!==hold)return;
  pendingStick=null;stickPointer=hold.id;anchorX=hold.x;anchorY=hold.y;
  stick.style.left=anchorX+'px';stick.style.top=anchorY+'px';
  stick.classList.add('engaged');vector.hidden=true;
}
function releaseStick(){
  const id=stickPointer??pendingStick?.id;
  if(pendingStick)clearTimeout(pendingStick.timer);
  pendingStick=null;stickPointer=null;stickTurn=0;stickDrive=0;
  stick.classList.remove('engaged');knob.style.transform='';
  if(id!=null && canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
}
function moveStick(e){
  const dx=e.clientX-anchorX,dy=e.clientY-anchorY;
  const travel=42,scale=Math.max(travel,Math.hypot(dx,dy));
  const x=dx/scale,y=dy/scale;
  const axis=v=>Math.sign(v)*Math.max(0,(Math.abs(v)-.16)/.84);
  stickTurn=axis(x);stickDrive=axis(-y);
  if(stickDrive)state.cruise=false;
  const distance=Math.hypot(x,y)*travel;
  knob.style.transform='translate('+x*travel+'px,'+y*travel+'px)';
  vector.hidden=distance<7;
  vector.style.width=distance+'px';
  vector.style.transform='rotate('+Math.atan2(y,x)+'rad)';
}
$('switch-controls').onclick=e=>{
  releaseStick();for(const id of touchKeys.keys())setTouch(id,null);
  const buttons=document.body.classList.toggle('button-mode');
  e.currentTarget.textContent=buttons?'Use joystick':'Use buttons';
  e.currentTarget.setAttribute('aria-pressed',String(buttons));
};
for(const b of touchButtons){
  b.addEventListener('click',e=>{if(e.detail===0)press(b.dataset.key,false);});
  b.addEventListener('pointerdown',e=>{
    e.preventDefault();b.setPointerCapture(e.pointerId);setTouch(e.pointerId,b);
  });
  b.addEventListener('pointermove',e=>{
    if(!b.hasPointerCapture(e.pointerId)||!b.closest('.thumb-pair'))return;
    const next=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-key]');
    setTouch(e.pointerId,next?.parentElement===b.parentElement?next:null);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture']){
    b.addEventListener(event,e=>setTouch(e.pointerId,null));
  }
}
$('start').onclick=restart;
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',sound);if(!sound){hush();window.speechSynthesis?.cancel();}else initAudio();};
function advance(dt){
  state.cheer=Math.max(0,state.cheer-dt);
  if(state.drop>0){
    state.drop=Math.max(0,state.drop-dt);
    if(state.drop===0)state.charge=0;
  }
  fireCooldown-=dt;state.fire=Math.max(0,state.fire-dt);
  if(radioTime>0&&(radioTime-=dt)<=0)$('radio').textContent='';
  if(state.cruise)state.speed=state.cruiseSpeed;
  else {
    const forward=held('KeyW'),reverse=held('KeyS');
    const direction=forward||reverse?Number(forward)-Number(reverse):stickDrive;
    if(direction && state.speed*direction>=0){
      state.gear=Math.sign(direction);
      state.speed+=direction*.62*dt;
    }else{
      const deceleration=forward||reverse||stickDrive?2.4:.115;
      state.speed=Math.sign(state.speed)*Math.max(0,Math.abs(state.speed)-deceleration*dt);
    }
  }
  const tenths=Math.round(Math.abs(state.speed)*10);
  $('mph').textContent=(tenths/10).toFixed(1);$('gear').textContent=(state.gear===1?'DRIVE':'REVERSE')+(state.cruise?' · CRUISE':'');
  if(tenths>50){end();return;}
  if(!state.cruise&&!heckled&&tenths>=46){heckled=true;radio('ROOF CREW  /  Dude. Floor it.');}
  const left=held('KeyA'),right=held('KeyD');
  const target=left||right?Number(right)-Number(left):stickTurn;
  state.steer+=(target-state.steer)*(1-Math.exp(-dt*5));
  const meters=state.speed*.44704*dt;
  const yaw=state.yaw+meters*Math.tan(state.steer*.69)/6.05;
  const x=state.x+Math.sin(yaw)*meters,z=state.z-Math.cos(yaw)*meters;
  impactTimer=Math.max(0,impactTimer-dt);
  const obstacle=meters&&obstacles.find(piece=>{
    const next=clearance(x,z,yaw,piece);
    return next<=0&&next<clearance(state.x,state.z,state.yaw,piece);
  });
  const traffic=meters&&approachesPlayer(state.robot,state,state.robot,{x,z});
  if(obstacle||traffic){
    state.speed=0;state.cruise=false;
    if(impactTimer===0){radio(traffic?'ROOF CREW  /  Give Robot Heart a little room.':'ROOF CREW  /  This is a drive-by art tour. The “by” is important.',4);impactTimer=4;}
  }else{state.x=x;state.z=z;state.yaw=yaw;}
  const cruiseButton=$('cruise-button');
  if((cruiseButton.getAttribute('aria-pressed')==='true')!==state.cruise)cruiseButton.setAttribute('aria-pressed',String(state.cruise));
  state.robot=advanceRobot(state.robot,state,dt);
  const info=targetInfo();
  $('bass').value=state.charge;
  if(shownArt!==info.index){
    const link=$('art-credit');link.href=info.piece.url;link.firstChild.textContent=info.piece.name+' ↗';
    link.querySelector('span').textContent=info.piece.credit;shownArt=info.index;
  }
  const steer=Math.abs(info.bearing)<.22?'Ahead':info.bearing<0?'Left':'Right';
  $('zonehint').textContent=state.drop>0?'BASS DROP!':info.distance>zoneRadius?
    steer+' · '+Math.ceil(info.distance-zoneRadius)+' m to ring':info.aligned?'PARTY SIDE ALIGNED · FIRE!':'Follow arrow · art on left';
  if(audio&&sound)music?.update(state);
  if(audio&&sound){engine.frequency.setTargetAtTime(40+tenths*.48,audio.currentTime,.09);gain.gain.setTargetAtTime(.055,audio.currentTime,.09);}
}
function frame(ms){
  const dt=Math.min(.1,Math.max(0,(ms-previous)/1000));previous=ms;
  if(state.mode==='drive'){advance(dt);drawClock(state);}
  if(state.mode==='drive'||state.mode==='intro')draw(state,ms/1000);
  requestAnimationFrame(frame);
}
try{
  draw=await createRenderer($('playa'));ready=true;$('start').disabled=false;$('start').textContent='Start driving →';requestAnimationFrame(frame);
}catch(err){
  console.error(err);$('copy').textContent=err.message.includes('WebGL')?err.message:'The playa couldn’t load. Check your connection and try again.';
  $('start').disabled=false;$('start').textContent='Reload';$('start').onclick=()=>location.reload();
}

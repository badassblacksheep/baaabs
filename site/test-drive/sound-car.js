// Original 142 BPM trance loop. All instruments are synthesized in the browser.
export function createSoundCar(ctx){
  const master=ctx.createGain(),pan=ctx.createStereoPanner(),filter=ctx.createBiquadFilter();
  filter.type='lowpass';filter.frequency.value=5600;
  master.gain.value=0;master.connect(filter).connect(pan).connect(ctx.destination);
  const robotLevel=ctx.createGain(),robotPan=ctx.createStereoPanner(),robotTone=ctx.createBiquadFilter();
  robotLevel.gain.value=0;robotTone.type='lowpass';
  robotTone.connect(robotLevel).connect(robotPan).connect(ctx.destination);
  const hats=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.13),ctx.sampleRate);
  const samples=hats.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
  const step=60/142/4,roots=[42,38,45,40],lead=[7,null,12,15,null,10,7,null,3,7,null,12,10,null,5,null];
  let next=0,index=0,playing=false;
  function voice(source,t,length,volume,cutoff,kind='lowpass',output=master){
    const envelope=ctx.createGain(),eq=ctx.createBiquadFilter();
    eq.type=kind;eq.frequency.value=cutoff;
    envelope.gain.setValueAtTime(.0001,t);envelope.gain.exponentialRampToValueAtTime(volume,t+.008);
    envelope.gain.exponentialRampToValueAtTime(.0001,t+length);
    source.connect(eq).connect(envelope).connect(output);source.start(t);source.stop(t+length+.015);
    source.onended=()=>{source.disconnect();eq.disconnect();envelope.disconnect();};
  }
  function note(midi,t,len,vol,type,cutoff,output=master){
    const osc=ctx.createOscillator();osc.type=type;osc.frequency.value=440*2**((midi-69)/12);
    voice(osc,t,len,vol,cutoff,'lowpass',output);
  }
  function tick(t,i,drop){
    const n=i%16,bar=Math.floor(i/16)%4,root=roots[bar];
    // Robot Heart answers the lead with syncopated chords and a low tom.
    // Both buses receive this exact beat timestamp and the same bar root.
    if(n===3||n===10||n===14){
      for(const interval of [0,7,12])note(root+12+interval,t,.24,.105,'sawtooth',1900,robotTone);
    }
    if(n===0||n===7||n===12)note(root-(n===7?5:0),t,.20,.38,'sine',580,robotTone);
    if(n===4||n===12){
      const clap=ctx.createBufferSource();clap.buffer=hats;
      voice(clap,t,.10,.27,1450,'highpass',robotTone);
    }
    if(n%4===0){
      const kick=ctx.createOscillator();kick.frequency.setValueAtTime(138,t);
      kick.frequency.exponentialRampToValueAtTime(43,t+.115);voice(kick,t,.22,.52,1600);
    }
    if(n%4===2){note(root,t,.14,.23,'sawtooth',drop?1100:460);
      const hat=ctx.createBufferSource();hat.buffer=hats;voice(hat,t,.085,.16,5800,'highpass');}
    const melody=lead[(n+bar*2)%16];
    if(melody!==null){
      note(root+24+melody,t,.19,.10,'sawtooth',drop?4400:2100);
      note(root+24+melody,t+.15,.16,.035,'triangle',2300);
    }
    if(drop&&n%2===0)note(root+12+[0,7,12,15][(n/2)%4],t,.10,.17,'square',1100);
  }
  return {
    update(state){
      const now=ctx.currentTime;
      if(!playing){next=now+.035;playing=true;master.gain.setTargetAtTime(.32,now,.045);}
      if(next<now)next=now+.01;
      // The roof stacks are aft. Their stereo position follows the camera orbit.
      pan.pan.setTargetAtTime(.50*Math.sin(.55+state.cameraYaw),now,.10);
      filter.frequency.setTargetAtTime(6400/(1+Math.max(0,state.cameraLift)*.035),now,.15);
      const dx=state.robot.x-state.x,dz=state.robot.z-state.z;
      const range=Math.hypot(dx,dz),radius=23;
      const proximity=1/(1+(range/radius)**2);
      const orbit=.55+state.steer*.14+state.cameraYaw-state.yaw;
      const right=(dx*Math.cos(orbit)-dz*Math.sin(orbit))/Math.max(1,range);
      robotLevel.gain.setTargetAtTime(.77*proximity,now,.085);
      robotTone.frequency.setTargetAtTime(520+6500*proximity,now,.12);
      robotPan.pan.setTargetAtTime(.88*right,now,.095);
      while(next<now+.12){tick(next,index++,state.drop>0);next+=step;}
    },
    stop(){playing=false;robotLevel.gain.setTargetAtTime(0,ctx.currentTime,.018);master.gain.setTargetAtTime(0,ctx.currentTime,.018);}
  };
}

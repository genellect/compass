/** Original procedural ambience; no microphone, recording, external audio or autoplay. */
export function createSoundscape(context: AudioContext) {
  const master=context.createGain(),bus=context.createGain(),limiter=context.createDynamicsCompressor();
  master.gain.value=0;limiter.threshold.value=-16;limiter.knee.value=16;limiter.ratio.value=4;
  bus.connect(limiter);limiter.connect(master);master.connect(context.destination);
  let seed=21;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)*2-1;
  const impulse=context.createBuffer(2,Math.floor(context.sampleRate*2.4),context.sampleRate);
  for(let channel=0;channel<2;channel++){
    const data=impulse.getChannelData(channel);
    for(let i=0;i<data.length;i++)data[i]=random()*Math.pow(1-i/data.length,3)*.22;
  }
  const reverb=context.createConvolver(),send=context.createGain();reverb.buffer=impulse;send.gain.value=.24;
  send.connect(reverb);reverb.connect(bus);
  const sources: AudioScheduledSourceNode[]=[];
  const notes=[130.8128,195.9977,261.6256,329.6276,391.9954,493.8833];
  const voices=notes.map((frequency,index)=>{
    const tone=context.createOscillator(),gain=context.createGain(),pan=context.createStereoPanner();
    tone.type='sine';tone.frequency.value=frequency;tone.detune.value=index%2?2:-2;
    gain.gain.value=[.055,.035,.03,.022,.018,.012][index];pan.pan.value=(index%3-1)*.32;
    tone.connect(gain);gain.connect(pan);pan.connect(bus);pan.connect(send);tone.start();sources.push(tone);
    const drift=context.createOscillator(),depth=context.createGain();drift.frequency.value=.035+index*.011;
    depth.gain.value=gain.gain.value*.15;drift.connect(depth);depth.connect(gain.gain);drift.start();sources.push(drift);
    return tone;
  });
  const air=context.createBufferSource(),airFilter=context.createBiquadFilter(),airGain=context.createGain();
  const airBuffer=context.createBuffer(1,context.sampleRate*8,context.sampleRate),airData=airBuffer.getChannelData(0);
  for(let i=0;i<airData.length;i++)airData[i]=random();
  air.buffer=airBuffer;air.loop=true;airFilter.type='bandpass';airFilter.frequency.value=950;airFilter.Q.value=.45;
  airGain.gain.value=.012;air.connect(airFilter);airFilter.connect(airGain);airGain.connect(bus);air.start();sources.push(air);
  let enabled=false,disposed=false,lastChapter=-1,lastInteraction=-1,lastArrival=-10;
  const playable=()=>enabled&&!disposed&&!document.hidden&&context.state==='running';
  function tone(frequency:number,volume:number,duration:number,delay=0){
    const start=context.currentTime+delay,osc=context.createOscillator(),gain=context.createGain();
    osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(volume,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(gain);gain.connect(bus);gain.connect(send);osc.start(start);osc.stop(start+duration+.03);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  async function setEnabled(value:boolean){
    if(disposed)return false;
    if(value&&context.state!=='running')await context.resume();
    if(disposed)return false;
    enabled=value&&context.state==='running';
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(enabled && !document.hidden ? .55 : 0,context.currentTime,.12);
    if(!enabled)lastChapter=-1;
    return enabled;
  }
  function cue(index:number){
    if(!playable()||index===lastChapter)return;
    lastChapter=index;
    const shift=[0,2,0,5,0][index%5],ratio=Math.pow(2,shift/12),now=context.currentTime;
    voices.forEach((voice,i)=>voice.frequency.setTargetAtTime(notes[i]*ratio,now,1.4));
    if(now-lastArrival<1.2)return;lastArrival=now;
    tone(523.251*ratio,.12,.9);tone(783.991*ratio,.065,1.3,.16);
  }
  function setTravel(progress:number){
    if(disposed)return;
    const amount=Math.sin(Math.PI*Math.max(0,Math.min(1,progress)));
    airGain.gain.setTargetAtTime(.012+amount*.055,context.currentTime,.16);
    airFilter.frequency.setTargetAtTime(950+amount*1050,context.currentTime,.2);
  }
  function interact(kind:'hover'|'activate'){
    if(!playable())return;
    const now=context.currentTime;if(now-lastInteraction<(kind==='hover' ? .16 : .07))return;lastInteraction=now;
    tone(kind==='hover'?659.255:880,kind==='hover' ? .026 : .07,kind==='hover' ? .13 : .28);
  }
  const visibility=()=>{
    if(disposed)return;
    master.gain.setTargetAtTime(document.hidden ? 0 : enabled ? .55 : 0,context.currentTime,.12);
    if(document.hidden)void context.suspend();else if(enabled)void context.resume().catch(()=>{});
  };
  document.addEventListener('visibilitychange',visibility);
  return {setEnabled,cue,setTravel,interact,dispose(){if(disposed)return;disposed=true;enabled=false;document.removeEventListener('visibilitychange',visibility);sources.forEach(source=>source.stop());void context.close();}};
}
export type Soundscape = ReturnType<typeof createSoundscape>;

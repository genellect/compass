/** Original, quiet harmonic ambience. Created only after an explicit sound-button gesture. */
export function createSoundscape() {
  const context = new AudioContext();
  const master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
  const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 620; filter.Q.value = .3; filter.connect(master);
  const voices = [55,82.4069,110,164.8138].map((frequency,index) => {
    const oscillator=context.createOscillator(), gain=context.createGain();
    oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.detune.value=index%2?3:-3;
    gain.gain.value=[.2,.095,.07,.035][index];oscillator.connect(gain);gain.connect(filter);oscillator.start();
    return oscillator;
  });
  let enabled=false, disposed=false, lastChapter=-1;
  function setEnabled(value:boolean) {
    enabled=value;
    if(disposed)return;
    if(value)void context.resume();
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime((value && !document.hidden) ? .12 : 0,context.currentTime,.35);
  }
  function cue(index:number) {
    if(!enabled||disposed||document.hidden||index===lastChapter)return;
    lastChapter=index;
    const time=context.currentTime;
    filter.frequency.setTargetAtTime(430+index*75,time,1.2);
    const tone=context.createOscillator(),envelope=context.createGain();
    tone.type='sine';tone.frequency.value=[220,246.9417,293.6648,329.6276,440][index%5];
    envelope.gain.setValueAtTime(0,time);envelope.gain.linearRampToValueAtTime(.04,time+.12);envelope.gain.exponentialRampToValueAtTime(.0001,time+1.5);
    tone.connect(envelope);envelope.connect(master);tone.start(time);tone.stop(time+1.6);
    tone.onended=()=>{tone.disconnect();envelope.disconnect();};
  }
  const visibility=()=>setEnabled(enabled);
  document.addEventListener('visibilitychange',visibility);
  return {setEnabled,cue,dispose(){if(disposed)return;disposed=true;document.removeEventListener('visibilitychange',visibility);voices.forEach(v=>v.stop());void context.close();}};
}
export type Soundscape = ReturnType<typeof createSoundscape>;

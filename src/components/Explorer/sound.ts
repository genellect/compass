import type { Vector } from './contracts';

type SpatialVector={x:number;y:number;z:number};
export interface SpatialSound {
  setEnabled(enabled:boolean):Promise<boolean>;
  setVolume(value:number):void;
  room(id:string,position:Vector):void;
  cue(name:'select'|'door'|'paper',position?:Vector):void;
  travel(distance:number,position:Vector):void;
  movement(amount:number):void;
  listener(position:SpatialVector,direction:SpatialVector):void;
  suspend():Promise<void>;
  resume():Promise<void>;
  dispose():void;
}

/** Audio buffers are fetched only after an explicit sound gesture. */
export async function createSpatialSound(context:AudioContext,signal:AbortSignal):Promise<SpatialSound> {
  let enabled=false,disposed=false,volume=.65;
  const master=context.createGain();master.gain.value=0;
  const compressor=context.createDynamicsCompressor();compressor.threshold.value=-16;compressor.ratio.value=3;
  master.connect(compressor);compressor.connect(context.destination);
  const buffers=new Map<string,AudioBuffer>();
  for(const name of ['room','door','select','equipment']) {
    const response=await fetch('/media/explorer/audio/'+name+'.mp3',{signal});
    if(!response.ok)throw new Error('Sound unavailable');
    buffers.set(name,await context.decodeAudioData(await response.arrayBuffer()));
  }
  const room=context.createBufferSource();room.buffer=buffers.get('room')!;room.loop=true;
  const air=context.createGain();air.gain.value=.2;room.connect(air);air.connect(master);room.start();
  const equipment=context.createBufferSource();equipment.buffer=buffers.get('equipment')!;equipment.loop=true;
  const equipmentGain=context.createGain();equipmentGain.gain.value=0;
  const equipmentPan=context.createPanner();equipmentPan.panningModel='HRTF';equipmentPan.refDistance=4;equipmentPan.rolloffFactor=.6;
  equipment.connect(equipmentGain);equipmentGain.connect(equipmentPan);equipmentPan.connect(master);equipment.start();
  const tone=context.createBiquadFilter();tone.type='lowpass';tone.frequency.value=5500;
  air.disconnect();air.connect(tone);tone.connect(master);
  const active=new Set<AudioBufferSourceNode>();
  // Short filtered contact sounds are generated locally, not additional media downloads.
  const contact=context.createBuffer(1,Math.ceil(context.sampleRate*.13),context.sampleRate);
  let seed=1827;const samples=contact.getChannelData(0);
  for(let i=0;i<samples.length;i++){seed=(seed*1664525+1013904223)>>>0;samples[i]=((seed/4294967296)*2-1)*Math.exp(-i/samples.length*8);}
  buffers.set('paper',contact);buffers.set('step',contact);let travelled=0,foot=0;
  function cue(name:'select'|'door'|'paper'|'step',position?:Vector) {
    if(!enabled||disposed)return;
    const source=context.createBufferSource();source.buffer=buffers.get(name)!;
    const gain=context.createGain();gain.gain.value=name==='door'?.16:name==='step'?.075:name==='paper'?.045:.06;
    const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=name==='step'?600:name==='paper'?2600:16000;
    source.playbackRate.value=name==='step'?.75:1;source.connect(filter);filter.connect(gain);
    let panner:PannerNode|null=null;
    if(position){panner=context.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=3;panner.maxDistance=25;panner.rolloffFactor=.8;
      panner.positionX.value=position[0];panner.positionY.value=position[1];panner.positionZ.value=position[2];gain.connect(panner);panner.connect(master);}
    else gain.connect(master);
    active.add(source);source.onended=()=>{active.delete(source);source.disconnect();filter.disconnect();gain.disconnect();panner?.disconnect();};source.start();
  }
  async function setEnabled(value:boolean){if(disposed)return false;enabled=value;if(value)await context.resume();master.gain.setTargetAtTime(value?volume:0,context.currentTime,.25);return value;}
  return {setEnabled,cue,
    travel(distance,position){if(!enabled||disposed)return;travelled+=distance;if(travelled>.85){travelled%=.85;foot=1-foot;cue('step',[position[0]+(foot?.12:-.12),.08,position[2]]);}},
    setVolume(value){volume=Math.min(1,Math.max(0,value));if(!disposed)master.gain.setTargetAtTime(enabled?volume:0,context.currentTime,.15);},
    room(id,position){if(disposed)return;const time=context.currentTime;
      equipmentGain.gain.setTargetAtTime(id==='technology'?.045:0,time,1.5);
      equipmentPan.positionX.setTargetAtTime(position[0],time,1);equipmentPan.positionY.value=1.5;equipmentPan.positionZ.setTargetAtTime(position[2],time,1);
      tone.frequency.setTargetAtTime(['community','founder','contact'].includes(id)?2600:id==='technology'?6500:4500,time,1.5);},
    movement(amount){if(!disposed)air.gain.setTargetAtTime(.16+amount*.06,context.currentTime,.8);},
    listener(position,direction){if(disposed)return;const listener=context.listener;
      listener.positionX.value=position.x;listener.positionY.value=position.y;listener.positionZ.value=position.z;
      listener.forwardX.value=direction.x;listener.forwardY.value=direction.y;listener.forwardZ.value=direction.z;listener.upX.value=0;listener.upY.value=1;listener.upZ.value=0;},
    async suspend(){if(!disposed&&context.state==='running')await context.suspend();},
    async resume(){if(!disposed&&enabled)await context.resume();},
    dispose(){if(disposed)return;disposed=true;room.stop();room.disconnect();equipment.stop();equipment.disconnect();equipmentGain.disconnect();equipmentPan.disconnect();tone.disconnect();active.forEach(source=>source.stop());active.clear();master.disconnect();compressor.disconnect();buffers.clear();void context.close();}
  };
}

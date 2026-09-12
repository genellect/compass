import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import type { SectionId } from '../Habitat/scene-config';
import type { ExplorerController, ExplorerHooks, ExplorerPhase, ExplorerSnapshot, NavMesh, Point, Room, SpatialManifest } from './contracts';
import { Navigation } from './navigation';
import { CollisionWorld } from './collision';
import { FrameWindow, GPUTimer, passesEntry } from './performance';
import { projectHTML } from './projection';
import { addExterior } from './exterior';
import { createExhibitFilm } from './exhibit-film';
import type { SpatialSound } from './sound';

const BASE='/habitat/explorer/v1/';
const assetURL=(file:string)=>file.startsWith('/')?file:BASE+file;
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));

export function createExplorer(root: HTMLElement, host: HTMLElement, markers: HTMLElement, hooks: ExplorerHooks): ExplorerController {
  let disposed=false, accepted=false, paused=false, failed=false, frame=0, last=0, token=0;
  let manifest:SpatialManifest, floorMesh:NavMesh, navigation:Navigation, current:Room, targetRoom:Room|null=null;
  let phase:ExplorerPhase='preparing', reading=false, path:Point[]=[], autoRead=false, yaw=0, pitch=0;
  let loadingUntil=0, sampleAt=0, slowWindows=0, stepping=false;
  let finishProbe:((value:boolean)=>void)|null=null,dirty=true,soundVolume=.65;
  let viewportWidth=innerWidth, viewportHeight=innerHeight, sourceOpacity=host.style.opacity;

  let qualityStep=0;
  const solids=new CollisionWorld(), movingDoors=new CollisionWorld(), keys=new Set<string>();
  const doorRequests=new Set<SectionId>();
  let metricsAt=0, lightAt=0;
  const aborters=new Set<AbortController>(), listeners:(()=>void)[]=[], templates=new Map<string,THREE.Group>();
  const ownedModels=new Set<THREE.Group>();
  const models=new Map<SectionId,THREE.Group>(), loads=new Map<SectionId,Promise<void>>(), shells:THREE.Group[]=[];
  const roomBytes=new Map<SectionId,Promise<ArrayBuffer>>();
  const probes=new Map<SectionId,THREE.WebGLRenderTarget>();
  const buttons=new Map<SectionId,HTMLButtonElement>(), doors:{room:Room;group:THREE.Group;leaves:{object:THREE.Object3D;x:number;side:number}[];open:number}[]=[];
  const scene=new THREE.Scene();scene.background=new THREE.Color('#16232b');scene.fog=new THREE.FogExp2('#16232b',.0008);
  const camera=new THREE.PerspectiveCamera(58,viewportWidth/viewportHeight,.08,6000);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  // Architecture and lighting are static between room/door changes.
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  renderer.info.autoReset=false;
  renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
  const timer=new GPUTimer(renderer.getContext() as WebGL2RenderingContext), samples=new FrameWindow();
  const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
  const sun=new THREE.DirectionalLight('#fff1dd',2.4);sun.position.set(-45,72,32);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.near=.1;sun.shadow.camera.far=180;
  Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22});sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;
  scene.add(sun,sun.target,new THREE.HemisphereLight('#d7e7ef','#6b6355',1.5));
  const fill=new THREE.PointLight('#ffe1b3',90,22,2);scene.add(fill);
  const velocity=new THREE.Vector3(), desired=new THREE.Vector3(), forward=new THREE.Vector3(), scratch=new THREE.Vector3();
  const ground=new THREE.Plane(new THREE.Vector3(0,1,0),0), raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
  const cursor=new THREE.Mesh(new THREE.RingGeometry(.16,.19,40),new THREE.MeshBasicMaterial({color:'#dce9cb',side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));
  cursor.rotation.x=-Math.PI/2;cursor.visible=false;scene.add(cursor);
  const routePreview=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#d0ece7',transparent:true,opacity:.8,depthWrite:false}));
  routePreview.visible=false;scene.add(routePreview);
  let previewRoom:SectionId|null=null;
  function preview(id:SectionId|null){
    previewRoom=id;dirty=true;routePreview.visible=false;
    if(!id||!manifest||reading)return;
    const room=manifest.rooms.find(item=>item.id===id);if(!room)return;
    const target=navigation.nearest([room.reading[0],room.reading[2]],4);
    const points=target&&navigation.path([camera.position.x,camera.position.z],target);if(!points)return;
    routePreview.geometry.dispose();routePreview.geometry=new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,.035,z)));routePreview.visible=true;
  }
  let sound:SpatialSound|null=null,pendingSound:AudioContext|null=null,soundLoading=false;
  let film:ReturnType<typeof createExhibitFilm>|null=null;
  const soundAbort=new AbortController();

  function listen<T extends EventTarget>(target:T,name:string,fn:EventListener,options?:AddEventListenerOptions) {
    target.addEventListener(name,fn,options);listeners.push(()=>target.removeEventListener(name,fn,options));
  }
  function publish(next:ExplorerPhase) {
    phase=next;root.dataset.explorerPhase=next;
    if(current){root.dataset.explorerRoom=current.id;hooks.change(current.id,next);sound?.room(current.id,current.origin);}
  }
  function fatal(reason:'performance'|'asset'|'context'|'render') {
    if(disposed||failed)return;failed=true;cancelAnimationFrame(frame);frame=0;
    queueMicrotask(()=>{if(!disposed)hooks.failure(reason);});
  }
  listen(renderer.domElement,'webglcontextlost',event=>{event.preventDefault();fatal('context');finishProbe?.(false);});
  async function bytes(url:string) {
    const abort=new AbortController();aborters.add(abort);
    const timeout=window.setTimeout(()=>abort.abort(),15000);
    try {
      const response=await fetch(assetURL(url),{signal:abort.signal,credentials:'same-origin'});
      if(!response.ok)throw new Error('Spatial asset unavailable');
      return await response.arrayBuffer();
    } finally {clearTimeout(timeout);aborters.delete(abort);}
  }
  function configure(group:THREE.Group,preserveBake=false) {
    group.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      object.castShadow=true;object.receiveShadow=true;
      for(const material of (Array.isArray(object.material)?object.material:[object.material]) as THREE.MeshStandardMaterial[]) {
        if(material.userData.habitat_cutout){material.transparent=false;material.alphaTest=.45;material.depthWrite=true;}
        else if(material.transparent){material.depthWrite=false;object.castShadow=false;material.envMapIntensity=.3;}
        if(material.map)material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
        if(material.aoMap)material.aoMapIntensity=.65;
        if(material.userData.habitat_baked_indirect&&material.emissiveMap){
          const baked=material.emissiveMap;
          material.lightMap=material.userData.habitat_baked_full&&!preserveBake?null:baked;
          material.lightMapIntensity=Math.PI;material.emissiveMap=null;
          material.emissive.fromArray(material.userData.habitat_emissive);material.emissiveIntensity=1;
          // The old furniture's full-light bake belongs to a different building.
          // Keep its photographed PBR maps and AO; light it in this actual room.
          // Retain ownership of the unused atlas until disposal, avoiding leaks.
          if(material.userData.habitat_baked_full&&!preserveBake)material.userData.explorerUnusedBake=baked;
          if(material.userData.habitat_baked_full&&preserveBake){
            material.aoMapIntensity=0;
            material.onBeforeCompile=shader=>{
              const maps=THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );','');
              shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>','irradiance = vec3(0.0);\n'+maps).replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nreflectedLight.directDiffuse = vec3(0.0);');
            };
            material.customProgramCacheKey=()=> 'explorer-baked-city-1';
          }
        }
      }
    });
    return group;
  }
  async function model(url:string,preserveBake=false,cached?:Promise<ArrayBuffer>) {
    const data=await (cached??bytes(url));
    if(disposed)throw new Error('Disposed');
    const result=await loader.parseAsync(data,'');
    if(disposed){disposeGroup(result.scene);throw new Error('Disposed');}
    ownedModels.add(result.scene);return configure(result.scene,preserveBake);
  }
  function disposeGroup(group:THREE.Object3D) {
    ownedModels.delete(group as THREE.Group);
    const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>(), textures=new Set<THREE.Texture>();
    group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
    materials.forEach(material=>{for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);if(material.userData.explorerUnusedBake instanceof THREE.Texture)textures.add(material.userData.explorerUnusedBake);material.dispose();});
    geometries.forEach(geometry=>geometry.dispose());textures.forEach(texture=>{texture.dispose();if(texture.image instanceof ImageBitmap)texture.image.close();});
  }
  async function ensureRoom(room:Room) {
    if(models.has(room.id))return;
    const existing=loads.get(room.id);if(existing)return existing;
    const promise=model(room.model,false,roomBytes.get(room.id)).then(group=>{
      if(disposed){disposeGroup(group);return;}
      group.position.fromArray(room.origin);group.rotation.y=room.yaw;scene.add(group);models.set(room.id,group);solids.add(group);
      renderer.shadowMap.needsUpdate=true;
      if(room.id==='top')group.traverse(object=>{if(/^(Float_Core|Spin_Orbit)/.test(object.name))object.visible=false;});
      if(accepted){refreshNavigation();resize();}
      loadingUntil=performance.now()+2000;
    }).finally(()=>loads.delete(room.id));
    loads.set(room.id,promise);return promise;
  }
  function releaseDistant() {
    if(!current)return;
    let changed=false;
    for(const [id,group] of models) {
      const entrance=doors.find(door=>door.room.id===id);
      if(id===current.id||id===targetRoom?.id||entrance&&camera.position.distanceTo(new THREE.Vector3().fromArray(entrance.room.door))<8||id==='top'&&Math.hypot(camera.position.x,camera.position.z)<34)continue;
      changed=true;scene.remove(group);solids.remove(group);disposeGroup(group);models.delete(id);doorRequests.delete(id);
      renderer.shadowMap.needsUpdate=true;
      probes.get(id)?.dispose();probes.delete(id);
    }
    if(changed){refreshNavigation();resize();}
    // Neighbours are compressed CPU buffers, not decoded GPU textures. Upload
    // only the destination before its door opens; no empty room is exposed.
    void prefetchNeighbours(current.id);
  }
  function refreshNavigation(){
    navigation=new Navigation({...floorMesh,cells:floorMesh.cells.filter(([x,z])=>!solids.blocked(new THREE.Vector3(x*floorMesh.cellSize,1.65,z*floorMesh.cellSize)))});
  }
  async function prefetchNeighbours(id:SectionId) {
    const origin=manifest.rooms.find(room=>room.id===id);
    if(!origin)return;
    for(const adjacent of origin.neighbours.slice(0,2)){
      if(disposed||!accepted||current.id!==id)return;
      const room=manifest.rooms.find(item=>item.id===adjacent);
      if(room&&!models.has(room.id)&&!roomBytes.has(room.id)){
        const pending=bytes(room.model);roomBytes.set(room.id,pending);
        try{await pending;}catch{roomBytes.delete(room.id);}
      }
    }
    const keep=new Set([id,...origin.neighbours.slice(0,2)]);
    for(const cached of roomBytes.keys())if(!keep.has(cached))roomBytes.delete(cached);
  }
  function place(room:Room) {
    current=room;dirty=true;
    let available=navigation.nearest([room.reading[0],room.reading[2]],4);
    if(room.id!=='top'){
      const panel=new THREE.Vector3().fromArray(room.panel),normal=new THREE.Vector3(Math.sin(room.yaw),0,Math.cos(room.yaw));
      let best=Infinity;
      for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++){
        const point=new THREE.Vector3(room.reading[0]+x*.5,1.65,room.reading[2]+z*.5);
        const gap=point.distanceTo(panel),facing=point.clone().sub(panel).dot(normal);
        if(gap<4||gap>9||facing/gap<.85||!navigation.contains([point.x,point.z])||solids.blocked(point))continue;
        raycaster.set(point,panel.clone().sub(point).normalize());const hit=firstSolidHit();
        if(hit&&hit.distance<gap-.2)continue;
        const score=Math.hypot(x,z)*.25+Math.abs(gap-7)*2;
        if(score<best){best=score;available=[point.x,point.z];}
      }
    }
    if(!available)throw new Error('Reading position is not navigable');
    camera.position.set(available[0],1.65,available[1]);velocity.set(0,0,0);
    facePanel(true);positionLighting();
    if(accepted)hooks.visit(room.id);
  }
  function facePanel(immediate=false) {
    if(!current)return;
    scratch.fromArray(current.panel).sub(camera.position);
    const targetYaw=Math.atan2(-scratch.x,-scratch.z),targetPitch=Math.atan2(scratch.y,Math.hypot(scratch.x,scratch.z));
    if(immediate){yaw=targetYaw;pitch=targetPitch;}
    else{yaw+=wrap(targetYaw-yaw)*.1;pitch+=(targetPitch-pitch)*.1;}
  }
  function positionLighting() {
    sun.target.position.set(camera.position.x,0,camera.position.z);
    sun.position.set(camera.position.x-35,65,camera.position.z+25);
    fill.position.set(current.origin[0],4.4,current.origin[2]);
    renderer.shadowMap.needsUpdate=true;
  }
  function showPanel(_value:boolean) {
    reading=false;dirty=true;publish(paused?'paused':'idle');
  }
  function roomAt(point:THREE.Vector3) {
    for(const room of manifest.rooms.slice(1)){
      const x=point.x-room.origin[0],z=point.z-room.origin[2],c=Math.cos(room.yaw),s=Math.sin(room.yaw);
      if(Math.abs(x*c-z*s)<10.8&&Math.abs(x*s+z*c)<11.6)return room;
    }
    return Math.hypot(point.x,point.z)<14?manifest.rooms[0]:null;
  }
  async function goTo(id:SectionId) {
    if(disposed||!accepted)return;
    const room=manifest.rooms.find(item=>item.id===id);if(!room)return;
    stop();const request=++token;targetRoom=room;publish('entering');
    try {
      await ensureRoom(room);if(disposed||request!==token)return;
      host.style.transition='opacity 140ms ease';host.style.opacity='0';
      await new Promise(resolve=>setTimeout(resolve,140));
      if(disposed||request!==token)return;
      place(room);targetRoom=null;showPanel(false);releaseDistant();
    }catch{if(!disposed&&request===token)fatal('asset');}
    finally{if(!disposed)host.style.opacity='1';}
  }
  function stop() {keys.clear();token++;path=[];targetRoom=null;velocity.set(0,0,0);stepping=false;sound?.movement(0);publish(paused?'paused':'idle');if(accepted&&!disposed)releaseDistant();}
  function setPaused(value:boolean) {paused=value;dirty=true;root.dataset.explorerPaused=String(value);samples.reset();sampleAt=0;slowWindows=0;last=0;if(value)stop();else publish(reading?'reading':'idle');}
  function resize() {
    dirty=true;
    viewportWidth=innerWidth;viewportHeight=innerHeight;
    camera.aspect=viewportWidth/viewportHeight;camera.updateProjectionMatrix();
    const resident=estimateResidentBytes();
    const pixels=Math.min([3.6e6,2e6,1e6][qualityStep],Math.max(600000,(512*1024*1024-resident-64*1024*1024)/24));
    const dpr=Math.min(devicePixelRatio||1,2,Math.sqrt(pixels/(viewportWidth*viewportHeight)));
    renderer.setPixelRatio(dpr);renderer.setSize(viewportWidth,viewportHeight,false);
    host.dataset.gpuEstimatedMiB=((resident+64*1024*1024+viewportWidth*viewportHeight*dpr*dpr*24)/1024/1024).toFixed(1);
    host.dataset.quality=['full','balanced','light'][qualityStep];
    host.dataset.renderPixels=String(Math.round(viewportWidth*viewportHeight*dpr*dpr));
    loadingUntil=performance.now()+1500;samples.reset();sampleAt=0;
  }
  function reduceLoad(){
    if(qualityStep>=2)return false;
    qualityStep++;
    if(qualityStep===2){
      sun.shadow.mapSize.set(1024,1024);sun.shadow.map?.dispose();sun.shadow.map=null;
      renderer.shadowMap.needsUpdate=true;
    }
    resize();timer.clear();samples.reset();sampleAt=0;slowWindows=0;return true;
  }
  function estimateResidentBytes(){
    const textures=new Set<THREE.Texture>(),geometries=new Set<THREE.BufferGeometry>();
    const sources=new Set<string>(),buffers=new Set<THREE.BufferAttribute|THREE.InterleavedBuffer>();
    // A 4096 x 2731 photographic sky, mipmaps and decoded video frame budget.
    let bytes=0,textureBytes=4096*2731*4*4/3+1920*1080*4;
    for(const group of ownedModels)group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}});
    for(const texture of textures){
      const key=[texture.source.uuid,texture.colorSpace,texture.type,texture.minFilter,texture.magFilter,texture.wrapS,texture.wrapT].join(':');
      if(sources.has(key))continue;sources.add(key);
      const image=texture.image as {width?:number;height?:number}|undefined;textureBytes+=(image?.width??0)*(image?.height??0)*4*(texture.type===THREE.HalfFloatType?2:1)*4/3;
    }
    for(const geometry of geometries){for(const attribute of Object.values(geometry.attributes))buffers.add(attribute instanceof THREE.InterleavedBufferAttribute?attribute.data:attribute);if(geometry.index)buffers.add(geometry.index);}
    for(const buffer of buffers)bytes+=buffer.array.byteLength;
    host.dataset.geometryMiB=(bytes/1024/1024).toFixed(1);host.dataset.textureMiB=(textureBytes/1024/1024).toFixed(1);
    return bytes+textureBytes;
  }
  function cast(event:PointerEvent) { pointer.set(event.clientX/viewportWidth*2-1,1-event.clientY/viewportHeight*2);raycaster.setFromCamera(pointer,camera); }
  function firstSolidHit() {
    return raycaster.intersectObjects([templates.get('architecture')!,templates.get('exhibits')!,...shells,...models.values()].filter(Boolean),true)[0];
  }
  const pointAt=(event:PointerEvent)=>{
    cast(event);const point=raycaster.ray.intersectPlane(ground,new THREE.Vector3());if(!point)return null;
    const hit=firstSolidHit();
    // Transparency is optical, never permission to click through glass.
    if(hit&&hit.distance<camera.position.distanceTo(point)-.08)return null;
    return point;
  };
  async function toggleDoor(door:typeof doors[number]) {
    if(camera.position.distanceTo(new THREE.Vector3().fromArray(door.room.door))>5.5)return;
    stop();
    if(doorRequests.has(door.room.id)){doorRequests.delete(door.room.id);return;}
    doorRequests.add(door.room.id);publish('entering');
    try{await ensureRoom(door.room);if(!disposed){publish('idle');dirty=true;}}
    catch{if(!disposed)fatal('asset');}
  }
  let down:{x:number;y:number;yaw:number;pitch:number;pointer:number;drag:boolean}|null=null;
  function onDown(event:PointerEvent) {
    if(event.button!==0||!accepted||paused||root.dataset.explorerModal==='true')return;
    down={x:event.clientX,y:event.clientY,yaw,pitch,pointer:event.pointerId,drag:false};
    renderer.domElement.setPointerCapture(event.pointerId);
  }
  function onMove(event:PointerEvent) {
    if(!accepted)return;
    dirty=true;
    if(down){
      const dx=event.clientX-down.x,dy=event.clientY-down.y;
      if(Math.hypot(dx,dy)>6)down.drag=true;
      if(down.drag&&!paused){
        if(reading)showPanel(false);
        yaw=down.yaw-dx*.0035;pitch=THREE.MathUtils.clamp(down.pitch-dy*.003,-.65,.65);cursor.visible=false;
      }
      return;
    }
    const point=pointAt(event);cursor.visible=Boolean(point&&navigation.contains([point.x,point.z]));
    if(point&&cursor.visible)cursor.position.set(point.x,.025,point.z);
    renderer.domElement.style.cursor=cursor.visible?'pointer':'grab';
  }
  function onUp(event:PointerEvent) {
    if(!down||event.pointerId!==down.pointer)return;
    const dragged=down.drag;down=null;
    if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
    if(dragged)return;
    cast(event);const hit=firstSolidHit();
    if(hit){const door=doors.find(item=>item.leaves.some(leaf=>leaf.object===hit.object||leaf.object.children.includes(hit.object)));
      if(door){void toggleDoor(door);return;}}
    const point=pointAt(event);if(!point||!navigation.contains([point.x,point.z]))return;
    const destination:Point=[point.x,point.z],room=roomAt(point);
    const request=++token;
    targetRoom=room;
    const move=()=>{
      if(disposed||request!==token)return;
      const route=navigation.path([camera.position.x,camera.position.z],destination);if(!route)return;
      showPanel(false);targetRoom=room;autoRead=false;
      if(paused)return;
      path=route;stepping=route.length>0;publish('walking');sound?.cue('select');
    };
    if(room&&!models.has(room.id))void ensureRoom(room).then(move).catch(()=>{if(request===token)fatal('asset');});else move();
  }
  function step(dt:number,time:number) {
    if(paused)return;
    const modal=root.dataset.explorerModal==='true';
    if(modal){keys.clear();path=[];velocity.set(0,0,0);}
    for(const door of doors){
      const gap=camera.position.distanceTo(scratch.fromArray(door.room.door));
      // An occupied threshold stays open so closing cannot trap or crush the body.
      const wanted=models.has(door.room.id)&&(doorRequests.has(door.room.id)||gap<1.5&&door.open>.8);
      const old=door.open;door.open=THREE.MathUtils.damp(door.open,wanted?1:0,4,dt);
      if(Math.abs(old-door.open)>.001){
        renderer.shadowMap.needsUpdate=true;
        for(const leaf of door.leaves){leaf.object.position.x=leaf.x+leaf.side*1.43*door.open;movingDoors.updateDoor(leaf.object);}
        dirty=true;
      }
      if(old<.05&&door.open>=.05)sound?.cue('door',door.room.door);
    }
    const manual=keys.size>0&&!modal;
    const previous=camera.position.clone();
    if(manual){
      path=[];targetRoom=null;
      const right=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      const ahead=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
      desired.set(right*Math.cos(yaw)-ahead*Math.sin(yaw),0,-right*Math.sin(yaw)-ahead*Math.cos(yaw));
      if(desired.lengthSq()>0)desired.normalize();
      velocity.lerp(desired.multiplyScalar(2.4),1-Math.exp(-dt*12));
    }else if(path.length&&!modal){
      let destination=path[0];let gap=Math.hypot(destination[0]-camera.position.x,destination[1]-camera.position.z);
      if(gap<.15){path.shift();destination=path[0];if(destination)gap=Math.hypot(destination[0]-camera.position.x,destination[1]-camera.position.z);}
      if(destination){desired.set(destination[0]-camera.position.x,0,destination[1]-camera.position.z).normalize();velocity.lerp(desired.multiplyScalar(Math.min(2.2,path.length===1?gap*3:2.2)),1-Math.exp(-dt*10));}
      else velocity.set(0,0,0);
    }else velocity.set(0,0,0);
    if(velocity.lengthSq()>.00001){
      // The geometric body is authoritative; A* only proposes destinations.
      const displacement=velocity.clone().multiplyScalar(dt);
      const floor=(x:number,z:number)=>navigation.contains([x,z]);
      solids.move(camera.position,displacement,(x,z)=>floor(x,z)&&!movingDoors.blocked(new THREE.Vector3(x,1.65,z)));
      if(!manual&&path.length&&camera.position.distanceToSquared(previous)<.000001){path=[];targetRoom=null;velocity.set(0,0,0);}
    }
    const moving=camera.position.distanceToSquared(previous)>.000001;
    if(moving){
      dirty=true;
      const occupied=roomAt(camera.position);
      if(occupied&&occupied.id!==current.id){current=occupied;positionLighting();hooks.visit(current.id);void prefetchNeighbours(current.id);}
      if(time-lightAt>1000&&camera.position.distanceTo(sun.target.position)>7){positionLighting();lightAt=time;}
    }
    if(phase!=='entering'&&(moving?'walking':'idle')!==phase)publish(moving?'walking':'idle');
    stepping=moving;
    for(const [id,group] of models){
      const door=doors.find(item=>item.room.id===id);
      const visible=id===current.id||id==='top'&&Math.hypot(camera.position.x,camera.position.z)<34||Boolean(door&&door.open>.01);
      if(group.visible!==visible)renderer.shadowMap.needsUpdate=true;group.visible=visible;
    }
    if(time-metricsAt>1500){releaseDistant();metricsAt=time;}
    sound?.movement(moving?velocity.length()/2.4:0);
  }
  function visiblePoint(point:THREE.Vector3){
    const direction=point.clone().sub(camera.position),distance=direction.length();raycaster.set(camera.position,direction.normalize());
    const hit=firstSolidHit();return !hit||hit.distance>=distance-.2;
  }
  function project(){
    for(const room of manifest.rooms){
      const button=buttons.get(room.id)!;
      if(room.id==='top'){button.style.visibility='hidden';continue;}
      const point=new THREE.Vector3().fromArray(room.door);point.y=2.2;
      const gap=camera.position.distanceTo(point);
      if(gap>6||!visiblePoint(point)){button.style.visibility='hidden';continue;}
      button.textContent=(doorRequests.has(room.id)?'閉じる — ':'開く — ')+room.label;
      projectHTML(button,camera,point,room.yaw,2.5,520,76,viewportWidth,viewportHeight);
    }
    for(const element of root.querySelectorAll<HTMLElement>('[data-room-exhibit]')){
      const room=manifest.rooms.find(item=>item.id===element.dataset.roomExhibit)!;
      // A focused link stays fixed and actionable until focus leaves it.
      if(element.contains(document.activeElement)){keys.clear();path=[];velocity.set(0,0,0);continue;}
      const local=new THREE.Vector3(4.8,2.05,-1),point=local.applyAxisAngle(THREE.Object3D.DEFAULT_UP,room.yaw).add(new THREE.Vector3().fromArray(room.origin));
      const show=current.id===room.id&&camera.position.distanceTo(point)<12&&visiblePoint(point);
      element.dataset.visible=String(show);element.inert=!show;
      if(!show){element.style.visibility='hidden';continue;}
      projectHTML(element,camera,point,room.yaw,3.2,560,element.offsetHeight,viewportWidth,viewportHeight);
    }
  }
  function paint(time:number) {
    const dt=Math.min(.06,(time-last)/1000||1/60);last=time;
    if(accepted)step(dt,time);
    film?.update(accepted&&current.id==='technology',!paused&&root.dataset.explorerModal!=='true');
    if(film)host.dataset.filmTime=film.time().toFixed(2);
    camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateMatrixWorld();
    if(accepted)project();
    renderer.info.reset();timer.begin();renderer.render(scene,camera);timer.end();timer.poll();
    host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.triangles=String(renderer.info.render.triangles);
    host.dataset.room=current.id;host.dataset.position=camera.position.toArray().map(n=>n.toFixed(2)).join(',');
    if(accepted&&!paused&&time>loadingUntil){
      if(!sampleAt){sampleAt=time;samples.reset();}
      samples.add(time);
      if(time-sampleAt>=3000){
        const result=samples.result(timer.value());hooks.metrics(result);
        slowWindows=samples.averageFPS()<27?slowWindows+1:0;samples.reset();sampleAt=0;
        if(slowWindows>=2&&!reduceLoad())fatal('performance');
      }
    }
    sound?.listener(camera.position,camera.getWorldDirection(forward));
  }
  function draw(time:number) {
    frame=0;if(disposed||failed||document.hidden)return;
    try{if((!paused||dirty)&&time-last>=1000/60-.8){paint(time);dirty=false;}}catch{fatal('render');return;}
    frame=requestAnimationFrame(draw);
  }
  async function start(id:SectionId,snapshot?:ExplorerSnapshot) {
    try{
      manifest=JSON.parse(new TextDecoder().decode(await bytes('manifest.json')));
      floorMesh=JSON.parse(new TextDecoder().decode(await bytes(manifest.nav)));navigation=new Navigation(floorMesh);
      current=manifest.rooms.find(room=>room.id===id)??manifest.rooms[0];
      const [architecture,shell,hdrBytes]=await Promise.all([model(manifest.architecture),model(manifest.rooms[1].shell),bytes(manifest.lighting),ensureRoom(current)]);
      if(disposed)return false;
      scene.add(architecture);solids.add(architecture);templates.set('architecture',architecture);templates.set('shell',shell);
      const hdr=new HDRLoader().parse(hdrBytes);
      const hdrTexture=new THREE.DataTexture(hdr.data,hdr.width,hdr.height,THREE.RGBAFormat,THREE.HalfFloatType);
      hdrTexture.mapping=THREE.EquirectangularReflectionMapping;hdrTexture.needsUpdate=true;
      const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(hdrTexture);scene.environment=target.texture;
      listeners.push(()=>{target.dispose();});hdrTexture.dispose();pmrem.dispose();
      const exterior=await addExterior(scene,bytes);
      if(disposed){exterior.dispose();return false;}listeners.push(exterior.dispose);
      film=createExhibitFilm(scene,manifest.rooms.find(room=>room.id==='technology')!,exterior.texture);
      const signs=await model(manifest.signs);scene.add(signs);templates.set('signs',signs);
      const exhibits=await model(manifest.exhibits);scene.add(exhibits);solids.add(exhibits);templates.set('exhibits',exhibits);
      exhibits.traverse(object=>{if(object.userData.explorer_hero_type)object.castShadow=false;});
      signs.traverse(object=>{if(object instanceof THREE.Mesh)object.castShadow=false;});
      for(const room of manifest.rooms){
        const button=document.createElement('button');button.type='button';button.textContent=room.label;
        button.setAttribute('aria-label',room.label+'の扉を開閉');button.addEventListener('click',()=>{const door=doors.find(item=>item.room.id===room.id);if(door)void toggleDoor(door);});markers.append(button);buttons.set(room.id,button);
        button.dataset.roomLabel=room.id;
        if(room.id==='top')continue;
        const group=shell.clone(true);group.position.fromArray(room.origin);group.rotation.y=room.yaw;scene.add(group);shells.push(group);solids.add(group);
        const leaves:{object:THREE.Object3D;x:number;side:number}[]=[];
        group.traverse(object=>{if(object.userData.explorer_door)leaves.push({object,x:object.position.x,side:object.userData.side});});
        doors.push({room,group,leaves,open:0});for(const leaf of leaves)movingDoors.add(leaf.object,true);
      }
      refreshNavigation();
      place(current);
      if(snapshot&&Array.isArray(snapshot.position)&&snapshot.position.every(Number.isFinite)&&Number.isFinite(snapshot.yaw)&&Number.isFinite(snapshot.pitch)
        &&navigation.contains([snapshot.position[0],snapshot.position[2]])&&!solids.blocked(new THREE.Vector3().fromArray(snapshot.position))){
        camera.position.fromArray(snapshot.position);camera.position.y=1.65;yaw=snapshot.yaw;pitch=THREE.MathUtils.clamp(snapshot.pitch,-.65,.65);
      }
      resize();camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateMatrixWorld();
      await renderer.compileAsync(scene,camera);
      if(disposed)return false;
      // Probe is the real composed scene, never a synthetic GPU-name allowlist.
      // The existing static poster and HTML remain visible until it passes.
      const probe=new FrameWindow();let began=0,warm=0,probeLast=0;
      const probeScene=()=>new Promise<boolean>(resolve=>{
        finishProbe=resolve;
        const sample=(time:number)=>{
          if(disposed||failed){resolve(false);return;}
          if(document.hidden){
            probe.reset();timer.clear();began=0;warm=0;probeLast=0;
            frame=requestAnimationFrame(sample);return;
          }
          if(!warm)warm=time;
          if(time-probeLast>=1000/60-.8){
            probeLast=time;
            try{paint(time);}catch{resolve(false);return;}
            if(time-warm>800){if(!began)began=time;probe.add(time);}
          }
          if(began&&time-began>=3000){const metrics=probe.result(timer.value());hooks.metrics(metrics);resolve(passesEntry(metrics));return;}
          frame=requestAnimationFrame(sample);
        };frame=requestAnimationFrame(sample);
      });
      let pass=await probeScene();
      while(!pass&&!disposed&&!failed&&!document.hidden&&reduceLoad()){
        probe.reset();began=0;warm=0;probeLast=0;pass=await probeScene();
      }
      finishProbe=null;
      if(!pass||disposed)return false;
      accepted=true;last=0;loadingUntil=performance.now()+2500;
      // Arrival and exploration are not reading. Open the source article only
      // on an explicit read action (or restore an already-open visit).
      hooks.ready();showPanel(snapshot?.reading ?? false);
      listen(renderer.domElement,'pointerdown',onDown as EventListener);
      listen(renderer.domElement,'pointermove',onMove as EventListener);
      listen(renderer.domElement,'pointerup',onUp as EventListener);
      listen(renderer.domElement,'pointercancel',()=>{down=null;});
      listen(renderer.domElement,'lostpointercapture',()=>{down=null;});
      listen(root,'click',event=>{if(event.target instanceof Element&&event.target.closest('button,a,summary'))sound?.cue('select');});
      listen(window,'resize',resize);
      const blockedInput=(event:KeyboardEvent)=>event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||root.dataset.explorerModal==='true'||Boolean((event.target as Element)?.closest?.('input,textarea,select,a,button,summary,[contenteditable="true"]'));
      listen(window,'keydown',event=>{
        const key=event as KeyboardEvent;
        if(key.key==='Escape'){stop();return;}
        if(blockedInput(key)||paused)return;
        if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(key.code)){
          key.preventDefault();if(!keys.size){path=[];targetRoom=null;token++;if(phase==='entering')publish('idle');}keys.add(key.code);dirty=true;
        }
        if(key.code==='KeyE'&&!key.repeat){
          const near=doors.filter(door=>camera.position.distanceTo(new THREE.Vector3().fromArray(door.room.door))<5.5).sort((a,b)=>camera.position.distanceTo(new THREE.Vector3().fromArray(a.room.door))-camera.position.distanceTo(new THREE.Vector3().fromArray(b.room.door)))[0];
          if(near){key.preventDefault();void toggleDoor(near);}
        }
      });
      listen(window,'keyup',event=>{keys.delete((event as KeyboardEvent).code);if(!keys.size)velocity.set(0,0,0);});
      listen(window,'blur',()=>{stop();down=null;});
      listen(document,'visibilitychange',()=>{
        samples.reset();sampleAt=0;slowWindows=0;down=null;keys.clear();velocity.set(0,0,0);path=[];
        if(document.hidden){cancelAnimationFrame(frame);frame=0;film?.update(false,false);void sound?.suspend();}
        else{loadingUntil=performance.now()+2000;last=0;if(!frame)frame=requestAnimationFrame(draw);void sound?.resume();}
      });
      host.tabIndex=-1;frame=requestAnimationFrame(draw);void prefetchNeighbours(current.id);return true;
    }catch{if(!disposed)fatal('asset');return false;}
  }
  async function setSound(enabled:boolean) {
    if(disposed||soundLoading)return false;
    if(!enabled){await sound?.setEnabled(false);return false;}
    soundLoading=true;
    try{
      if(!sound){const context=new AudioContext();pendingSound=context;await context.resume();const {createSpatialSound}=await import('./sound');
        if(disposed){void context.close();return false;}sound=await createSpatialSound(context,soundAbort.signal);pendingSound=null;}
      if(disposed){sound.dispose();return false;}sound.setVolume(soundVolume);sound.room(current.id,current.origin);return await sound.setEnabled(true);
    }catch{void pendingSound?.close();pendingSound=null;return false;}finally{soundLoading=false;}
  }
  function snapshot():ExplorerSnapshot {return {room:current?.id??'top',position:camera.position.toArray() as [number,number,number],yaw,pitch,reading};}
  function dispose(){
    if(disposed)return;disposed=true;token++;cancelAnimationFrame(frame);frame=0;finishProbe?.(false);finishProbe=null;aborters.forEach(abort=>abort.abort());listeners.forEach(remove=>remove());
    solids.clear();movingDoors.clear();keys.clear();soundAbort.abort();sound?.dispose();film?.dispose();void pendingSound?.close();timer.dispose();[...ownedModels].forEach(disposeGroup);models.clear();templates.clear();roomBytes.clear();probes.forEach(target=>target.dispose());probes.clear();
    cursor.geometry.dispose();cursor.material.dispose();routePreview.geometry.dispose();routePreview.material.dispose();sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();
    renderer.domElement.remove();markers.replaceChildren();host.style.opacity=sourceOpacity;
  }
  const setVolume=(value:number)=>{soundVolume=Math.max(0,Math.min(1,value));sound?.setVolume(soundVolume);};
  return {start,goTo,stop,setPaused,setSound,setVolume,snapshot,dispose};
}

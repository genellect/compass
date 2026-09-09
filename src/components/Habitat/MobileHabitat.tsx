'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DESKTOP_QUERY, sectionIds, type SectionId } from './scene-config';
import media from '../../../public/habitat/mobile-v1/manifest.json';
import styles from './mobile-habitat.module.css';

const pauseKey = 'compass-mobile-film-paused';
type Host = { id: SectionId; element: HTMLElement };
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
type Variant = { src:string; width:number };
type MobileAsset = { id:string; poster:string; tablet:string; end:string|null; video:string|null; source?:string;
  posters?:Variant[]; tablets?:Variant[]; ends?:Variant[] };
const assets: MobileAsset[] = media.sections;

export function MobileHabitat() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [active, setActive] = useState<SectionId | null>(null);
  const [paused, setPaused] = useState(false);
  const [restricted, setRestricted] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const visited = useRef(new Set<SectionId>());

  useEffect(() => {
    const desktop = matchMedia(DESKTOP_QUERY);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const root = document.querySelector<HTMLElement>('[data-mobile-habitat]');
    if (!root) return;
    let observer: IntersectionObserver | null = null;
    const ratios = new Map<SectionId, number>();
    const sync = () => {
      observer?.disconnect(); ratios.clear(); setActive(null);
      setRestricted(reduced.matches || !!connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? ''));
      if (desktop.matches) { setHosts([]); return; }
      const found = sectionIds.flatMap(id => {
        const element = root.querySelector<HTMLElement>('#' + id);
        return element ? [{ id, element }] : [];
      });
      setHosts(found);
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => ratios.set(entry.target.id as SectionId, entry.intersectionRatio));
        const current = [...ratios].filter(([,ratio]) => ratio > 0).sort((a,b) => b[1]-a[1])[0];
        setActive(current?.[0] ?? null);
      }, { threshold: [0,.05,.15,.3,.5,.75,1] });
      found.forEach(({ element }) => observer!.observe(element));
    };
    const visibility = () => setBlocked(document.hidden || !!document.querySelector('.mobile-menu.is-open'));
    const menu = document.querySelector('#mobile-menu');
    const menuObserver = new MutationObserver(visibility);
    if (menu) menuObserver.observe(menu, { attributes:true, attributeFilter:['class','hidden'] });
    try { setPaused(sessionStorage.getItem(pauseKey) === 'true'); } catch { /* optional storage */ }
    sync(); visibility();
    desktop.addEventListener('change',sync); reduced.addEventListener('change',sync);
    connection?.addEventListener('change',sync);
    document.addEventListener('visibilitychange',visibility);
    return () => {
      observer?.disconnect(); menuObserver.disconnect();
      desktop.removeEventListener('change',sync); reduced.removeEventListener('change',sync);
      connection?.removeEventListener('change',sync);
      document.removeEventListener('visibilitychange',visibility);
    };
  }, []);

  const toggle = () => setPaused(value => {
    try { sessionStorage.setItem(pauseKey,String(!value)); } catch { /* optional storage */ }
    return !value;
  });
  return hosts.map(({id,element}) => createPortal(
    <MobileScene key={id} id={id} active={active===id && !blocked} paused={paused}
      restricted={restricted} visited={visited.current} toggle={toggle}/>, element, id));
}

function MobileScene({id,active,paused,restricted,visited,toggle}:{
  id:SectionId;active:boolean;paused:boolean;restricted:boolean;visited:Set<SectionId>;toggle:()=>void;
}) {
  const scene = assets.find(item => item.id === id)!;
  const node = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(id==='top');
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ended, setEnded] = useState(visited.has(id));
  const src = scene.video;
  useEffect(()=>{
    if(id!=='top')return;
    const host=node.current,parent=host?.parentElement,title=parent?.querySelector('h1');
    if(!host || !parent || !title)return;
    const position=()=>host.style.setProperty('--mobile-controls-top',`${title.getBoundingClientRect().bottom-parent.getBoundingClientRect().top+16}px`);
    const observer=new ResizeObserver(position);observer.observe(title);observer.observe(parent);position();
    return()=>observer.disconnect();
  },[id]);
  useEffect(() => {
    const host=node.current;
    if (!host) return;
    const observer=new IntersectionObserver(entries => {
      if(entries.some(entry=>entry.isIntersecting)){setNear(true);observer.disconnect();}
    },{rootMargin:'450px'});
    const visibility=new IntersectionObserver(entries=>setInView(entries.some(entry=>entry.isIntersecting)),{threshold:0});
    observer.observe(host);visibility.observe(host);
    return()=>{observer.disconnect();visibility.disconnect();};
  },[]);

  useEffect(() => {
    const player=video.current;
    if (!player || !src || !near || restricted || failed || ended) return;
    const size=innerWidth*devicePixelRatio>720?'1080':'720';
    player.src=src.replace('{size}',size);
    return()=>{player.pause();player.removeAttribute('src');player.load();};
  },[src,near,restricted,failed,ended]);

  useEffect(() => {
    const player=video.current;
    if (!player || !player.getAttribute('src')) return;
    if (!active || !inView || paused || restricted || failed || ended) {player.pause();return;}
    let alive=true, last=player.currentTime, progressed=performance.now();
    const fail=()=>{if(alive){player.pause();setReady(false);setFailed(true);}};
    void player.play().catch(fail);
    const watch=setInterval(()=>{
      if(player.currentTime>last){last=player.currentTime;progressed=performance.now();}
      else if(performance.now()-progressed>=3000)fail();
    },500);
    return()=>{alive=false;clearInterval(watch);player.pause();};
  },[active,inView,paused,restricted,failed,ended,near,src]);

  const posterVariants=ended && scene.end ? scene.ends : scene.posters;
  const srcSet=(variants?:Variant[])=>variants?.map(item=>`${item.src} ${item.width}w`).join(', ');
  return <div ref={node} className={styles.scene} data-mobile-scene={id}
    data-film-state={ended?'ended':failed?'failed':restricted||!src?'static':paused?'paused':ready&&active&&inView?'playing':'poster'}>
    <div className={styles.media} aria-hidden="true">
    {near && <picture>
      {!ended && (!src || restricted) && <source media="(min-width: 600px) and (orientation: portrait)"
        srcSet={srcSet(scene.tablets) ?? scene.tablet} sizes="100vw"/>}
      <img src={ended && scene.end ? scene.end : scene.poster} alt="" width={1080} height={1920}
        srcSet={srcSet(posterVariants)} sizes="100vw"
        fetchPriority={id==='top'?'high':'auto'} decoding="async"/>
    </picture>}
    {src && !restricted && !failed && !ended && <video ref={video} muted playsInline preload="none" aria-hidden="true"
      className={ready?styles.playing:undefined} onPlaying={()=>setReady(true)}
      onError={()=>{setReady(false);setFailed(true);}}
      onEnded={()=>{visited.add(id);setEnded(true);setReady(false);}}/>}
    <div className={styles.veil} aria-hidden="true"/>
    </div>
    {scene.source && <a className={styles.credit} href={scene.source} target="_blank" rel="noopener noreferrer"
      aria-label="宇宙の実写映像・写真の出典：NASA（新しいタブで開く）">NASA / ISS ↗</a>}
    {src && !restricted && !failed && !ended && <button type="button" className={styles.control}
      aria-pressed={paused} onClick={toggle}>{paused?'映像を再生':'映像を停止'}</button>}
  </div>;
}

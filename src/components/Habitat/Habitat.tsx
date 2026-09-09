'use client';

import { useEffect, useRef, useState } from 'react';
import { ASSET_BASE, DESKTOP_QUERY, locateTour, sectionIds, chapters, chapterIndex, type SceneState } from './scene-config';
import type { SceneController } from './scene-engine';
import type { Soundscape } from './soundscape';
import styles from './habitat.module.css';

const storageKey = 'compass-habitat-paused';
export function Habitat() {
  const mount = useRef<HTMLDivElement>(null);
  const poster = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [state, setState] = useState<SceneState>('loading');
  const controller = useRef<SceneController | null>(null);
  const pausedRef = useRef(false);
  const sound = useRef<Soundscape | null>(null);
  const soundEnabled = useRef(false);
  const soundLoading = useRef(false);
  const alive = useRef(true);
  const [audible,setAudible] = useState(false);
  const [chapter,setChapter] = useState(0);
  const activeChapter = useRef(0);

  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sound.current?.dispose();sound.current=null;};},[]);
  const toggleSound = async () => {
    if(soundLoading.current)return;
    soundLoading.current=true;
    try {
      if(!sound.current){const {createSoundscape}=await import('./soundscape');if(!alive.current||!matchMedia(DESKTOP_QUERY).matches)return;sound.current=createSoundscape();}
      soundEnabled.current=!soundEnabled.current;setAudible(soundEnabled.current);
      sound.current.setEnabled(soundEnabled.current);sound.current.cue(activeChapter.current);
    } catch {soundEnabled.current=false;setAudible(false);} finally {soundLoading.current=false;}
  };

  useEffect(() => {
    const host = mount.current;
    const root = host?.closest<HTMLElement>('[data-habitat]');
    if (!host || !root) return;
    const desktop = matchMedia(DESKTOP_QUERY);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false, generation = 0, starts: number[] = [], ends: number[] = [], frame = 0;
    let currentPoster = '', active = false, lastScroll = window.scrollY;
    let userInteracted = false;
    const initialHash = location.hash.slice(1);
    const noteInteraction = () => { userInteracted = true; };
    const pictures = new Map<string, HTMLImageElement>();
    try { pausedRef.current = sessionStorage.getItem(storageKey) === 'true'; } catch { /* storage optional */ }
    setPaused(pausedRef.current);
    const setSceneState = (value: SceneState) => {
      if (disposed) return;
      if (root.dataset.sceneState === value) return;
      root.dataset.sceneState = value;
      setState(value);
    };
    const measure = () => {
      ends = [];
      starts = sectionIds.map(id => {
        const section = root.querySelector<HTMLElement>('#' + id);
        const box = section?.getBoundingClientRect();
        ends.push(box ? box.bottom + window.scrollY : 0);
        return box ? box.top + window.scrollY : 0;
      });
    };
    const update = () => {
      frame = 0;
      if (!active || disposed) return;
      const position = locateTour(window.scrollY, innerHeight, starts, ends);
      const index = position.blend > .5 ? position.next : position.index;
      const id = sectionIds[index];
      root.dataset.sceneSection = id;
      const nextChapter=chapterIndex(index);
      if(activeChapter.current!==nextChapter){activeChapter.current=nextChapter;setChapter(nextChapter);sound.current?.cue(nextChapter);}
      root.style.setProperty('--tour-progress',String((position.index+position.local)/(sectionIds.length)));
      root.style.setProperty('--travel-reveal',String(motion.matches || pausedRef.current ? 0 : Math.sin(Math.PI * position.blend)));
      if (id !== currentPoster) {
        currentPoster = id;
        const url = ASSET_BASE + id + '.webp';
        let picture = pictures.get(url);
        if (!picture) { picture = new Image(); picture.src = url; pictures.set(url, picture); }
        const show = () => { if (!disposed && active && currentPoster === id && poster.current) poster.current.style.backgroundImage = `url("${url}")`; };
        if (picture.complete && picture.naturalWidth) show(); else picture.onload = show;
      }
      const jump = Math.abs(window.scrollY - lastScroll) > innerHeight;
      lastScroll = window.scrollY;
      controller.current?.update(position, jump);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const remeasure = () => { measure(); schedule(); };
    const stop = () => { generation++; controller.current?.dispose(); controller.current = null; host.replaceChildren(); };
    const sync = () => {
      stop();
      active = desktop.matches;
      root.dataset.enabled = String(active);
      setEnabled(active); setReduced(motion.matches);
      window.dispatchEvent(new Event('compass:habitat-change'));
      if (!active) {
        sound.current?.dispose();sound.current=null;soundEnabled.current=false;setAudible(false);
        currentPoster = ''; if (poster.current) poster.current.style.backgroundImage = '';
        return;
      }
      measure(); update();
      if (motion.matches || pausedRef.current) { setSceneState('static'); return; }
      setSceneState('loading');
      const token = generation;
      void import('./scene-engine').then(async ({ createScene }) => {
        if (disposed || token !== generation) return;
        const instance = createScene(host, (value) => {
          if (token !== generation) return;
          setSceneState(value);
          if (value === 'failed' || value === 'static') queueMicrotask(() => {
            if (disposed || token !== generation) return;
            controller.current?.dispose(); controller.current = null;
          });
        });
        controller.current = instance;
        update();
        await instance.start();
      }).catch(() => { if (!disposed && token === generation) { controller.current?.dispose(); controller.current = null; setSceneState('failed'); } });
    };
    const toggle = () => {
      if (motion.matches) return;
      if (!controller.current && !pausedRef.current && ['failed','static'].includes(root.dataset.sceneState ?? '')) { sync(); return; }
      pausedRef.current = !pausedRef.current;
      setPaused(pausedRef.current);
      try { sessionStorage.setItem(storageKey, String(pausedRef.current)); } catch { /* storage optional */ }
      if (controller.current) {
        controller.current.setPaused(pausedRef.current); update();
      } else sync();
    };
    const observer = new ResizeObserver(remeasure);
    observer.observe(root);
    for (const id of sectionIds) { const element = root.querySelector('#' + id); if (element) observer.observe(element); }
    desktop.addEventListener('change', sync); motion.addEventListener('change', sync);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure);
    window.addEventListener('pageshow', remeasure);
    window.addEventListener('hashchange', remeasure);
    root.addEventListener('compass:habitat-toggle', toggle);
    window.addEventListener('wheel', noteInteraction, { passive: true });
    window.addEventListener('pointerdown', noteInteraction, { passive: true });
    window.addEventListener('keydown', noteInteraction);
    // Native fragment scrolling can precede hydration and the Desktop layout. Correct it once,
    // after layout/font readiness, without overriding a user's subsequent navigation.
    void document.fonts.ready.then(() => requestAnimationFrame(() => {
      if (disposed) return;
      measure();
      if (active && initialHash && !userInteracted && location.hash.slice(1) === initialHash) {
        root.querySelector<HTMLElement>('#' + CSS.escape(initialHash))?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
      schedule();
    }));
    sync();
    return () => {
      disposed = true; active = false; stop(); observer.disconnect(); cancelAnimationFrame(frame);
      desktop.removeEventListener('change', sync); motion.removeEventListener('change', sync);
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', remeasure);
      window.removeEventListener('pageshow', remeasure); window.removeEventListener('hashchange', remeasure);
      window.removeEventListener('wheel', noteInteraction); window.removeEventListener('pointerdown', noteInteraction); window.removeEventListener('keydown', noteInteraction);
      root.removeEventListener('compass:habitat-toggle', toggle);
      for (const picture of pictures.values()) picture.onload = null;
      delete root.dataset.enabled; delete root.dataset.sceneState; delete root.dataset.sceneSection;
      root.style.removeProperty('--tour-progress');
      root.style.removeProperty('--travel-reveal');
      window.dispatchEvent(new Event('compass:habitat-change'));
    };
  }, []);

  return <>
    <div className={styles.backdrop} aria-hidden="true" data-habitat-backdrop>
      <div ref={poster} className={styles.poster} />
      <div ref={mount} className={styles.canvas} />
      <div className={styles.shade} />
    </div>
    {enabled && <div className={styles.tourControls}>
      <nav className={styles.chapterNav} aria-label="このページの案内">
        {chapters.map((item,index)=><a key={item.id} href={'#'+item.id} aria-label={item.label} aria-current={index===chapter?'step':undefined} title={item.label}>
          <span aria-hidden="true">{String(index+1).padStart(2,'0')}</span><span>{item.label}</span>
        </a>)}
      </nav>
      <div className={styles.mediaControls} data-habitat-media>
      <button type="button" className={styles.sound} aria-pressed={audible} onClick={()=>void toggleSound()}>
        <span className={styles.soundBars} data-audible={audible} aria-hidden="true"><i/><i/><i/></span>
        {audible?'音を切る':'音を入れる'}
      </button>
      {!reduced && <button type="button" className={styles.motion} aria-pressed={paused}
      onClick={() => mount.current?.closest('[data-habitat]')?.dispatchEvent(new Event('compass:habitat-toggle'))}>
      <span aria-hidden="true">{paused || state === 'static' || state === 'failed' ? '▷' : 'Ⅱ'}</span> {paused ? '動きを再開する' : state === 'static' || state === 'failed' ? '3Dを再試行' : '動きを止める'}
      <span className={styles.indicator} data-live={state === 'ready'} aria-hidden="true" />
    </button>}
      </div>
    </div>}
  </>;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { DESKTOP_QUERY, sectionIds, type SectionId } from '../Habitat/scene-config';
import { EXPLORER_ENABLED, FAILURE_KEY, isPC, PC_QUERY, PREFERENCE_KEY, readPreference } from './policy';
import type { ExplorerController, ExplorerPhase, ExplorerSnapshot, Preference } from './contracts';
import styles from './explorer.module.css';

const labels = ['COMPASS', 'Vision', 'Experience', 'Interactive', 'Library', 'Manifesto', 'Community', 'Founder', 'Contact'];
const snapshotKey = 'compass-explorer-visit';

export function ExplorerGate() {
  const mount = useRef<HTMLDivElement>(null);
  const markers = useRef<HTMLDivElement>(null);
  const controller = useRef<ExplorerController | null>(null);
  const choose = useRef<(preference: Preference) => void>(() => {});
  const navigate = useRef<(id: SectionId, instant?: boolean, read?: boolean) => void>(() => {});
  const [eligible, setEligible] = useState(false);
  const [active, setActive] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preference, setPreference] = useState<Preference>('auto');
  const [phase, setPhase] = useState<ExplorerPhase>('idle');
  const [room, setRoom] = useState<SectionId>('top');
  const [guide, setGuide] = useState(false);
  const [settings, setSettings] = useState(false);
  const [paused, setPaused] = useState(false);
  const [audible, setAudible] = useState(false);
  const [notice, setNotice] = useState('');
  const [siteInfo, setSiteInfo] = useState(false);
  const [volume,setVolume]=useState(.65);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const guideButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const root=mount.current?.closest<HTMLElement>('[data-habitat]');
    if(!root)return;
    root.dataset.explorerFooter=String(active&&siteInfo);
    if(active&&siteInfo){controller.current?.stop();const footer=root.querySelector<HTMLElement>('.site-footer');footer?.setAttribute('tabindex','-1');footer?.focus({preventScroll:true});}
    return ()=>{delete root.dataset.explorerFooter;root.querySelector('.site-footer')?.removeAttribute('tabindex');};
  },[active,siteInfo]);

  useEffect(() => {
    if (!EXPLORER_ENABLED) return;
    const host = mount.current, layer = markers.current, root = host?.closest<HTMLElement>('[data-habitat]');
    if (!host || !layer || !root) return;
    const desktop = matchMedia(DESKTOP_QUERY), fine = matchMedia(PC_QUERY), reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let alive = true, generation = 0, starting = false, suspended = false, running = false;
    let selected = readPreference(), attempts = 0, lastSample = '', originalOverflow: string | null = null;
    let restoreFocus: HTMLElement | null = null, currentRoom: SectionId = 'top';
    setPreference(selected);
    const allowed = () => isPC({ eligible: desktop.matches, fine: fine.matches, userAgent: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints });
    const stopped = () => { try { return sessionStorage.getItem('compass-habitat-paused') === 'true'; } catch { return false; } };
    const failed = () => { try { return sessionStorage.getItem(FAILURE_KEY) === 'true'; } catch { return false; } };
    const section = (): SectionId => {
      if(running && sectionIds.includes(location.hash.slice(1) as SectionId))return location.hash.slice(1) as SectionId;
      let nearest:SectionId='top',distance=Infinity;
      for(const id of sectionIds){const bounds=root.querySelector('#'+id)?.getBoundingClientRect();if(!bounds)continue;
        const gap=bounds.top>innerHeight*.4?bounds.top-innerHeight*.4:bounds.bottom<innerHeight*.4?innerHeight*.4-bounds.bottom:0;
        if(gap<distance){nearest=id;distance=gap;}
      }
      return nearest;
    };
    const suspend = (value: boolean) => {
      suspended = value;
      root.dispatchEvent(new CustomEvent('compass:habitat-suspend', { detail: { suspended: value } }));
    };
    const remember = () => {
      if (!controller.current || !running) return;
      try { sessionStorage.setItem(snapshotKey, JSON.stringify(controller.current.snapshot())); } catch { /* optional */ }
    };
    const restore = (fallback = false) => {
      const wasSpatial = running || starting;
      const id = controller.current?.snapshot().room ?? currentRoom;
      remember(); generation++; starting = false; running = false;
      controller.current?.dispose(); controller.current = null;
      host.replaceChildren(); layer.replaceChildren();
      delete root.dataset.explorerActive; delete root.dataset.explorerRoom; delete root.dataset.explorerReading;
      delete root.dataset.explorerPhase; delete root.dataset.explorerPaused;
      for (const element of root.querySelectorAll<HTMLElement>('[data-explorer-panel]')) {
        element.removeAttribute('data-explorer-panel');
        for (const property of ['transform','visibility','width','height']) element.style.removeProperty(property);
      }
      if (originalOverflow !== null) { document.body.style.overflow = originalOverflow; originalOverflow = null; }
      if (alive) { setActive(false); setPreparing(false); setGuide(false); setPaused(false); setAudible(false); setSiteInfo(false); }
      if (suspended) suspend(false);
      if (wasSpatial && alive) requestAnimationFrame(() => {
        if (running || !alive) return;
        root.querySelector<HTMLElement>('#' + id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
        if (restoreFocus?.isConnected && restoreFocus.getClientRects().length) restoreFocus.focus({ preventScroll: true });
        else settingsButton.current?.focus({ preventScroll: true });
      });
      if (fallback && alive) setNotice('通常表示に切り替えました。');
    };
    const failure = () => {
      try { sessionStorage.setItem(FAILURE_KEY, 'true'); } catch { /* optional */ }
      restore(true);
    };
    const launch = async (manual: boolean) => {
      if (!alive || starting || running || !allowed() || reduced.matches || stopped()) return;
      if (!manual && (selected === 'standard' || failed())) return;
      const token = ++generation;
      starting = true; setPreparing(true); setNotice('空間を準備しています。');
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      try {
        const { createExplorer } = await import('./engine');
        if (!alive || token !== generation || !allowed()) return;
        currentRoom = section();
        let saved: ExplorerSnapshot | undefined;
        try { const value = JSON.parse(sessionStorage.getItem(snapshotKey) ?? 'null'); if (value?.room === currentRoom) saved = value; } catch { /* optional */ }
        // Dispose the old renderer before constructing the new one. Its poster stays visible.
        suspend(true);
        const instance = createExplorer(root, host, layer, {
          change(id, next) {
            if (!alive || token !== generation) return;
            currentRoom = id; setRoom(id); setPhase(next);
          },
          visit(id) {if(running && location.hash!=='#'+id)history.pushState({...history.state,compassExplorer:id,compassExplorerReading:false},'','#'+id);},
          ready() {
            if (!alive || token !== generation) return;
            const latest=section();
            running = true; starting = false;
            originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
            root.dataset.explorerActive = 'true';
            setActive(true); setPreparing(false); setNotice('');
            if(latest!==currentRoom)queueMicrotask(()=>{if(alive&&token===generation)void controller.current?.goTo(latest,true,false);});
          },
          failure,
          metrics(sample) { host.dataset.fps = sample.fps.toFixed(1); host.dataset.p95 = sample.p95.toFixed(1);host.dataset.gpuMs=sample.gpuMs?.toFixed(1)??'unavailable'; },
        });
        controller.current = instance;
        const passed = await instance.start(currentRoom, saved);
        if (!alive || token !== generation) return;
        if (!passed) failure();
      } catch { if (alive && token === generation) failure(); }
    };
    choose.current = value => {
      selected = value; setPreference(value); setSettings(false);
      try { localStorage.setItem(PREFERENCE_KEY, value); if (value !== 'standard') sessionStorage.removeItem(FAILURE_KEY); } catch { /* optional */ }
      if (value === 'standard') { restore(); setNotice(''); }
      else { attempts = 0; lastSample = ''; if(value==='explore')void launch(true); }
    };
    navigate.current = (id, instant = false, read = false) => {
      setGuide(false); setSiteInfo(false);
      history.replaceState({...history.state,compassExplorer:currentRoom,compassExplorerReading:root.dataset.explorerReading==='true'},'');
      if (location.hash !== '#' + id) history.pushState({ ...history.state, compassExplorer: id,compassExplorerReading:read }, '', '#' + id);
      void controller.current?.goTo(id, instant, read);
    };
    const sync = () => {
      const pc = allowed(); setEligible(pc && !reduced.matches);
      if (!pc || reduced.matches || stopped()) { if (running || starting) restore(); return; }
      if (selected === 'explore' && !failed()) void launch(true);
    };
    const poll = () => {
      if (!allowed() || selected !== 'auto' || running || starting || reduced.matches || stopped() || failed() || document.hidden) return;
      if(root.querySelector('#main')?.contains(document.activeElement))return;
      const canvasHost = root.querySelector<HTMLElement>('[data-habitat-backdrop] canvas')?.parentElement;
      if (!canvasHost || root.dataset.sceneState !== 'ready') return;
      const stamp = canvasHost.dataset.fpsAt ?? '';
      if (!stamp || stamp === lastSample || performance.now() - Number(stamp) > 5000) return;
      lastSample = stamp;
      attempts = Number(canvasHost.dataset.fps) >= 55 ? attempts + 1 : 0;
      if (attempts >= 2) void launch(false);
    };
    const historyChange = () => { if (running) void controller.current?.goTo(section(), true, Boolean(history.state?.compassExplorerReading)); };
    const click = (event: MouseEvent) => {
      if (!running || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && sectionIds.includes(url.hash.slice(1) as SectionId)) {
        event.preventDefault(); event.stopPropagation(); navigate.current(url.hash.slice(1) as SectionId);
      } else remember();
    };
    const keydown = (event: KeyboardEvent) => {
      if(event.key==='Escape'&&root.dataset.explorerFooter==='true'){event.preventDefault();setSiteInfo(false);settingsButton.current?.focus();return;}
      if (running && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {selected='standard';setPreference('standard');restore();}
    };
    const onPageHide = () => remember();
    const interval = window.setInterval(poll, 1000);
    desktop.addEventListener('change', sync); fine.addEventListener('change', sync); reduced.addEventListener('change', sync);
    root.addEventListener('click', click, true);
    window.addEventListener('popstate', historyChange); window.addEventListener('hashchange', historyChange);
    window.addEventListener('pagehide', onPageHide); window.addEventListener('keydown', keydown);
    root.addEventListener('compass:habitat-toggle', sync);
    sync();
    return () => {
      remember(); alive = false; restore(); clearInterval(interval);
      desktop.removeEventListener('change', sync); fine.removeEventListener('change', sync); reduced.removeEventListener('change', sync);
      root.removeEventListener('click', click, true); root.removeEventListener('compass:habitat-toggle', sync);
      window.removeEventListener('popstate', historyChange); window.removeEventListener('hashchange', historyChange);
      window.removeEventListener('pagehide', onPageHide); window.removeEventListener('keydown', keydown);
    };
  }, []);

  return <>
    <div ref={mount} className={styles.canvas} data-explorer-canvas data-visible={active} aria-hidden="true" />
    <div ref={markers} className={styles.markers} data-explorer-markers data-visible={active} />
    {active && phase !== 'reading' && !siteInfo && <nav className={styles.destinations} aria-label="空間内の行き先" data-moving={phase === 'walking' || phase === 'entering'}>
      {(['technology','resources','contact'] as const).map((id,index)=><button key={id} type="button"
        onPointerEnter={()=>controller.current?.preview(id)} onPointerLeave={()=>controller.current?.preview(null)}
        onFocus={()=>controller.current?.preview(id)} onBlur={()=>controller.current?.preview(null)}
        onClick={()=>{controller.current?.preview(null);navigate.current(id);}}>
        <small aria-hidden="true">{String(index+1).padStart(2,'0')}</small><span>{labels[sectionIds.indexOf(id)]}</span><span aria-hidden="true">↗</span>
      </button>)}
    </nav>}
    {eligible && <div className={styles.controls} data-explorer-controls data-active={active}>
      {active && <>
        <div className={styles.location}><span aria-hidden="true">{String(sectionIds.indexOf(room)).padStart(2, '0')}</span>{labels[sectionIds.indexOf(room)]}</div>
        <button ref={guideButton} type="button" aria-expanded={guide} aria-controls="explorer-guide" onClick={() => { setGuide(!guide); setSettings(false); }}>館内案内 <span aria-hidden="true">＋</span></button>
        {phase !== 'reading' && <button data-explorer-read type="button" onClick={() => controller.current?.read()}>紹介を読む</button>}
        {(phase === 'walking' || phase === 'entering') && <button type="button" onClick={() => controller.current?.skip()}>移動をスキップ</button>}
        {phase === 'reading' && <button type="button" onClick={() => controller.current?.close()}>空間に戻る</button>}
        <div className={styles.separator} />
        <button type="button" aria-pressed={audible} onClick={async () => { controller.current?.setVolume(volume); const value = await controller.current?.setSound(!audible); setAudible(Boolean(value)); }}>音響 {audible ? 'ON' : 'OFF'}</button>
        <button type="button" aria-pressed={paused} onClick={() => { controller.current?.setPaused(!paused); setPaused(!paused); try { sessionStorage.setItem('compass-habitat-paused',String(!paused)); } catch { /* optional */ } }}>{paused ? '動きを再開' : '動きを止める'}</button>
      </>}
      <button ref={settingsButton} type="button" aria-expanded={settings} aria-controls="explorer-settings" onClick={() => { setSettings(!settings); setGuide(false); }}>表示 <span aria-hidden="true">⌄</span></button>
      {active && siteInfo && <button type="button" onClick={()=>setSiteInfo(false)}>閉じる</button>}
      {settings && <div id="explorer-settings" className={styles.settings} onKeyDown={event => { if (event.key === 'Escape') { setSettings(false); settingsButton.current?.focus(); } }}>
        {([['auto','自動'],['explore','空間を探索'],['standard','通常表示']] as const).map(([value,label]) =>
          <button key={value} type="button" aria-pressed={preference === value} onClick={() => choose.current(value)}>{label}<span aria-hidden="true">{preference === value ? '●' : '○'}</span></button>)}
        {active && <button type="button" onClick={()=>{setSettings(false);setSiteInfo(true);}}>サイト情報</button>}
        {active && <label>音量<input type="range" min="0" max="1" step="0.05" value={volume} onChange={event=>{const next=Number(event.target.value);setVolume(next);controller.current?.setVolume(next);}} /></label>}
        {active && <a href="/habitat/explorer/v1/credits.txt" target="_blank" rel="noopener noreferrer">素材の出典</a>}
      </div>}
      {guide && <nav id="explorer-guide" className={styles.guide} aria-label="館内案内" onKeyDown={event => { if (event.key === 'Escape') { setGuide(false); guideButton.current?.focus(); } }}>
        {sectionIds.map((id,index) => <div key={id}><button type="button" aria-current={id === room ? 'location' : undefined} onClick={() => navigate.current(id)}><small>{String(index).padStart(2,'0')}</small>{labels[index]}<span aria-hidden="true">↗</span></button><button type="button" aria-label={`${labels[index]}の紹介を移動せずに読む`} onClick={() => navigate.current(id,true,true)}>読む</button></div>)}
      </nav>}
      {active && <p className={styles.hint}>床をクリックして移動 · ドラッグで見回す</p>}
      {!active && notice && <p className={styles.notice} role="status">{notice}{preparing && <button type="button" onClick={() => choose.current('standard')}>通常表示</button>}</p>}
    </div>}
  </>;
}

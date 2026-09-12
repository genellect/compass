'use client';

import { useEffect, useRef, useState } from 'react';
import { DESKTOP_QUERY, sectionIds, type SectionId } from '../Habitat/scene-config';
import { EXPLORER_ENABLED, isPC, PC_QUERY } from './policy';
import { exhibits } from './exhibit-content';
import type { ExplorerController, ExplorerPhase, ExplorerSnapshot } from './contracts';
import styles from './explorer.module.css';

type Status = 'checking' | 'loading' | 'ready' | 'unsupported' | 'stopped' | 'failed';
const visitKey = 'compass-3d-page-visit';
const currentSection = (): SectionId => sectionIds.find(id => id === location.hash.slice(1)) ?? 'top';

export function ExplorerPage() {
  const root = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), markers = useRef<HTMLDivElement>(null);
  const controller = useRef<ExplorerController | null>(null);
  const [status, setStatus] = useState<Status>('checking'), [attempt, setAttempt] = useState(0);
  const [room, setRoom] = useState<SectionId>('top'), [phase, setPhase] = useState<ExplorerPhase>('idle');
  const [guide, setGuide] = useState(false), [settings, setSettings] = useState(false), [help, setHelp] = useState(false);
  const [paused, setPaused] = useState(false), [audible, setAudible] = useState(false), [volume, setVolume] = useState(.65);
  const guideButton = useRef<HTMLButtonElement>(null), settingsButton = useRef<HTMLButtonElement>(null);
  const ready = status === 'ready';

  useEffect(() => {
    const element = root.current!, canvas = host.current!, labels = markers.current!;
    let disposed = false, generation = 0;
    const desktop = matchMedia(DESKTOP_QUERY), fine = matchMedia(PC_QUERY), reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const save = () => { if (controller.current) try { sessionStorage.setItem(visitKey, JSON.stringify(controller.current.snapshot())); } catch { /* optional */ } };
    const stop = () => { generation++; save(); controller.current?.dispose(); controller.current = null; setAudible(false); };
    const supported = () => EXPLORER_ENABLED && isPC({ eligible: desktop.matches, fine: fine.matches, userAgent: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints });
    const fail = () => { if (disposed) return; stop(); element.dataset.explorerActive = 'false'; setStatus('failed'); };
    const start = async () => {
      stop(); if (disposed) return;
      if (!supported()) { setStatus('unsupported'); return; }
      let savedPause = false;
      try { savedPause = sessionStorage.getItem('compass-habitat-paused') === 'true'; } catch { /* optional */ }
      if (!attempt && (reduced.matches || savedPause)) { setStatus('stopped'); return; }
      const token = generation; setStatus('loading');
      try {
        const { createExplorer } = await import('./engine');
        if (disposed || token !== generation) return;
        const instance = createExplorer(element, canvas, labels, {
          change(id, value) { if (!disposed) { setRoom(id); setPhase(value); } },
          visit(id) { if (!disposed) { history.replaceState(null, '', '#' + id); save(); } },
          ready() { if (!disposed && token === generation) { element.dataset.explorerActive = 'true'; setStatus('ready'); setPaused(false); } },
          failure: fail,
          metrics(sample) { canvas.dataset.fps = sample.fps.toFixed(1); canvas.dataset.p95 = sample.p95.toFixed(1); },
        });
        controller.current = instance;
        let snapshot: ExplorerSnapshot | undefined;
        try {
          const value = JSON.parse(sessionStorage.getItem(visitKey) ?? 'null');
          if (value?.room === currentSection()) snapshot = value;
        } catch { /* optional */ }
        if (!await instance.start(currentSection(), snapshot) && !disposed && token === generation) fail();
      } catch { if (!disposed && token === generation) fail(); }
    };
    const eligibility = () => {
      if (!supported() || reduced.matches) { stop(); setStatus(supported() ? 'stopped' : 'unsupported'); }
      else if (!controller.current) void start();
    };
    const pageHide = () => { stop(); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) void start(); };
    const historyChange = () => { if (controller.current) void controller.current.goTo(currentSection()); };
    desktop.addEventListener('change', eligibility); fine.addEventListener('change', eligibility); reduced.addEventListener('change', eligibility);
    window.addEventListener('pagehide', pageHide); window.addEventListener('pageshow', pageShow); window.addEventListener('popstate', historyChange);
    void start();
    return () => { disposed = true; stop(); desktop.removeEventListener('change', eligibility); fine.removeEventListener('change', eligibility); reduced.removeEventListener('change', eligibility); window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow); window.removeEventListener('popstate', historyChange); };
  }, [attempt]);

  useEffect(() => { if (guide || settings || help) controller.current?.stop(); }, [guide, settings, help]);
  const teleport = async (id: SectionId) => {
    setGuide(false); controller.current?.stop();
    history.pushState(null, '', '#' + id);
    await controller.current?.goTo(id);
    host.current?.focus({ preventScroll: true });
  };
  const returnToSite = () => { try { sessionStorage.setItem('compass-3d-restore', 'true'); } catch { /* optional */ } };

  return <div ref={root} className={styles.root} data-explorer-page data-explorer-modal={guide || settings || help} data-status={status}>
    <h1 className={styles.srOnly}>{exhibits.top.title}</h1>
    <div ref={host} className={styles.canvas} data-explorer-canvas data-visible={ready} aria-hidden="true" />
    <div ref={markers} className={styles.markers} data-explorer-markers data-visible={ready} />
    {ready && <main className={styles.exhibitions} aria-label="施設内の案内">
      {sectionIds.filter(id => id !== 'top').map(id => <article key={id} data-room-exhibit={id} className={styles.exhibit} aria-label={exhibits[id].label}>
        <p className={styles.roomName}>{exhibits[id].label}</p>
        {id === 'founder' && <img src="/images/founder/yuto-matsui-parent-20260908-480.webp" width="480" height="600" alt="COMPASS代表 松井優知" loading="lazy" />}
        <h2>{exhibits[id].title}</h2><p>{exhibits[id].body}</p>
        <a href={exhibits[id].href}>{exhibits[id].cta}<span aria-hidden="true">↗</span></a>
      </article>)}
    </main>}
    <header className={styles.header}>
      <a href="/" className={styles.brand} onClick={returnToSite}>COMPASS</a>
      <span className={styles.location} aria-live="polite">{exhibits[room].label}</span>
      <nav aria-label="3Dの操作">
        <button ref={guideButton} type="button" aria-expanded={guide} aria-controls="explorer-guide" onClick={() => { setGuide(!guide); setSettings(false); setHelp(false); }}>館内案内</button>
        {ready && <button ref={settingsButton} type="button" aria-expanded={settings} aria-controls="explorer-settings" onClick={() => { setSettings(!settings); setGuide(false); setHelp(false); }}>設定</button>}
        <a href="/" onClick={returnToSite}>通常サイトへ戻る <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    {!ready && <main className={styles.arrival}>
      {status === 'loading' && <img className={styles.poster} src="/habitat/explorer/v1/arrival.webp" alt="" />}
      <div className={styles.loadingCopy}>
        <p className={styles.roomName}>COMPASS / 3D</p>
        <p className={styles.arrivalTitle}>Don’t Just Learn.<br />Build What’s Next.</p>
        <p role="status">{status === 'loading' || status === 'checking' ? '3Dを準備しています' : status === 'unsupported' ? 'この端末では、通常サイトをご利用ください。' : status === 'stopped' ? '動きを止める設定が有効です。' : '3Dを読み込めませんでした。通常サイトはそのままご利用いただけます。'}</p>
        {['failed', 'stopped'].includes(status) && <button type="button" onClick={() => setAttempt(value => value + 1)}>{status === 'failed' ? 'もう一度試す' : '3Dを開始する'}</button>}
        <a href="/" onClick={returnToSite}>通常サイトへ戻る</a>
      </div>
    </main>}
    {guide && <nav id="explorer-guide" className={styles.guide} aria-label="館内案内" onKeyDown={event => { if (event.key === 'Escape') { setGuide(false); guideButton.current?.focus(); } }}>
      <div className={styles.guideIntro}><p>館内案内</p><span>部屋へ移動、または各サイトを開く</span></div>
      {sectionIds.map(id => <div key={id}>
        <button type="button" disabled={!ready} aria-current={id === room ? 'location' : undefined} aria-label={`${exhibits[id].label}へ移動`} onClick={() => void teleport(id)}>{exhibits[id].label}<span aria-hidden="true">→</span></button>
        <a href={exhibits[id].href} aria-label={`${exhibits[id].label}のサイトを開く`}>{exhibits[id].cta} ↗</a>
      </div>)}
      <a className={styles.credit} href="/habitat/explorer/v1/credits.txt" target="_blank" rel="noopener noreferrer">素材の出典</a>
    </nav>}
    {ready && <footer className={styles.controls}>
      <span className={styles.hint}>W A S D / 矢印キーで移動 <i /> ドラッグで見回す</span>
      {phase === 'entering' && <span role="status" className={styles.hint}>部屋を準備しています</span>}
      {phase === 'walking' && <button type="button" onClick={() => controller.current?.stop()}>停止</button>}
      <button type="button" aria-expanded={help} onClick={() => { setHelp(!help); setGuide(false); setSettings(false); }}>操作方法</button>
    </footer>}
    {help && <div className={styles.help} onKeyDown={event => { if (event.key === 'Escape') setHelp(false); }}>
      <p>WASD・矢印キーで歩く。キーを離すと停止します。</p><p>ドラッグで見回す。近くの扉はクリック、または E キーで開閉できます。</p><p>床のクリックでも移動できます。Esc で停止。「館内案内」から各部屋へ直接移動できます。</p>
      <button type="button" onClick={() => setHelp(false)}>閉じる</button>
    </div>}
    {settings && <div id="explorer-settings" className={styles.settings} onKeyDown={event => { if (event.key === 'Escape') { setSettings(false); settingsButton.current?.focus(); } }}>
      <button type="button" aria-pressed={audible} onClick={async () => { controller.current?.setVolume(volume); setAudible(Boolean(await controller.current?.setSound(!audible))); }}>音響 {audible ? 'ON' : 'OFF'}</button>
      <label>音量<input type="range" min="0" max="1" step=".05" value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); controller.current?.setVolume(value); }} /></label>
      <button type="button" aria-pressed={paused} onClick={() => { controller.current?.setPaused(!paused); setPaused(!paused); }}>{paused ? '動きを再開' : '動きを止める'}</button>
    </div>}
  </div>;
}

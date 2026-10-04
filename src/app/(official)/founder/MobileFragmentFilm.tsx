"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { FilmPhoto } from "./fragment-film-engine";
import type { MobileFilmController } from "./mobile-fragment-film-engine";
import css from "./mobile-fragment-film.module.css";

export function MobileFragmentFilm({ photos, active, language="ja", currentPhoto, onCurrentPhoto, onFailure }: {
  photos: readonly FilmPhoto[]; active: boolean; language?: "ja"|"en"; currentPhoto: string;
  onCurrentPhoto(key: string): void; onFailure(): void;
}) {
  const host=useRef<HTMLDivElement>(null), controller=useRef<MobileFilmController|null>(null);
  const pauseRef=useRef(false), callbacks=useRef({onCurrentPhoto,onFailure,currentPhoto});
  callbacks.current={onCurrentPhoto,onFailure,currentPhoto};
  const [ready,setReady]=useState(false), [paused,setPaused]=useState(false);
  useEffect(()=>{ pauseRef.current=paused; host.current?.dispatchEvent(new Event("mobile-film-motion-change")); },[paused]);
  useEffect(()=>{
    if (!active || !host.current) return;
    const element=host.current; let disposed=false;
    const observer=new IntersectionObserver(async ([entry])=>{
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const { mountMobileFilm }=await import("./mobile-fragment-film-engine");
        if (disposed) return;
        controller.current=mountMobileFilm(element,photos,callbacks.current.currentPhoto,()=>pauseRef.current,()=>{ if (!disposed) setReady(true); },()=>{ if (!disposed) callbacks.current.onFailure(); },key=>callbacks.current.onCurrentPhoto(key));
      } catch { if (!disposed) callbacks.current.onFailure(); }
    },{rootMargin:"240px"});
    observer.observe(element);
    return ()=>{ disposed=true; observer.disconnect(); controller.current?.dispose(); controller.current=null; setReady(false); };
  },[active,photos]);
  const en=language==="en";
  const initial=photos.find(p=>p.key===currentPhoto) ?? photos[0];
  return <div className={css.stage} data-mobile-fragment-film data-ready={ready} data-language={language}>
    <div className={css.atmosphere} aria-hidden="true">
      <div className={css.light}/><div className={css.shadow}/>
      <svg viewBox="0 0 430 600" preserveAspectRatio="none"><path d="M-100 420 C110 575 520 480 540 160"/><path d="M-90 433 C145 580 525 453 530 142"/><path d="M-120 115 C125 0 345 40 510 335"/><path className={css.trace} d="M-100 420 C110 575 520 480 540 160"/></svg>
    </div>
    <div ref={host} className={css.viewport} tabIndex={active?0:-1} role="group" aria-label={en?"Photographic film. Drag horizontally or use the arrow keys.":"写真フィルム。横ドラッグまたは左右キーで移動"}/>
    {!ready && <div className={css.poster} aria-hidden="true"><Image src={initial.src} alt="" width={initial.width} height={initial.height} sizes="90vw" loading="lazy" /></div>}
    <div className={css.controls}>
      <button type="button" onClick={()=>controller.current?.step(-1)} aria-label={en?"Previous image":"前の写真"}>←</button>
      <button type="button" aria-pressed={paused} onClick={()=>setPaused(p=>!p)} aria-label={en?(paused?"Resume automatic film movement":"Pause automatic film movement"):(paused?"写真フィルムの自動送りを再開":"写真フィルムの自動送りを一時停止")}>{paused?"Play":"Pause"}</button>
      <button type="button" onClick={()=>controller.current?.step(1)} aria-label={en?"Next image":"次の写真"}>→</button>
    </div>
    <div className={css.photoDescriptions}>{photos.map(p=><span key={p.key}>{p.alt}</span>)}</div>
  </div>;
}

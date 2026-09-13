'use client';

import { useEffect, useState } from 'react';
import { DESKTOP_QUERY } from '../Habitat/scene-config';
import { EXPLORER_ENABLED, isPC, PC_QUERY } from './policy';

/** This entry imports no explorer engine, styles or media. A plain anchor also
 * prevents Next prefetch and gives the two renderers separate document lives. */
export function ExplorerEntry({ className }: { className: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const desktop = matchMedia(DESKTOP_QUERY), fine = matchMedia(PC_QUERY);
    const sync = () => setVisible(EXPLORER_ENABLED && isPC({ eligible: desktop.matches, fine: fine.matches,
      userAgent: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints }));
    sync(); desktop.addEventListener('change', sync); fine.addEventListener('change', sync);
    let frame=0,alive=true;
    try {
      if(sessionStorage.getItem('compass-3d-restore')==='true'){
        const saved=JSON.parse(sessionStorage.getItem('compass-3d-return')??'null');
        if(Number.isFinite(saved?.scroll)&&saved.scroll>=0)void document.fonts.ready.then(()=>{
          if(alive)frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
            if(!alive)return;
            window.scrollTo({top:saved.scroll,behavior:'instant'});
            // Consume only after applying it: Strict Mode cancels the first effect.
            try{sessionStorage.removeItem('compass-3d-restore');}catch{/* optional */}
          });});
        });
      }
    } catch { /* Returning without storage uses the browser's native position. */ }
    return () => { alive=false;cancelAnimationFrame(frame);desktop.removeEventListener('change', sync); fine.removeEventListener('change', sync); };
  }, []);
  if (!visible) return null;
  return <a href="/3d/" className={className} data-explorer-entry onClick={() => {
    try { sessionStorage.setItem('compass-3d-return', JSON.stringify({ hash: location.hash, scroll: scrollY })); } catch { /* optional */ }
  }}>3Dを体験する <span aria-hidden="true">↗</span></a>;
}

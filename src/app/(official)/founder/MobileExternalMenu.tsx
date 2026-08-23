"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type MobileExternalMenuProps = {
  children: ReactNode;
  className: string;
};

export function MobileExternalMenu({ children, className }: MobileExternalMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeFromOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);

    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="外部リンクを表示"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="5" r="1.6" />
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="19" cy="5" r="1.6" />
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
          <circle cx="5" cy="19" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
          <circle cx="19" cy="19" r="1.6" />
        </svg>
      </button>
      {open ? children : null}
    </div>
  );
}

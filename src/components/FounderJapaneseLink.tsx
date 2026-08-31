"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { useEffect, useState } from "react";

type FounderJapaneseLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

function japanesePortfolioHref(hostname: string) {
  return hostname === "yuto-matsui.com" || hostname.endsWith(".yuto-matsui.com")
    ? "/"
    : "/founder/";
}

export function FounderJapaneseLink({ children, onClick, ...props }: FounderJapaneseLinkProps) {
  const [href, setHref] = useState("/");

  useEffect(() => {
    setHref(japanesePortfolioHref(window.location.hostname));
  }, []);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const destination = japanesePortfolioHref(window.location.hostname);
    if (destination !== href) setHref(destination);
    if (destination === "/") return;

    event.preventDefault();
    window.location.assign(destination);
  };

  return <a {...props} href={href} onClick={handleClick}>{children}</a>;
}

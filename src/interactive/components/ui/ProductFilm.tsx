"use client";

import Image from "next/image";
import { useState } from "react";

const videoId = "BL-9TVJ-ph8";
const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

export function ProductFilm() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className={`product-film ${playing ? "is-playing" : ""}`}>
      <div className="product-film__stage">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`}
            title="COMPASS Interactive｜リアルタイム×AI参加型講義システム"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            className="product-film__play"
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="90秒のCOMPASS Interactive紹介動画を再生"
          >
            <Image
              src="/images/interactive/product-film-poster.jpg"
              alt=""
              fill
              sizes="(max-width: 680px) calc(100vw - 32px), (max-width: 1080px) 80vw, 44vw"
            />
            <span className="product-film__shade" aria-hidden="true" />
            <span className="product-film__meta" aria-hidden="true">
              <small>CLASSROOM PROOF · 01:30</small>
              <strong><i /> PLAY FILM</strong>
            </span>
            <span className="product-film__playmark" aria-hidden="true"><i /></span>
          </button>
        )}
        <a
          className="product-film__youtube"
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="COMPASS Interactive紹介動画をYouTubeで見る"
        >
          YouTubeで見る <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="product-film__rail" aria-hidden="true"><span /><span /><span /></div>
    </div>
  );
}

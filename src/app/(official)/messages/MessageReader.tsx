"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { MessageBlock, MessageDocument } from "./messageParser";
import styles from "./messages.module.css";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

const storageKey = "compass-message-reader-chapter";
const focusableSelector = "button:not([disabled]), a[href]";

function renderInline(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\*\*.*?\*\*)/g).filter(Boolean);
    return (
      <Fragment key={`${lineIndex}-${line}`}>
        {parts.map((part, partIndex) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={`${partIndex}-${part}`}>{part.slice(2, -2)}</strong>
          ) : (
            <Fragment key={`${partIndex}-${part}`}>{part}</Fragment>
          )
        )}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}

function MessageParagraph({ block, isFirst }: { block: MessageBlock; isFirst: boolean }) {
  if (block.kind === "signature") {
    return (
      <footer className={styles.signature} aria-label="署名">
        <span data-message-copy="true">{renderInline(block.text)}</span>
      </footer>
    );
  }

  if (block.kind === "pull-quote") {
    return (
      <blockquote className={styles.pullQuote}>
        <span aria-hidden="true" className={styles.pullQuoteMark}>“</span>
        <p><span data-message-copy="true"><strong>{block.text.slice(2, -2)}</strong></span></p>
      </blockquote>
    );
  }

  return (
    <p className={isFirst ? styles.openingParagraph : undefined}>
      <span data-message-copy="true">{renderInline(block.text)}</span>
    </p>
  );
}

export function MessageReader({ message }: { message: MessageDocument }) {
  const [currentChapter, setCurrentChapter] = useState(-1);
  const [resumeChapter, setResumeChapter] = useState<number | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const readerRef = useRef<HTMLDivElement>(null);
  const indexPanelRef = useRef<HTMLElement>(null);
  const indexCloseButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const chapterHeadingRefs = useRef<Array<HTMLHeadingElement | null>>([]);

  const chapterByHash = useMemo(
    () => new Map(message.chapters.map((chapter, index) => [`#${chapter.id}`, index])),
    [message.chapters]
  );

  const openIndex = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    returnFocusRef.current = event.currentTarget;
    setIndexOpen(true);
  }, []);

  const closeIndex = useCallback(() => {
    setIndexOpen(false);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, []);

  const applyChapter = useCallback((index: number) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const update = () => setCurrentChapter(index);
    const transitionDocument = document as ViewTransitionDocument;

    if (!reduceMotion && transitionDocument.startViewTransition) {
      transitionDocument.startViewTransition(update);
    } else {
      update();
    }

    if (index >= 0) {
      window.localStorage.setItem(storageKey, message.chapters[index].id);
      setResumeChapter(index);
    }

    window.requestAnimationFrame(() => {
      readerRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      window.requestAnimationFrame(() => chapterHeadingRefs.current[index]?.focus({ preventScroll: true }));
    });
  }, [message.chapters]);

  const goToChapter = useCallback((index: number, historyMode: "push" | "replace" | "none" = "push") => {
    const chapter = message.chapters[index];
    if (!chapter) return;
    if (historyMode === "push") window.history.pushState({ chapter: chapter.id }, "", `#${chapter.id}`);
    if (historyMode === "replace") window.history.replaceState({ chapter: chapter.id }, "", `#${chapter.id}`);
    setIndexOpen(false);
    applyChapter(index);
  }, [applyChapter, message.chapters]);

  const closeChapter = useCallback(() => {
    window.history.pushState({ chapter: "cover" }, "", window.location.pathname);
    setCurrentChapter(-1);
    setReadingProgress(0);
    window.requestAnimationFrame(() => readerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  useEffect(() => {
    const storedId = window.localStorage.getItem(storageKey);
    const storedIndex = storedId ? message.chapters.findIndex((chapter) => chapter.id === storedId) : -1;
    if (storedIndex >= 0) setResumeChapter(storedIndex);

    const hashIndex = chapterByHash.get(window.location.hash);
    if (hashIndex !== undefined) applyChapter(hashIndex);

    const syncHistory = () => {
      const index = chapterByHash.get(window.location.hash);
      setIndexOpen(false);
      applyChapter(index ?? -1);
    };

    window.addEventListener("popstate", syncHistory);
    return () => window.removeEventListener("popstate", syncHistory);
  }, [applyChapter, chapterByHash, message.chapters]);

  useEffect(() => {
    if (currentChapter < 0) return;
    let frame = 0;

    const updateProgress = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const chapter = document.getElementById(message.chapters[currentChapter].id);
        if (!chapter) return;
        const rect = chapter.getBoundingClientRect();
        const readableDistance = Math.max(rect.height - window.innerHeight * 0.58, 1);
        const localProgress = Math.min(1, Math.max(0, (120 - rect.top) / readableDistance));
        setReadingProgress(((currentChapter + localProgress) / message.chapters.length) * 100);
      });
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [currentChapter, message.chapters]);

  useEffect(() => {
    if (!indexOpen) return;

    const panel = indexPanelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = Array.from(panel?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    const focusTimer = window.setTimeout(() => indexCloseButtonRef.current?.focus(), 60);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeIndex();
        return;
      }
      if (event.key !== "Tab" || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeIndex, indexOpen]);

  const activeChapter = currentChapter >= 0 ? message.chapters[currentChapter] : null;

  return (
    <div ref={readerRef} className={styles.reader} data-reader-state={activeChapter ? "reading" : "cover"}>
      <div className={styles.progressTrack} aria-hidden="true">
        <span style={{ transform: `scaleX(${readingProgress / 100})` }} />
      </div>

      <section className={styles.cover} aria-labelledby="message-title" data-active={!activeChapter}>
        <div className={styles.coverConstellation} aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>
        <div className={styles.coverInner}>
          <p className={styles.coverKicker}>COMPASS / MANIFESTO</p>
          <p className={styles.coverCount}>12 CHAPTERS · A LETTER FOR THE AI ERA</p>
          <h1 id="message-title"><span data-message-copy="true">{message.title}</span></h1>
          <p className={styles.coverSubtitle}>{message.chapters[0].title}</p>
          <div className={styles.coverActions} aria-label="読書を開始">
            <button type="button" className={styles.primaryAction} onClick={() => goToChapter(0)}>
              最初から読む <span aria-hidden="true">→</span>
            </button>
            {resumeChapter !== null && resumeChapter > 0 ? (
              <button type="button" className={styles.secondaryAction} onClick={() => goToChapter(resumeChapter)}>
                第{String(resumeChapter + 1).padStart(2, "0")}章から続きを読む
              </button>
            ) : null}
          </div>
          <p className={styles.coverAuthor}>YUTO MATSUI <span>FOUNDER &amp; REPRESENTATIVE</span></p>
        </div>
        <button type="button" className={styles.coverIndexButton} onClick={openIndex}>
          章を選ぶ <span aria-hidden="true">＋</span>
        </button>
      </section>

      <div className={styles.readingStage} data-active={Boolean(activeChapter)}>
        <aside className={styles.readingRail} aria-label="読書の進捗">
          <button type="button" onClick={openIndex} aria-haspopup="dialog" aria-expanded={indexOpen}>
            <span>CHAPTERS</span><strong>{activeChapter ? String(currentChapter + 1).padStart(2, "0") : "—"}</strong>
          </button>
          <div className={styles.railProgress} aria-hidden="true"><span style={{ height: `${readingProgress}%` }} /></div>
          <span>{Math.round(readingProgress)}%</span>
        </aside>

        <article className={styles.chapterStack} data-message-manuscript="true">
          {message.chapters.map((chapter, index) => {
            const active = index === currentChapter;
            return (
              <section
                id={chapter.id}
                key={chapter.id}
                className={`${styles.chapter} ${chapter.kind === "epilogue" ? styles.epilogue : ""}`.trim()}
                data-active={active}
                aria-hidden={activeChapter ? !active : undefined}
              >
                <div className={styles.pageSheet}>
                  <header className={styles.chapterHeader}>
                    <div>
                      <p>{chapter.kind === "epilogue" ? "EPILOGUE" : `CHAPTER ${String(index + 1).padStart(2, "0")}`}</p>
                      <span>{String(index + 1).padStart(2, "0")} / {String(message.chapters.length).padStart(2, "0")}</span>
                    </div>
                    <h2 ref={(element) => { chapterHeadingRefs.current[index] = element; }} tabIndex={-1}>
                      <span data-message-copy="true">{chapter.title}</span>
                    </h2>
                  </header>

                  <div className={styles.prose}>
                    {chapter.blocks.map((block, blockIndex) => (
                      <MessageParagraph key={`${chapter.id}-${blockIndex}-${block.text.slice(0, 12)}`} block={block} isFirst={blockIndex === 0} />
                    ))}
                  </div>

                  <nav className={styles.pageNavigation} aria-label="章の移動">
                    {index > 0 ? (
                      <button className={styles.previousChapterButton} type="button" onClick={() => goToChapter(index - 1)}>
                        <span aria-hidden="true">←</span><small>前の章</small><strong>{message.chapters[index - 1].title}</strong>
                      </button>
                    ) : <span />}
                    {index < message.chapters.length - 1 ? (
                      <button type="button" onClick={() => goToChapter(index + 1)}>
                        <small>次の章へ</small><strong>{message.chapters[index + 1].title}</strong><span aria-hidden="true">→</span>
                      </button>
                    ) : (
                      <button type="button" onClick={closeChapter}>
                        <small>読了</small><strong>表紙へ戻る</strong><span aria-hidden="true">↗</span>
                      </button>
                    )}
                  </nav>
                </div>
              </section>
            );
          })}
        </article>

        <div className={styles.mobileReaderBar}>
          <button type="button" onClick={openIndex} aria-haspopup="dialog" aria-expanded={indexOpen}>
            目次
          </button>
          <span>{activeChapter ? `${String(currentChapter + 1).padStart(2, "0")} / ${String(message.chapters.length).padStart(2, "0")}` : "COVER"}</span>
          {activeChapter && currentChapter < message.chapters.length - 1 ? (
            <button type="button" onClick={() => goToChapter(currentChapter + 1)}>次へ</button>
          ) : (
            <button type="button" onClick={closeChapter}>閉じる</button>
          )}
        </div>
      </div>

      <div className={styles.indexScrim} data-open={indexOpen} onClick={closeIndex} />
      <aside
        ref={indexPanelRef}
        className={styles.chapterIndex}
        data-open={indexOpen}
        role="dialog"
        aria-modal="true"
        aria-label="章を選ぶ"
        aria-hidden={!indexOpen}
      >
        <header>
          <div><p>CONTENTS</p><h2>章を選ぶ</h2></div>
          <button ref={indexCloseButtonRef} type="button" aria-label="目次を閉じる" onClick={closeIndex}>×</button>
        </header>
        <ol>
          {message.chapters.map((chapter, index) => (
            <li key={chapter.id} data-current={index === currentChapter} data-read={resumeChapter !== null && index <= resumeChapter}>
              <button type="button" onClick={() => goToChapter(index)}>
                <span>{chapter.kind === "epilogue" ? "END" : String(index + 1).padStart(2, "0")}</span>
                <strong>{chapter.title}</strong>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className={styles.indexCoverLink} onClick={() => { setIndexOpen(false); closeChapter(); }}>
          表紙へ戻る
        </button>
      </aside>

      <p className={styles.readerStatus} aria-live="polite">
        {activeChapter ? `全${message.chapters.length}章中、第${currentChapter + 1}章を表示しています。` : "表紙を表示しています。"}
      </p>
    </div>
  );
}

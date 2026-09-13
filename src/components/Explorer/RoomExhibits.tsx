'use client';

import { useEffect, useRef, useState } from 'react';
import type { MessageChapter } from '../../app/(official)/messages/messageParser';
import type { SectionId } from '../Habitat/scene-config';
import { exhibits } from './exhibit-content';
import { activityItems, communityCopy, founderStory, libraryItems, questionExamples } from './experience-content';
import styles from './explorer.module.css';

const destinations = ['technology', 'resources', 'manifesto', 'community'] as const;
const plain = (text: string) => text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);

export function RoomExhibits({ room, selected, chapters, inspect, travel, onVideo }: {
  room: SectionId; selected: string | null; chapters: MessageChapter[];
  inspect: (id: string | null) => void; travel: (id: SectionId) => void; onVideo: (playing: boolean) => void;
}) {
  const [question, setQuestion] = useState<number | null>(null), [delivery, setDelivery] = useState(0);
  const [playing, setPlaying] = useState(false), [expanded, setExpanded] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const chosen = selected?.split(':')[0] === room;
  const index = Math.max(0, Number(selected?.split(':')[1]) || 0);
  const content = exhibits[room];
  useEffect(() => { if (chosen) close.current?.focus({ preventScroll: true }); }, [chosen]);
  useEffect(() => { if (room !== 'technology') { setPlaying(false); onVideo(false); } }, [room, onVideo]);
  const play = () => { setPlaying(true); onVideo(true); };
  const selectQuestion = (i: number) => { setQuestion(i); setDelivery(value => value + 1); setPlaying(false); onVideo(false); inspect(`technology:question:${i}`); };
  const choose = (i = 0) => inspect(`${room}:${i}`);
  const titles = room === 'resources' ? libraryItems.map(item => item.title)
    : room === 'manifesto' ? chapters.map(item => item.title)
    : room === 'experience' ? activityItems.map(item => item.label)
    : room === 'founder' ? founderStory.map(item => item.label) : [content.title];

  return <main className={styles.exhibitions} aria-label="施設内の案内">
    {room === 'top' ? <nav className={styles.atriumRoutes} data-atrium-routes aria-label="入口の案内">
      <p>{exhibits.top.body}</p>
      {destinations.map(id => <button key={id} onClick={() => travel(id)}>{exhibits[id].label}<span aria-hidden="true">↗</span></button>)}
    </nav> : <article data-room-exhibit={room} className={styles.exhibit} aria-label={content.label}>
      <p className={styles.roomName}>{content.label}</p><h2>{content.title}</h2>
      <div className={styles.objectChoices}>{titles.map((title, i) => <button key={title} onClick={() => choose(i)} aria-label={`${title}を開く`}>
        <span className={styles.itemNumber}>{String(i + 1).padStart(2, '0')}</span>{titles.length === 1 ? room === 'technology' ? '質問例を選ぶ' : '本文を読む' : title}<span aria-hidden="true">↗</span>
      </button>)}</div>
    </article>}

    {room === 'technology' && <section className={styles.television} data-exhibit-tv aria-label="Interactive 室内TV">
      {playing ? <iframe title="COMPASS Interactive 紹介動画" src="https://www.youtube-nocookie.com/embed/BL-9TVJ-ph8?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        : question !== null ? <div key={delivery} className={styles.tvQuestion} data-delivered-question><span>COMPASS Interactive · 操作デモ</span><p>{questionExamples[question]}</p><small>あなたが飲み込んだその疑問を、誰かも同じように抱えているかもしれない。</small><button onClick={play}>紹介動画を再生 <span aria-hidden="true">▷</span></button></div>
        : <button className={styles.filmPlay} onClick={play}>紹介動画を再生 <span aria-hidden="true">▷</span></button>}
      {playing && <button className={styles.filmStop} onClick={() => { setPlaying(false); onVideo(false); }}>再生を終了</button>}
    </section>}
    {room === 'technology' && question !== null && <div className={styles.questionFlight} data-question-flight data-delivery={delivery} aria-hidden="true">{questionExamples[question]}</div>}

    {chosen && <section className={styles.reader} data-exhibit-reader data-material={room} role="region" aria-label={`${content.label}の展示`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); inspect(null); } }}>
      <header><span>{content.label}</span><button ref={close} onClick={() => inspect(null)} aria-label="展示を閉じる">閉じる <span aria-hidden="true">×</span></button></header>
      <div className={styles.readerBody}>
        <h2>{content.title}</h2><p>{content.body}</p>
        {room === 'resources' && <div className={styles.bookSpread}>
          <div className={styles.bookTabs} aria-label="資料を選ぶ">{libraryItems.map((item, i) => <button key={item.image} aria-pressed={index === i} onClick={() => choose(i)}><img src={item.image} alt={item.alt} width="240" height="340" /></button>)}</div>
          <p className={styles.eyebrow}>{libraryItems[index % 3].category}</p><h3>{libraryItems[index % 3].title}</h3>
          {libraryItems[index % 3].paragraphs.map(p => <p key={p}>{p}</p>)}
        </div>}
        {room === 'manifesto' && <><nav className={styles.chapterTabs} aria-label="章を選ぶ">{chapters.map((chapter, i) => <button key={chapter.id} aria-pressed={index === i} onClick={() => choose(i)}>{chapter.title}</button>)}</nav>
          <article className={styles.chapter} key={chapters[index % chapters.length].id}><h3>{chapters[index % chapters.length].title}</h3>{chapters[index % chapters.length].blocks.map((block, i) => <p key={i} data-kind={block.kind}>{plain(block.text)}</p>)}</article>
          <a className={styles.sourceLink} href={`/messages/#${chapters[index % chapters.length].id}`}>この章をManifestoで読む ↗</a>
        </>}
        {room === 'technology' && <><p className={styles.eyebrow}>操作デモ · 質問例を選ぶ</p><div className={styles.questionChoices}>{questionExamples.map((q, i) => <button key={q} aria-pressed={question === i} onClick={() => selectQuestion(i)}>{q}<span aria-hidden="true">↗</span></button>)}</div>
          <p className={styles.demoStatus} role="status">{question === null ? '選んだ質問が室内TVに表示されます。' : '室内TVに質問を表示しました。'}</p>
          <p>問いも、迷いも、ひらめきも。その場にいる全員の思考が重なったとき、講義はただの説明ではなく、自分たちの学びに変わります。</p>
          <a className={styles.sourceLink} href="https://www.youtube.com/watch?v=BL-9TVJ-ph8" target="_blank" rel="noopener noreferrer">紹介動画をYouTubeで開く ↗</a>
        </>}
        {room === 'experience' && <><nav className={styles.chapterTabs} aria-label="活動を選ぶ">{activityItems.map((item, i) => <button key={item.name} aria-pressed={index === i} onClick={() => choose(i)}>{item.label}</button>)}</nav><h3>{activityItems[index % 4].title}</h3><p>{activityItems[index % 4].text}</p><button className={styles.roomLink} onClick={() => travel(activityItems[index % 4].room)}>{exhibits[activityItems[index % 4].room].label}へ移動 →</button></>}
        {room === 'vision' && <nav className={styles.destinationChoices} aria-label="行き先を選ぶ">{destinations.map(id => <button key={id} onClick={() => travel(id)}><span>{exhibits[id].label}</span>{exhibits[id].title} →</button>)}</nav>}
        {room === 'community' && <><p>{communityCopy.introduction}</p><details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary><span>{expanded ? '閉じる' : '続きを読む'}</span><span aria-hidden="true">{expanded ? '−' : '+'}</span></summary>{communityCopy.paragraphs.map(p => <p key={p}>{p}</p>)}</details></>}
        {room === 'founder' && <><img className={styles.founderPortrait} src="/images/founder/yuto-matsui-parent-20260908-480.webp" width="480" height="600" alt="COMPASS代表 松井優知" /><nav className={styles.chapterTabs} aria-label="Storyを選ぶ">{founderStory.map((item, i) => <button key={item.label} aria-pressed={index === i} onClick={() => choose(i)}>{item.label}</button>)}</nav><p>{founderStory[index % 3].text}</p>{index % 3 === 2 && <p><strong>{founderStory[2].closing}</strong></p>}<a className={styles.sourceLink} href="https://yuto-matsui.com/#story" target="_blank" rel="noopener noreferrer">Yuto Matsui / Story ↗</a></>}
        <a className={styles.finalCta} href={content.href} {...(room === 'founder' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{content.cta}<span aria-hidden="true">↗</span></a>
      </div>
    </section>}
  </main>;
}

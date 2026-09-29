import type { Metadata } from "next";
import Link from "next/link";
import { Note, Section, Table, REVISION } from "./DocPrimitives";
import { ArchitectureArticle, AiArticle, DeliveryArticle, SecurityArticle } from "./TopicArticles";
import styles from "./engineering-docs.module.css";

export const DOC_ROOT = "/INTRO_Interactive/developers/";
export const topics = {
  architecture: {
    title: "講義状態と同期",
    description: "画面ごとの状態をどう揃えるか。スナップショット、Displayへの通知、講義終了時の制御を説明します。",
    sections: [["lecture-state", "講義を単位に状態を管理する"], ["synchronization", "同期と復帰"], ["lifecycle", "開始から終了まで"], ["runtime", "実行環境の選択"]]
  },
  ai: {
    title: "AI機能と実行制御",
    description: "字幕・要約・資料分析・学術回答を支える、実行許可、利用量管理、外部APIとの連携。",
    sections: [["features", "機能と入力"], ["admission", "許可と実行を分ける"], ["dispatch", "重複実行を抑える"], ["evidence", "学術回答の根拠"]]
  },
  delivery: {
    title: "資料配信とPowerPoint連携",
    description: "PDFの保存と公開を分ける仕組みと、Windows上のPowerPointから講義のページ位置を更新する経路。",
    sections: [["pdf-path", "PDFの経路"], ["publication", "公開までの状態遷移"], ["presenter", "PowerPointとの同期"], ["recovery", "失敗時の扱い"]]
  },
  security: {
    title: "認証とデータ管理",
    description: "未登録で参加できる学生画面と、教員・投影画面の権限。データの保存場所と外部送信の範囲を説明します。",
    sections: [["identity", "参加者と教員の認証"], ["authorization", "操作を許可する境界"], ["data", "保存と外部送信"], ["future", "今後の拡張"]]
  }
} as const;

export type Topic = keyof typeof topics;
const topicKeys = Object.keys(topics) as Topic[];
const overviewSections = [["architecture", "システム構成"], ["decisions", "設計の要点"], ["stack", "実行環境と役割"], ["codebase", "実装を読む"], ["developer-profile", "設計・開発"]] as const;

export function engineeringMetadata(topic?: Topic): Metadata {
  const title = topic ? topics[topic].title : "システム構成と設計";
  const description = topic ? topics[topic].description : "COMPASS Interactiveの状態同期、AI実行制御、PDF配信、PowerPoint連携、認証とデータ管理を、現行の公開ソースに沿って説明します。";
  const url = topic ? `${DOC_ROOT}${topic}/` : DOC_ROOT;
  return {
    title: `${title} | COMPASS Interactive 技術資料`, description,
    alternates: { canonical: url },
    openGraph: { title: `${title} | COMPASS Interactive`, description, url, type: "website", locale: "ja_JP", siteName: "COMPASS Interactive" },
    twitter: { card: "summary_large_image", title: `${title} | COMPASS Interactive`, description }
  };
}

function Contents({ topic }: { topic?: Topic }) {
  const sections = topic ? topics[topic].sections : overviewSections;
  return <>
    <nav className={styles.documentNav} aria-label="技術資料"><p className={styles.navLabel}>技術資料</p>
      <Link href={DOC_ROOT} aria-current={!topic ? "page" : undefined}>概要</Link>
      {topicKeys.map(key => <Link key={key} href={`${DOC_ROOT}${key}/`} aria-current={topic === key ? "page" : undefined}>{topics[key].title}</Link>)}
    </nav>
    <nav className={styles.toc} aria-label="このページの目次"><p className={styles.navLabel}>このページ</p>{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
  </>;
}

function SystemMap() {
  return <figure className={styles.systemMap}>
    <figcaption><span>構成図</span>講義状態・AI処理・資料配信の経路</figcaption>
    <div className={styles.interfaces}>
      <div><strong>教員</strong><span>講義の進行・資料公開・AI操作</span></div>
      <div><strong>学生</strong><span>資料閲覧・投票・コメント</span></div>
      <div><strong>Display</strong><span>教室への投影</span></div>
    </div>
    <p className={styles.mapCaption}>ブラウザ / React・Vite（Cloudflare Pagesから配信）</p>
    <div className={styles.lanes}>
      <div className={styles.lane}><p className={styles.laneLabel}>講義状態</p><span className={styles.connector}>認証・RPC / 通知</span><strong>Supabase</strong><p>Auth / PostgreSQL / Realtime</p><span className={styles.nodeDetail}>所有権・講義状態・バージョン<br />Displayへの通知</span></div>
      <div className={styles.lane}><p className={styles.laneLabel}>管理操作・AI</p><span className={styles.connector}>認証済みの要求</span><strong>Edge Functions</strong><p>DBで認可・実行枠を確認</p><span className={styles.connector}>許可された外部呼び出し</span><strong>AI・文献検索API</strong></div>
      <div className={styles.lane}><p className={styles.laneLabel}>資料・アーカイブ</p><span className={styles.connector}>有効範囲を限定したアクセス</span><strong>Cloudflare Worker</strong><p>アクセス検証・部分配信</p><span className={styles.connector}>オブジェクトの読み書き</span><strong>Private R2</strong></div>
    </div>
    <div className={styles.localPath}><span>Windows連携</span><p>PowerPoint → Presenter Bridge → Gateway / Edge Functions → 講義のページ位置</p></div>
    <p className={styles.figureNote}>PDFの本文はWorkerへ直接送信します。公開用のチケットはEdge Functionsが発行します。字幕の音声は教員ブラウザからAIプロバイダーへ送られ、上図のDB経路には流れません。</p>
  </figure>;
}

function Overview() {
  return <>
    <Section id="architecture" title="システム構成">
      <p>講義中、教員はページを進め、学生は投票やコメントを返します。Displayには教室全体で見る情報を表示します。これらの画面は同じ講義に接続しますが、必要な情報も、許可される操作も異なります。</p>
      <p>PostgreSQLが講義状態と権限の基準を持ち、ブラウザはその状態を取得して表示します。AIへの要求とPDFの転送は、それぞれ別の経路で処理します。</p>
      <SystemMap />
      <p>この分担によって、PDFの大きなデータを状態同期の経路へ流さず、AIの実行条件も画面の状態とは別に検証できます。経路は分かれていますが、認証や講義状態を担うSupabaseは共通の依存先です。</p>
    </Section>
    <Section id="decisions" title="設計の要点">
      <p>機能を同じ画面に並べるだけでは、通信断や再操作が起きたときに状態が食い違います。講義の進行に関わる処理には、次のような制御を設けています。</p>
      <div className={styles.topicList}>
        <Link href={`${DOC_ROOT}architecture/`}><span className={styles.topicNumber}>01</span><div><h3>通知を受け取れなくても、現在の状態に戻れる</h3><p>通常の状態取得とDisplay向けの通知を併用。講義の終了はサーバー側でも判定します。</p><span className={styles.readLink}>講義状態と同期を読む →</span></div></Link>
        <Link href={`${DOC_ROOT}ai/`}><span className={styles.topicNumber}>02</span><div><h3>AIの実行前に、権限と利用枠を確保する</h3><p>許可、費用、同時実行、外部APIへの送信を別々に管理し、再操作による重複実行を抑えます。</p><span className={styles.readLink}>AI機能と実行制御を読む →</span></div></Link>
        <Link href={`${DOC_ROOT}delivery/`}><span className={styles.topicNumber}>03</span><div><h3>PDFの保存と、学生への公開を分ける</h3><p>公開までの段階とファイルの世代を管理。PowerPointとの連携では、古いページ更新を送り続けないようにします。</p><span className={styles.readLink}>資料配信と連携を読む →</span></div></Link>
        <Link id="security" href={`${DOC_ROOT}security/`}><span className={styles.topicNumber}>04</span><div><h3>登録不要の参加でも、操作の所有者を区別する</h3><p>学生の投稿・回答を匿名認証のIDに結び付け、教員や投影画面とは権限を分離します。</p><span className={styles.readLink}>認証とデータ管理を読む →</span></div></Link>
      </div>
    </Section>
    <Section id="stack" title="実行環境と役割">
      <Table columns={["実行環境", "担当する処理"]} rows={[
        ["React / TypeScript / Vite", "教員・学生・Display・アーカイブの画面。PDF.jsによる資料表示、ブラウザのマイク操作、状態の取得と反映。"],
        ["Supabase Auth / PostgreSQL", "認証、投稿・回答の所有権、講義の状態遷移、RLS・RPCによる認可、AI利用量の台帳。"],
        ["Supabase Edge Functions / Deno", "管理操作、AIの実行許可と外部API呼び出し、資料公開の調整。"],
        ["Cloudflare Pages / Workers / R2", "画面の静的配信、非公開PDFの転送とRange配信、講義後アーカイブの配信。"],
        [".NET / C# / PowerPoint", "Windows側のスライド位置の観測、Web側との対応付け、権限を限定した連携。"]
      ]} />
      <Note>この資料で説明する本体はReact / Viteで実装されています。いま閲覧している技術資料・紹介サイトは、別リポジトリのNext.js静的サイトです。</Note>
    </Section>
    <Section id="codebase" title="実装を読む">
      <p>各詳細ページの末尾から、説明に対応するソースへ進めます。リンクは確認時のコミットに固定しているため、本文と実装を同じ時点で比較できます。</p>
      <div className={styles.referenceBlock}><a href="https://github.com/genellect/compass-interactive" target="_blank" rel="noopener noreferrer">genellect/compass-interactive ↗</a><p>Webアプリ、SQL、Edge Functions、Worker、Presenter Bridgeの公開ソース。利用条件はリポジトリのLICENSEを参照してください。</p></div>
      <div id="verification"><Note>本資料は公開ソース上の実装を説明しています。収容人数や遅延の保証、個別環境での提供状況を示すものではありません。</Note></div>
      <span id="classroom-validation" className={styles.anchor} />
    </Section>
    <Section id="developer-profile" title="設計・開発">
      <p>松井優知 / Yuto Matsui</p>
      <p>プロダクト設計、Web・データベース・Windows連携の実装を担当。集団指導と大学TAの経験をもとに、既存の講義資料を使いながら学生の反応を扱えるワークフローを設計しています。</p>
      <a href="https://github.com/genellect" target="_blank" rel="noopener noreferrer" aria-label="Yuto MatsuiのGitHubポートフォリオを新しいタブで開く">GitHub Portfolio ↗</a>
      <div id="developer-final" className={styles.nextSteps}><Link href={`${DOC_ROOT}architecture/`}>講義状態と同期を読む →</Link><a href="https://compass-interactive.pages.dev/demo" target="_blank" rel="noopener noreferrer">操作デモを開く ↗</a></div>
      <Note>操作デモは外部バックエンドに接続せず、画面と操作の流れを確認できる環境です。</Note>
    </Section>
  </>;
}

export function EngineeringDocs({ topic }: { topic?: Topic }) {
  const title = topic ? topics[topic].title : "システム構成と設計";
  const index = topic ? topicKeys.indexOf(topic) : -1;
  const next = topicKeys[index + 1];
  return <div className={styles.page}>
    <a className={styles.skipLink} href="#developer-main">本文へスキップ</a>
    <header className={styles.header}><div className={styles.headerInner}>
      <Link href={DOC_ROOT} className={styles.brand}><span className={styles.brandMark} aria-hidden="true">C</span><span>COMPASS Interactive<span className={styles.brandSub}>技術資料</span></span></Link>
      <nav aria-label="関連ページ" className={styles.headerLinks}><Link href="/INTRO_Interactive/">製品紹介</Link><a href="https://github.com/genellect/compass-interactive" target="_blank" rel="noopener noreferrer">GitHub ↗</a></nav>
    </div></header>
    <div className={styles.layout}>
      <aside className={styles.sidebar}><Contents topic={topic} /></aside>
      <div className={styles.mainColumn}>
        <details className={styles.mobileContents}><summary>目次・技術資料一覧</summary><Contents topic={topic} /></details>
        <main id="developer-main" className={styles.article}>
          <header id="developer-top" className={styles.pageIntro}>
            <p className={styles.breadcrumb}><Link href={DOC_ROOT}>技術資料</Link><span aria-hidden="true"> / </span>{topic ? title : "概要"}</p>
            <h1>{title}</h1>
            <p className={styles.lead}>{topic ? topics[topic].description : "資料表示、投票、コメント、字幕、AI支援を、講義の進行に合わせて扱う。そのための状態管理と、ブラウザ・サーバー・Windows連携の役割を説明します。"}</p>
            <p className={styles.revision}>公開ソース確認：2026年9月29日<span>本体 <a href={`https://github.com/genellect/compass-interactive/tree/${REVISION}`} target="_blank" rel="noopener noreferrer">{REVISION.slice(0, 7)}</a></span></p>
          </header>
          {!topic && <Overview />}
          {topic === "architecture" && <ArchitectureArticle />}
          {topic === "ai" && <AiArticle />}
          {topic === "delivery" && <DeliveryArticle />}
          {topic === "security" && <SecurityArticle />}
          {topic && <nav className={styles.pageNavigation} aria-label="前後の資料">
            <Link href={index > 0 ? `${DOC_ROOT}${topicKeys[index - 1]}/` : DOC_ROOT}><span>前の資料</span>{index > 0 ? topics[topicKeys[index - 1]].title : "技術概要"}</Link>
            {next && <Link href={`${DOC_ROOT}${next}/`}><span>次の資料</span>{topics[next].title} →</Link>}
          </nav>}
        </main>
        <footer className={styles.footer}><p>COMPASS Interactive · 技術資料</p><div><Link href="/INTRO_Interactive/">製品紹介</Link><a href="https://compass-interactive.pages.dev/demo" target="_blank" rel="noopener noreferrer">操作デモ ↗</a><a href="#developer-top">ページ上部へ ↑</a></div><small>© 2026 COMPASS</small></footer>
      </div>
    </div>
  </div>;
}

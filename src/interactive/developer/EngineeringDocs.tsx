import type { Metadata } from "next";
import Link from "next/link";
import { REVISION, Section, Table } from "./DocPrimitives";
import { SecurityArticle } from "./TopicArticles";
import { ArchitectureArticle } from "./SynchronizationArticle";
import { AiArticle, DeliveryArticle } from "./ExternalServicesArticles";
import { DeveloperArticle } from "./DeveloperArticle";
import { ArchiveArticle } from "./ArchiveArticle";
import { ArchitectureMap } from "./MechanismFigures";
import styles from "./engineering-docs.module.css";

export const DOC_ROOT = "/INTRO_Interactive/developers/";
export const topics = {
  architecture: { title: "講義状態と同期", description: "投票・資料ページの共有、参加と終了の競合、Displayの描画確認。", sections: [["state", "講義状態の管理"], ["lifecycle", "トランザクションと講義終了"], ["recovery", "状態の配信と再同期"], ["display", "Displayの描画確認"], ["capacity", "読み取り負荷の制御"]] },
  delivery: { title: "資料配信とPowerPoint連携", description: "PDFの公開と通信失敗からの復旧、PowerPointの現在位置への追従。", sections: [["path", "資料の配信経路"], ["publication", "資料の公開手順"], ["consistency", "DBとR2の整合性"], ["presenter", "PowerPoint連携"]] },
  ai: { title: "AI機能と実行制御", description: "資料分析の再要求、字幕の開始と停止、学術回答の出典検査。", sections: [["features", "AI処理の構成"], ["dispatch", "実行許可と利用量管理"], ["admission", "字幕セッションの制御"], ["evidence", "学術回答の生成と公開"]] },
  security: { title: "認証とデータ管理", description: "QR参加と教員の認証、データへのアクセス権と保存先。", sections: [["identity", "認証と講義への参加"], ["authorization", "サーバー側の認可"], ["data", "データの保存と外部送信"], ["future", "今後の開発範囲"]] },
  developer: { title: "開発者", description: "Yuto Matsui｜開発者・プロダクト設計者", sections: [["profile", "開発者紹介"]] },
  archive: { title: "アーカイブ", description: "", sections: [["judges", "審査員の方へ"]] }
} as const;
export type Topic = keyof typeof topics;
const detailDescriptions: Partial<Record<Topic, string>> = {
  architecture: "教員・学生・Displayが共有する講義状態の管理。DBトランザクション、スナップショット配信、再同期、描画確認の仕組み。",
  delivery: "PostgreSQLとPrivate R2による資料配信。PDFの公開手順、DBとR2の整合性、PowerPointからのページ同期。",
  ai: "字幕・要約・資料分析・学術回答の構成。外部APIの実行許可、利用量管理、字幕セッションの制御。",
  security: "学生の匿名参加と教員認証。講義へのアクセス判定、データの保存先、外部APIへ送信する情報。"
};
const topicKeys = Object.keys(topics) as Topic[];
const overviewSections = [["architecture", "システム構成"], ["runtime", "実行環境"], ["documents", "設計と実装"]] as const;

export function engineeringMetadata(topic?: Topic): Metadata {
  const title = topic ? topics[topic].title : "システム構成";
  const description = topic === "archive" ? "審査員向けに保存した8月時点の開発者ページ。" : topic ? detailDescriptions[topic] ?? topics[topic].description : "COMPASS Interactiveのシステム構成。講義状態の同期、DBとR2をまたぐ資料公開、AI実行制御、認証とデータ管理を現行ソースに基づいて解説。";
  const url = topic ? `${DOC_ROOT}${topic}/` : DOC_ROOT;
  return { title: `${title} | COMPASS Interactive 開発者向け技術情報`, description, alternates: { canonical: url }, openGraph: { title: `${title} | COMPASS Interactive`, description, url, type: "website", locale: "ja_JP", siteName: "COMPASS Interactive" }, twitter: { card: "summary_large_image", title: `${title} | COMPASS Interactive`, description } };
}
function Contents({ topic }: { topic?: Topic }) {
  const sections = topic ? topics[topic].sections : overviewSections;
  return <>
    <nav className={styles.documentNav} aria-label="開発者向け技術情報"><p className={styles.navLabel}>開発者向け技術情報</p><Link href={DOC_ROOT} aria-current={!topic ? "page" : undefined}>システム構成</Link>{topicKeys.map(key => <Link key={key} href={`${DOC_ROOT}${key}/`} aria-current={topic === key ? "page" : undefined}>{topics[key].title}</Link>)}</nav>
    <nav className={styles.toc} aria-label="このページの目次"><p className={styles.navLabel}>このページ</p>{sections.map(([id,label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
  </>;
}
function Overview() {
  return <>
    <section id="architecture" aria-label="システム構成" className={styles.overviewDiagram}><ArchitectureMap /></section>
    <Section id="runtime" title="実行環境">
      <Table columns={["環境", "担当する処理"]} rows={[
        ["React / Vite", "ブラウザでの画面表示、PDF描画、マイク・WebRTC、文字起こしのローカル保存。Cloudflare Pagesから静的配信。"],
        ["Supabase", "Authによる認証、PostgreSQLの講義データ・RLS・RPC、Edge FunctionsによるAI処理と資料公開の認可。"],
        ["Cloudflare Workers / R2", "PDFの受信・公開状態管理、認可付き配信、講義後アーカイブ。"],
        [".NET / C#", "Windows上でのPowerPoint観測、資料の対応付け、ページ更新の送信。"]
      ]} />
      <details className={styles.supplement}><summary>本体でReact / Viteを採用する構成上の理由</summary><p>PDF描画、音声取得、状態同期はブラウザ上で継続して動作する。認証・DB操作・外部APIには独立したバックエンドがあるため、画面にSSR用サーバーを設けず配信できる。Next.jsでも同様の構成は可能だが、現行の役割分担ではSSRを導入する必然性は低い。この紹介サイト自体は、別リポジトリのNext.js静的出力である。</p></details>
    </Section>
    <Section id="documents" title="設計と実装"><div className={styles.documentIndex}>{topicKeys.filter(key => key !== "archive").map(key => <Link href={`${DOC_ROOT}${key}/`} key={key}><strong>{topics[key].title}</strong><span>{topics[key].description}</span><span aria-hidden="true">→</span></Link>)}</div></Section>
  </>;
}
export function EngineeringDocs({ topic }: { topic?: Topic }) {
  const title = topic ? topics[topic].title : "システム構成";
  const index = topic ? topicKeys.indexOf(topic) : -1;
  const next = topicKeys[index + 1];
  return <div className={styles.page}>
    <a className={styles.skipLink} href="#developer-main">本文へスキップ</a>
    <header className={styles.header}><div className={styles.headerInner}><Link href={DOC_ROOT} className={styles.brand}>COMPASS Interactive<span>開発者向け技術情報</span></Link><nav aria-label="関連ページ" className={styles.headerLinks}><Link href={`${DOC_ROOT}developer/`}>開発者</Link><Link href="/INTRO_Interactive/">製品紹介</Link><a href="https://github.com/genellect/compass-interactive">GitHub ↗</a></nav></div></header>
    <div className={styles.layout}><aside className={styles.sidebar}><Contents topic={topic} /></aside><div className={styles.mainColumn}>
      <details className={styles.mobileContents}><summary>目次・ページ一覧</summary><Contents topic={topic} /></details>
      <main id="developer-main" tabIndex={-1} className={styles.article}>
        <header id="developer-top" className={styles.pageIntro}><p className={styles.breadcrumb}>{topic ? <Link href={DOC_ROOT}>開発者向け技術情報 / システム構成</Link> : "COMPASS Interactive / 開発者向け技術情報"}</p><div className={styles.introTitleRow}><h1>{title}</h1>{!topic && <Link className={styles.archiveCallout} href={`${DOC_ROOT}archive/2026-08/`}><strong>審査員の方へ</strong><span>8月時点のアーカイブはこちら</span></Link>}</div>{topic === "developer" && <p className={styles.lead}>{topics[topic].description}</p>}</header>
        {!topic && <Overview />}{topic === "architecture" && <ArchitectureArticle />}{topic === "ai" && <AiArticle />}{topic === "delivery" && <DeliveryArticle />}{topic === "security" && <SecurityArticle />}{topic === "developer" && <DeveloperArticle />}{topic === "archive" && <ArchiveArticle />}
        <nav className={styles.pageNavigation} aria-label="前後のページ">{topic && <Link href={index > 0 ? `${DOC_ROOT}${topicKeys[index - 1]}/` : DOC_ROOT}>← {index > 0 ? topics[topicKeys[index - 1]].title : "システム構成"}</Link>}{next && <Link href={`${DOC_ROOT}${next}/`}>{topics[next].title} →</Link>}</nav>
      </main>
      <footer className={styles.footer}><p>実装参照：<a href={`https://github.com/genellect/compass-interactive/tree/${REVISION}`}>compass-interactive@{REVISION.slice(0,7)}</a> · 2026年9月29日</p><div><Link href={`${DOC_ROOT}developer/`}>開発者</Link><Link href={`${DOC_ROOT}archive/`}>アーカイブ</Link><Link href="/INTRO_Interactive/">製品紹介</Link><a href="#developer-top">ページ上部へ ↑</a></div></footer>
    </div></div>
  </div>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { REVISION, Section, Table } from "./DocPrimitives";
import { ArchitectureArticle, AiArticle, DeliveryArticle, SecurityArticle } from "./TopicArticles";
import { DeveloperArticle } from "./DeveloperArticle";
import { ArchitectureMap } from "./MechanismFigures";
import styles from "./engineering-docs.module.css";

export const DOC_ROOT = "/INTRO_Interactive/developers/";
export const topics = {
  architecture: { title: "講義状態と同期", description: "投票・コメント・資料のページ位置をDBで確定し、学生端末とDisplayへ反映する。", sections: [["state", "同期プロトコル"], ["capacity", "同時参加と負荷"], ["recovery", "遅延・切断からの復帰"], ["lifecycle", "講義の終了"]] },
  delivery: { title: "資料配信とPowerPoint連携", description: "PDFの公開手順と、PowerPointから講義へのページ同期。", sections: [["path", "配信経路"], ["publication", "公開トランザクション"], ["presenter", "ページ位置の送信"]] },
  ai: { title: "AI機能と実行制御", description: "機能別の入出力、実行権限、送信記録と費用の確定。", sections: [["features", "機能とデータ"], ["dispatch", "実行と再要求"], ["admission", "停止との競合"], ["evidence", "学術回答の検査"]] },
  security: { title: "認証とデータ管理", description: "利用者ごとの操作権限、保存先、外部サービスへの送信。", sections: [["identity", "利用者と権限"], ["data", "保存と外部送信"], ["future", "今後の開発範囲"]] },
  developer: { title: "開発者", description: "Yuto Matsui｜開発者・プロダクト設計者", sections: [["profile", "開発者紹介"]] }
} as const;
export type Topic = keyof typeof topics;
const topicKeys = Object.keys(topics) as Topic[];
const overviewSections = [["architecture", "システム構成"], ["boundaries", "状態と整合性の境界"], ["documents", "設計と実装"], ["runtime", "実行環境"]] as const;

export function engineeringMetadata(topic?: Topic): Metadata {
  const title = topic ? topics[topic].title : "システム構成";
  const description = topic ? topics[topic].description : "COMPASS Interactiveのシステム構成。講義状態の同期、DBとR2をまたぐ資料公開、AI実行制御、認証とデータ管理を現行ソースに基づいて解説。";
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
    <Section id="boundaries" title="状態と整合性の境界">
      <p>資料の現在ページ、投票、コメント、字幕・要約を、講義IDに紐付けて管理する。PostgreSQLで更新を確定し、学生端末とDisplayが必要な状態を取得する。</p>
      <Table columns={["境界", "確定するもの", "反映・復旧の方法"]} rows={[
        ["DB内", "投稿・回答、集計値、項目別バージョン", "DBトランザクションで更新。端末はバージョンを照合して取得し、古い応答を棄却する。"],
        ["DB ↔ R2", "PDFの公開対象・アクセス世代", "公開ジョブとWorker台帳を段階的に更新。世代とETagで、遅延した要求による上書きを防ぐ。"],
        ["DB ↔ AI API", "利用枠、送信権、利用量", "開始要求に送信記録を結び付け、再要求時には同じ処理の送信を許可しない。"]
      ]} />
      <p className={styles.caption}>端末同期はDBの確定状態へ非同期に追従する。PDF公開と外部AIの実行は、単一DBのトランザクション外にある処理として管理する。</p>
    </Section>
    <Section id="documents" title="設計と実装"><div className={styles.documentIndex}>{topicKeys.map(key => <Link href={`${DOC_ROOT}${key}/`} key={key}><strong>{topics[key].title}</strong><span>{topics[key].description}</span><span aria-hidden="true">→</span></Link>)}</div></Section>
    <Section id="runtime" title="実行環境">
      <Table columns={["環境", "担当する処理"]} rows={[
        ["React / Vite", "ブラウザでの画面表示、PDF描画、マイク・WebRTC、文字起こしのローカル保存。Cloudflare Pagesから静的配信。"],
        ["Supabase", "Authによる認証、PostgreSQLの講義データ・RLS・RPC、Edge FunctionsによるAI処理と資料公開の認可。"],
        ["Cloudflare Workers / R2", "PDFの受信・公開状態管理、認可付き配信、講義後アーカイブ。"],
        [".NET / C#", "Windows上でのPowerPoint観測、資料の対応付け、ページ更新の送信。"]
      ]} />
      <details className={styles.supplement}><summary>本体でReact / Viteを採用する構成上の理由</summary><p>PDF描画、音声取得、状態同期はブラウザ上で継続して動作する。認証・DB操作・外部APIには独立したバックエンドがあるため、画面にSSR用サーバーを設けず配信できる。Next.jsでも同様の構成は可能だが、現行の役割分担ではSSRを導入する必然性は低い。この紹介サイト自体は、別リポジトリのNext.js静的出力である。</p></details>
    </Section>
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
        <header id="developer-top" className={styles.pageIntro}><p className={styles.breadcrumb}>{topic ? <Link href={DOC_ROOT}>開発者向け技術情報 / システム構成</Link> : "COMPASS Interactive / 開発者向け技術情報"}</p><h1>{title}</h1><p className={styles.lead}>{topic ? topics[topic].description : "講義の進行、学生の回答、資料のページ位置を共有する、ブラウザベースの授業支援システム。"}</p></header>
        {!topic && <Overview />}{topic === "architecture" && <ArchitectureArticle />}{topic === "ai" && <AiArticle />}{topic === "delivery" && <DeliveryArticle />}{topic === "security" && <SecurityArticle />}{topic === "developer" && <DeveloperArticle />}
        <nav className={styles.pageNavigation} aria-label="前後のページ">{topic && <Link href={index > 0 ? `${DOC_ROOT}${topicKeys[index - 1]}/` : DOC_ROOT}>← {index > 0 ? topics[topicKeys[index - 1]].title : "システム構成"}</Link>}{next && <Link href={`${DOC_ROOT}${next}/`}>{topics[next].title} →</Link>}</nav>
      </main>
      <footer className={styles.footer}><p>実装参照：<a href={`https://github.com/genellect/compass-interactive/tree/${REVISION}`}>compass-interactive@{REVISION.slice(0,7)}</a> · 2026年9月29日</p><div><Link href={`${DOC_ROOT}developer/`}>開発者</Link><Link href="/INTRO_Interactive/">製品紹介</Link><a href="#developer-top">ページ上部へ ↑</a></div></footer>
    </div></div>
  </div>;
}

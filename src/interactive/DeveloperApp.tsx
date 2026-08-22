import Image from "next/image";
import { Children, type ReactNode } from "react";
import { Footer } from "./components/layout/Footer";
import { Header } from "./components/layout/Header";
import { links } from "./content/interactiveContent";
import {
  architectureLayers,
  ciJobs,
  codebaseMetrics,
  developerPrinciples,
  directoryRows,
  ownershipItems,
  roleMatrix,
  selectedDecisions,
  stackMetrics,
  technologyHighlights,
  technologyStack,
  threatMatrix,
  verificationRows
} from "./content/developerPortfolioContent";
import { DeveloperProfile } from "./sections/DeveloperProfile";

type SectionHeadingProps = {
  id: string;
  eyebrow: string;
  title: string;
  children?: ReactNode;
  disclosureLabel?: string;
};

function SectionHeading({ id, eyebrow, title, children, disclosureLabel }: SectionHeadingProps) {
  const copy = Children.toArray(children);

  return (
    <header className="developer-section-heading">
      <p className="developer-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {copy.length > 0 && (
        <div className="developer-section-heading__copy">
          {disclosureLabel && copy.length > 1 ? (
            <>
              {copy[0]}
              <details className="developer-section-disclosure">
                <summary>{disclosureLabel}<span aria-hidden="true" /></summary>
                <div>{copy.slice(1)}</div>
              </details>
            </>
          ) : copy}
        </div>
      )}
    </header>
  );
}

function Paragraphs({ copy }: { copy: string }) {
  return <>{copy.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</>;
}

function DisclosureParagraphs({ copy, summary }: { copy: string; summary: string }) {
  const paragraphs = copy.split("\n\n");

  return (
    <>
      <p>{paragraphs[0]}</p>
      {paragraphs.length > 1 && (
        <details className="developer-card-disclosure">
          <summary>{summary}<span aria-hidden="true" /></summary>
          <div>{paragraphs.slice(1).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        </details>
      )}
    </>
  );
}

function DeveloperLiveSystemGraphic() {
  return (
    <div className="developer-system-graphic" role="img" aria-label="Student、Educator、Display、Reviewが一つの講義状態へ同期するリアルタイム基盤">
      <svg className="developer-system-graphic__field" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="developer-core-glow">
            <stop offset="0" stopColor="#73e7ff" stopOpacity="0.25" />
            <stop offset="0.52" stopColor="#7c3aed" stopOpacity="0.08" />
            <stop offset="1" stopColor="#050a14" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="developer-signal-line" x1="0" x2="1">
            <stop offset="0" stopColor="#73e7ff" stopOpacity="0.08" />
            <stop offset="0.48" stopColor="#73e7ff" stopOpacity="0.88" />
            <stop offset="1" stopColor="#91efc1" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <circle cx="320" cy="320" r="286" fill="url(#developer-core-glow)" />
        <circle className="developer-system-graphic__orbit developer-system-graphic__orbit--outer" cx="320" cy="320" r="266" />
        <circle className="developer-system-graphic__orbit developer-system-graphic__orbit--middle" cx="320" cy="320" r="202" />
        <circle className="developer-system-graphic__orbit developer-system-graphic__orbit--inner" cx="320" cy="320" r="132" />
        <path className="developer-system-graphic__signal developer-system-graphic__signal--one" d="M100 166 C190 210 222 247 320 320 C420 392 462 438 548 478" />
        <path className="developer-system-graphic__signal developer-system-graphic__signal--two" d="M548 166 C454 215 420 248 320 320 C220 392 180 430 92 478" />
        <path className="developer-system-graphic__signal developer-system-graphic__signal--three" d="M320 70 C320 162 320 224 320 320 C320 418 320 478 320 566" />
        <g className="developer-system-graphic__pulse developer-system-graphic__pulse--one"><circle cx="100" cy="166" r="5" /></g>
        <g className="developer-system-graphic__pulse developer-system-graphic__pulse--two"><circle cx="548" cy="166" r="5" /></g>
        <g className="developer-system-graphic__pulse developer-system-graphic__pulse--three"><circle cx="320" cy="70" r="5" /></g>
        <g className="developer-system-graphic__pulse developer-system-graphic__pulse--four"><circle cx="548" cy="478" r="5" /></g>
      </svg>

      <div className="developer-system-graphic__core">
        <span><i /> LIVE STATE</span>
        <strong>COMPASS</strong>
        <small>LECTURE CORE</small>
        <b>v.221</b>
      </div>

      <div className="developer-system-node developer-system-node--student">
        <span>01 / INPUT</span><strong>STUDENT</strong><small>join · poll · voice</small>
      </div>
      <div className="developer-system-node developer-system-node--educator">
        <span>02 / CONTROL</span><strong>EDUCATOR</strong><small>state · material · AI</small>
      </div>
      <div className="developer-system-node developer-system-node--display">
        <span>03 / OUTPUT</span><strong>DISPLAY</strong><small>slide · caption · signal</small>
      </div>
      <div className="developer-system-node developer-system-node--review">
        <span>04 / MEMORY</span><strong>REVIEW</strong><small>recap · evidence · archive</small>
      </div>

      <div className="developer-system-graphic__rail" aria-hidden="true">
        <span>POSTGRES / RLS</span><i />
        <span>EDGE / R2</span><i />
        <span>.NET BRIDGE</span>
      </div>

      <div className="developer-system-graphic__telemetry" aria-hidden="true">
        <div><span>SYNC</span><strong>5 sec</strong></div>
        <div><span>SURFACES</span><strong>4</strong></div>
        <div><span>STATE</span><strong>LIVE</strong></div>
      </div>
    </div>
  );
}

function TechnologyShowcase() {
  return (
    <div className="developer-stack__showcase" aria-label="主要技術基盤">
      {technologyHighlights.map((technology) => (
        <article key={technology.name}>
          <div className="developer-stack__logo">
            <Image src={technology.logo} alt="" width={58} height={58} aria-hidden="true" />
          </div>
          <div>
            <span>{technology.role}</span>
            <h3>{technology.name}</h3>
            <p>{technology.detail}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function DeveloperApp() {
  return (
    <div className="developer-page developer-portfolio-page">
      <a className="skip-link" href="#developer-main">本文へスキップ</a>
      <Header variant="developer" />

      <main id="developer-main">
        <section id="developer-top" className="developer-reframe-hero" aria-labelledby="developer-title">
          <div className="developer-shell developer-hero__grid">
            <div className="developer-hero__content">
              <p className="developer-eyebrow">COMPASS INTERACTIVE / ENGINEERING CASE STUDY</p>
              <h1 id="developer-title"><span>One real-time foundation</span><span>for the entire lecture.</span></h1>
              <div className="developer-hero__lead">
                <p>参加、同期、理解、振り返りまで。講義中に分断されていた体験を、ひとつのリアルタイム基盤に統合しました。</p>
                <p>React UI、PostgreSQL / RLS、Edge Functions、Private R2、Windows Presenter Bridge、CIまで、プロダクト全体をエンドツーエンドで設計・実装しています。</p>
              </div>
              <p className="developer-hero__status"><i />β版完成 · 30人規模実講義でのβ版テストを通過 · DEVELOPER: YUTO MATSUI</p>
              <div className="developer-hero__actions">
                <a className="developer-button developer-button--primary" href={links.demo}>講義デモを開く <span aria-hidden="true">↗</span></a>
                <a className="developer-button developer-button--secondary" href="#architecture">Architectureを見る <span aria-hidden="true">↓</span></a>
              </div>
            </div>
            <DeveloperLiveSystemGraphic />
          </div>
        </section>

        <section id="stack" className="developer-section developer-stack" aria-labelledby="stack-title">
          <div className="developer-shell">
            <SectionHeading id="stack-title" eyebrow="TECHNOLOGY STACK / MULTI-RUNTIME SYSTEM" title="Web、DB、Edge、Windowsを、ひとつのコードベースでつなぐ。">
              <p>Reactの画面から、PostgreSQLの状態管理と認可、31のEdge Functions、Private R2による資料配信、.NET / C#のPowerPoint連携、ブラウザ・データベース・ネイティブのCIまで。</p>
              <p>異なる実行環境を、ひとつのリポジトリで一体として開発・検証しています。</p>
            </SectionHeading>
            <div className="developer-stack__metrics" aria-label="Engineering Snapshot">
              {stackMetrics.map((metric) => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}
            </div>
            <TechnologyShowcase />
            <h3 className="developer-table-title">Technology Stack</h3>
            <div className="developer-stack__grid">
              {technologyStack.map(([area, technology], index) => (
                <article key={area}><span>{String(index + 1).padStart(2, "0")} / {area}</span><strong>{technology}</strong></article>
              ))}
            </div>
            <p className="developer-snapshot">Snapshot: COMPASS Interactive v0.11.0 · main@eb12b48c · verified 2026-08-21</p>
          </div>
        </section>

        <section id="architecture" className="developer-section developer-architecture" aria-labelledby="architecture-title">
          <div className="developer-shell">
            <SectionHeading id="architecture-title" eyebrow="ARCHITECTURE" title="リアルタイム講義のためのアーキテクチャ。" disclosureLabel="障害分離と継続性の設計を読む">
              <p>COMPASS Interactiveは、講義状態、認可、AI処理、資料配信、PowerPoint連携を独立した処理経路に分けています。</p>
              <p>AIや外部APIの障害は、投票・資料閲覧・講義進行から分離。資料配信やPowerPoint連携に問題が起きても、講義状態と認証は維持されます。</p>
              <p>外部サービスを多用する構成でも、部分的な障害の影響範囲を限定し、主要な講義機能を継続できるよう設計しています。</p>
            </SectionHeading>
            <div className="developer-architecture__flow" aria-hidden="true">
              <span>STUDENT</span><i>→</i><span>POSTGRESQL / RLS</span><i>→</i><span>EDGE FUNCTIONS</span><i>→</i><span>PRIVATE R2 / .NET</span>
            </div>
            <div className="developer-architecture__grid">
              {architectureLayers.map((layer) => (
                <article key={layer.number}>
                  <header><span>{layer.number}</span><h3>{layer.title}</h3></header>
                  <Paragraphs copy={layer.body} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="developer-section developer-security" aria-labelledby="security-title">
          <div className="developer-shell">
            <SectionHeading id="security-title" eyebrow="SECURITY MODEL" title="匿名参加でも、権限は曖昧にしない。" disclosureLabel="教員認証の分離設計を読む">
              <p>学生は氏名や学籍番号を入力せず、通常のアカウント登録なしで参加できます。一方で、投稿や回答の所有権はSupabase Anonymous Authの <code>auth.uid()</code> に結び付け、操作のたびにRLSとRPCで権限を検証します。</p>
              <p>教員側はGoogle認証に加えてTOTPによるAAL2を要求し、学生用の認証とはクライアントと保存領域を分離します。</p>
            </SectionHeading>
            <div className="developer-table-wrap developer-table-wrap--roles">
              <table>
                <thead><tr><th scope="col">役割</th><th scope="col">認証</th><th scope="col">許可範囲</th><th scope="col">主な制御</th></tr></thead>
                <tbody>{roleMatrix.map((row) => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th scope="row" data-label="役割" key={cell}>{cell}</th> : <td data-label={["", "認証", "許可範囲", "主な制御"][index]} key={cell}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="developer-threat-heading">
              <p className="developer-eyebrow">THREAT / CONTROL / EVIDENCE</p>
              <h3>Threat / Control / Evidence</h3>
              <p>匿名参加、AI、非公開資料、PowerPoint連携を同じ講義システムに組み込む以上、利便性だけでなく、<strong>所有権・公開範囲・利用上限・操作権限をサーバー側で確定できること</strong>が重要です。</p>
              <p>COMPASS Interactiveでは、想定する脅威ごとに制御点を分け、その制御が実際に機能することまでテストで確認しています。</p>
            </div>
            <div className="developer-table-wrap developer-table-wrap--threats">
              <table>
                <thead><tr><th scope="col">想定する脅威</th><th scope="col">制御</th><th scope="col">守るもの</th><th scope="col">検証</th></tr></thead>
                <tbody>{threatMatrix.map((row) => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th scope="row" data-label="想定する脅威" key={cell}>{cell}</th> : <td data-label={["", "制御", "守るもの", "検証"][index]} key={cell}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="decisions" className="developer-section developer-decisions" aria-labelledby="decisions-title">
          <div className="developer-shell">
            <SectionHeading id="decisions-title" eyebrow="SELECTED DECISIONS" title="実運用の制約から選んだ、四つの設計判断。" disclosureLabel="失敗時まで含めた判断基準を読む">
              <p>リアルタイム講義では、通信の不安定さ、ブラウザの停止、外部API障害、同時実行、利用量の増加までを前提に設計する必要があります。</p>
              <p>COMPASS Interactiveでは、特に影響の大きい<strong>状態同期、講義終了、資料公開、AI実行</strong>について、通常系だけでなく失敗時の挙動まで設計しています。</p>
            </SectionHeading>
            <div className="developer-decisions__grid">
              {selectedDecisions.map((decision) => (
                <article key={decision.number}>
                  <header><span>{decision.number}</span><h3>{decision.title}</h3></header>
                  <div><h4>課題</h4><p>{decision.problem}</p></div>
                  <details className="developer-decision__details">
                    <summary>設計と検証を読む<span aria-hidden="true" /></summary>
                    <div><h4>設計</h4><Paragraphs copy={decision.design} /></div>
                    <div className="developer-decision__evidence"><h4>検証</h4><p>{decision.evidence}</p></div>
                  </details>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="verification" className="developer-section developer-verification" aria-labelledby="verification-title">
          <div className="developer-shell">
            <SectionHeading id="verification-title" eyebrow="VERIFICATION" title="UIからDB、認証、Windowsまでを対象にした検証基盤。">
              <p>正常系だけでなく、認可エラー、同時実行、通信失敗、DB更新、アップグレード、画面サイズ、x86 / x64の差異まで検証対象に含めています。</p>
            </SectionHeading>
            <p className="developer-last-verified"><span>Last verified</span><strong>main@eb12b48c</strong><span>2026-08-21</span><strong>5 core CI jobs passed</strong></p>
            <ol className="developer-ci-jobs">{ciJobs.map((job) => <li key={job}>{job}</li>)}</ol>
            <div className="developer-table-wrap developer-table-wrap--verification">
              <table>
                <thead><tr><th scope="col">対象</th><th scope="col">主な検証内容</th><th scope="col">検証基盤</th></tr></thead>
                <tbody>{verificationRows.map((row) => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th scope="row" data-label="対象" key={cell}>{cell}</th> : <td data-label={["", "主な検証内容", "検証基盤"][index]} key={cell}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <p className="developer-test-total"><strong>75 / 75</strong><span>non-live test groups passed</span></p>
          </div>
        </section>

        <section id="classroom-validation" className="developer-section developer-classroom" aria-labelledby="classroom-title">
          <div className="developer-shell">
            <SectionHeading id="classroom-title" eyebrow="CLASSROOM VALIDATION" title="約20名の複数端末βから、実講義での運用まで完走。">
              <p>自動テストに加え、複数端末βと実講義で主要フローを実地検証。端末差、画面共有、リアルタイム同期、講義進行を含む実環境で動作を通しました。</p>
            </SectionHeading>
            <div className="developer-classroom__timeline">
              <article><p>MULTI-DEVICE BETA</p><h3>2026-07-25 · 約20名</h3><span>01</span><p>複数端末から約20名が参加。講義コードによる参加、5秒同期、字幕、Live Poll、コメント、PDF表示、Educator操作、講義終了までの主要フローを完走しました。</p><p>Student、Educator、Displayを同一講義へ接続し、画面ごとの権限分離と状態同期を実機で検証しました。</p></article>
              <article><p>CLASSROOM OPERATION</p><h3>2026-08-21 · 実講義</h3><span>02</span><p>実講義で、画面共有、Educator操作、リアルタイム同期、講義開始から終了までの主要フローを運用しました。</p></article>
            </div>
          </div>
        </section>

        <section id="codebase" className="developer-section developer-codebase" aria-labelledby="codebase-title">
          <div className="developer-shell">
            <SectionHeading id="codebase-title" eyebrow="CODEBASE & OWNERSHIP" title="WebからWindowsまで、748ファイルを単一リポジトリで管理。" disclosureLabel="変更履歴の管理単位を読む">
              <p>React UI、PostgreSQL、Edge Functions、Cloudflare、Presenter Bridge、E2E、運用ドキュメントまでを一つのリポジトリに集約しています。</p>
              <p>機能ごとにディレクトリを分離し、実装だけでなく、対応するDB変更、テスト、運用手順まで同じ変更履歴で追跡できる構成です。</p>
            </SectionHeading>
            <div className="developer-codebase__metrics">{codebaseMetrics.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
            <div className="developer-table-wrap developer-table-wrap--directories">
              <table>
                <thead><tr><th scope="col">ディレクトリ</th><th scope="col">Files</th><th scope="col">主な役割</th></tr></thead>
                <tbody>{directoryRows.map((row) => <tr key={row[0]}><th scope="row" data-label="ディレクトリ"><code>{row[0]}</code></th><td data-label="Files">{row[1]}</td><td data-label="主な役割">{row[2]}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="developer-public-source">
              <p className="developer-eyebrow">PUBLIC SOURCE</p>
              <h3>Public Source</h3>
              <p>COMPASS PlatformとCOMPASS Interactiveは、それぞれ独立したGitHubリポジトリで公開しています。</p>
              <ul>
                <li><a href="https://github.com/genellect/compass">genellect/compass</a> — COMPASS公式Web、紹介Webページ、利用者運用基盤</li>
                <li><code>genellect/compass-interactive</code> — COMPASS Interactive本体</li>
              </ul>
              <p>COMPASS Interactiveでは、アプリケーション本体に加え、DBマイグレーション、Edge Functions、テスト、Windows Presenter Bridge、技術ドキュメントを公開します。</p>
              <p>本番環境の認証情報、シークレット、利用者データなど、公開すべきでない情報はリポジトリに含めません。</p>
            </div>
          </div>
        </section>

        <section id="developer-profile" className="developer-section developer-owner" aria-labelledby="owner-title">
          <div className="developer-shell">
            <SectionHeading id="owner-title" eyebrow="DEVELOPER" title="専門領域を超え、COMPASSシリーズを一つの体験で貫く。">
              <p>COMPASS Interactiveの設計には、ソフトウェア開発だけでは得られない複数の現場経験が重なっています。</p>
              <p>私は、学生エンジニアであると同時に、集団塾講師・大学TAとして教育現場に関わり、生命科学の実験研究にも取り組んできました。実務で英語を使い、薬学教育の課題を現役学生の立場として観察しながら、AIネイティブな開発では最新のコーディングエージェントを実装工程へ段階的に組み込んできました。</p>
              <p>教育する側と学ぶ側、研究する側と開発する側。その複数の視点が、教員の操作性、学生の参加体験、学術的根拠、検証可能性、AI活用まで、一見バラバラに見える1つ1つの専門性と経験が、COMPASS Interactive全体の製品価値につながっています。</p>
            </SectionHeading>
            <div className="developer-owner__principles">
              {developerPrinciples.map((principle) => <article key={principle.number}><header><span>{principle.number}</span><p>{principle.label}</p></header><h3>{principle.title}</h3><DisclosureParagraphs copy={principle.body} summary="経験と設計への反映を読む" /></article>)}
            </div>
            <div className="developer-ownership">
              <div><p className="developer-eyebrow">OWNERSHIP</p><h3>Ownership</h3><p>COMPASS Interactiveでは、以下の領域を開発者が一貫して担当しています。</p></div>
              <ul>{ownershipItems.map((item) => <li key={item}>{item}</li>)}</ul>
              <p>問題設定、アーキテクチャ、脅威モデル、受入基準、リリース判断までを開発者が担っています。AIコーディングエージェントは、実装探索、コード生成、レビュー、開発速度の向上に活用し、出力結果はすべて開発者の責任の下にレビュー、統合しました。</p>
            </div>
            <DeveloperProfile id="developer-identity" />
          </div>
        </section>

        <section id="developer-final" className="developer-section developer-final" aria-labelledby="final-title">
          <div className="developer-shell">
            <p className="developer-eyebrow">SEE THE SYSTEM IN MOTION</p>
            <h2 id="final-title">設計の答えは、動くプロダクトの中にある。</h2>
            <p>Student、Educator、Displayが同じ講義の中で連動し、参加、進行、同期、AI、終了までが一つの体験として動きます。</p>
            <p><strong>COMPASS Interactiveの全体像を、公開デモで確かめてください。</strong></p>
            <div className="developer-final__actions"><a href={links.demo}>実機デモを開く <span aria-hidden="true">↗</span></a><a href="#developer-top">ページ上部へ戻る ↑</a><a href="/">COMPASS全体を見る →</a></div>
          </div>
        </section>
      </main>

      <Footer variant="developer" />
    </div>
  );
}

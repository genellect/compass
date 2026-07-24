import { Footer } from "./components/layout/Footer";
import { Header } from "./components/layout/Header";
import { Reveal } from "./components/ui/Reveal";
import { Section } from "./components/ui/Section";
import { SectionHeader } from "./components/ui/SectionHeader";
import { developerMessagePages } from "./content/developerContent";
import {
  architectureBoundaries,
  designPrinciples,
  directoryMetrics,
  engineeringDesigns,
  guideTopics,
  operationalScope,
  qualityLayers,
  scaleStats,
  supportingStack,
  systemBoundaries,
  technologyStacks,
  validationSummary
} from "./content/developerReframeContent";
import { DeveloperMessageReader } from "./sections/DeveloperMessageReader";
import { DeveloperProfile } from "./sections/DeveloperProfile";

function ChapterMarker({ number, label }: { number: string; label: string }) {
  return (
    <div className="developer-reframe-chapter" aria-label={"Chapter " + number + ": " + label}>
      <span>{number}</span>
      <strong>{label}</strong>
    </div>
  );
}

export function DeveloperApp() {
  return (
    <div className="developer-page developer-page--reframed">
      <a className="skip-link" href="#developer-main">本文へスキップ</a>
      <Header variant="developer" />

      <main id="developer-main">
        <section id="developer-top" className="developer-reframe-hero" aria-labelledby="developer-title">
          <div className="developer-reframe-hero__grid" aria-hidden="true" />
          <div className="developer-reframe-hero__glow" aria-hidden="true" />
          <div className="developer-reframe-shell developer-reframe-hero__inner">
            <Reveal>
              <ChapterMarker number="01" label="IDEA" />
              <p className="developer-reframe-eyebrow">FOR DEVELOPERS</p>
              <h1 id="developer-title">学びの熱を、<br />設計で、<br />途切れさせない。</h1>
              <div className="developer-reframe-hero__copy">
                <p className="developer-reframe-hero__lead">講義を、参加・理解・対話がつながる体験へ。</p>
                <p>教育現場で継続的に使える実用性と、その体験を支えるUX、アーキテクチャ、セキュリティ、検証を、一つのシステムに統合した。</p>
              </div>
              <a className="developer-reframe-text-link" href="/INTRO_Interactive/">
                学生・教員向けページ <span aria-hidden="true">→</span>
              </a>
            </Reveal>
          </div>
        </section>

        <Section id="educational-design" className="developer-reframe-section developer-reframe-section--idea">
          <Reveal>
            <SectionHeader
              eyebrow="EDUCATIONAL DESIGN"
              title="専門領域を超え、COMPASSシリーズを一つの体験で貫く。"
            />
          </Reveal>
          <div className="developer-reframe-principles">
            {designPrinciples.map((principle, index) => (
              <Reveal delay={index * 55} key={principle.number}>
                <article className="developer-reframe-principle">
                  <header><span>{principle.number}</span><small>{principle.label}</small></header>
                  <h3>{principle.title}</h3>
                  <p>{principle.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </Section>

        <Section id="developer-message" className="developer-reframe-section developer-reframe-essay">
          <Reveal>
            <SectionHeader eyebrow="DEVELOPER MESSAGE" title="ESSAY: AI時代に、専門性を「実装」するということ" />
          </Reveal>
          <Reveal><DeveloperMessageReader pages={developerMessagePages} /></Reveal>
        </Section>

        <Section id="developer-guide" className="developer-reframe-section developer-reframe-guide">
          <Reveal>
            <ChapterMarker number="02" label="SYSTEM" />
            <SectionHeader
              eyebrow="TECHNICAL DEEP DIVE"
              title="体験を支える、技術と設計"
              lead="ここからは、COMPASS Interactiveの技術構成、設計判断、実装、検証について詳しくご紹介します。ソフトウェア開発や情報工学に関する専門用語を含む、開発者・技術者向けのセクションです。"
            />
          </Reveal>
          <Reveal>
            <nav className="developer-reframe-guide__topics" aria-label="技術解説の主題">
              {guideTopics.map((topic) => <span key={topic}>{topic}</span>)}
            </nav>
          </Reveal>
        </Section>

        <Section id="stack" className="developer-reframe-section developer-reframe-section--system">
          <Reveal>
            <SectionHeader
              eyebrow="TECHNOLOGY STACK"
              title="教育体験を支える、統合技術基盤"
              lead="ReactによるUIから、PostgreSQL、認証、リアルタイム通信、Private R2、AI、CI/E2Eまでを一つのアーキテクチャに統合。10万行を超える実装、テスト、設計資産を単一リポジトリで管理し、開発から検証、運用までを一貫して支えている。"
            />
          </Reveal>
          <div className="developer-reframe-stack">
            {technologyStacks.map((stack, index) => (
              <Reveal delay={(index % 3) * 45} key={stack.number}>
                <article><span>{stack.number}</span><div><p>{stack.label}</p><h3>{stack.technologies}</h3></div></article>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="developer-reframe-table-card">
              <h3>Supporting Stack</h3>
              <div className="developer-reframe-table-wrap">
                <table>
                  <thead><tr><th scope="col">Area</th><th scope="col">Technology / Method</th></tr></thead>
                  <tbody>{supportingStack.map((item) => <tr key={item.area}><th scope="row">{item.area}</th><td>{item.detail}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </Section>

        <Section id="stack-overview" className="developer-reframe-section developer-reframe-overview">
          <Reveal>
            <SectionHeader eyebrow="STACK OVERVIEW" title="UIから運用まで、一つのコードベースで貫く。" lead="React UI、PostgreSQL、26のEdge Functions、Private R2、E2E、Runbook。COMPASS Interactiveは、状態、認可、費用、障害、運用までを引き受ける一つのシステムである。" />
          </Reveal>
          <div className="developer-reframe-stats">
            {scaleStats.map((stat, index) => (
              <Reveal delay={index * 35} key={stat.label}>
                <div><strong>{stat.value}</strong><span>{stat.unit}</span><p>{stat.label}</p></div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="developer-reframe-table-card developer-reframe-table-card--directory">
              <div className="developer-reframe-table-card__heading"><h3>Directory Metrics</h3><p>2026年7月24日時点。生成物、依存パッケージ、テスト結果、ローカル資格情報を除外。</p></div>
              <div className="developer-reframe-table-wrap">
                <table>
                  <thead><tr><th scope="col">Directory</th><th scope="col">Files</th><th scope="col">Lines</th><th scope="col">Role</th></tr></thead>
                  <tbody>
                    {directoryMetrics.map((item) => (
                      <tr className={item.total ? "is-total" : undefined} key={item.area}>
                        <th scope="row">{item.area}</th><td>{item.files}</td><td>{item.lines}</td><td>{item.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </Section>

        <Section id="architecture" className="developer-reframe-section developer-reframe-architecture">
          <Reveal>
            <SectionHeader eyebrow="ARCHITECTURE OVERVIEW" title="教育体験を支える、五つの技術境界" lead="COMPASS Interactiveは、画面、データ、サーバー処理、資料配信、検証環境を、それぞれ独立した責務として分離しています。教育現場での使いやすさを保ちながら、認可、負荷、費用、障害、運用上のリスクを一つの場所へ集中させない構成です。" />
          </Reveal>
          <div className="developer-reframe-boundaries">
            {architectureBoundaries.map((boundary, index) => (
              <Reveal delay={index * 45} key={boundary.number}>
                <article><header><span>{boundary.number}</span><small>{boundary.label}</small></header><h3>{boundary.code}</h3><p>{boundary.body}</p></article>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="developer-reframe-system-map" aria-label="システム境界と責任">
              {systemBoundaries.map((item, index) => (
                <div key={item.boundary}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.boundary}</strong><p>{item.responsibility}</p></div>
              ))}
            </div>
          </Reveal>
          <Reveal>
            <p className="developer-reframe-architecture__note">この構成では、講義、コメント、Pollなどのデータ分類より先に、システム全体の責務境界を示します。個別機能ではなく、どこで状態を管理し、どこで認可し、どこで外部処理を行うのかを先に理解できる構成です。</p>
          </Reveal>
        </Section>

        <Section id="engineering-design" className="developer-reframe-section developer-reframe-engineering">
          <Reveal>
            <SectionHeader eyebrow="ENGINEERING DESIGN" title="教育上の要件を、壊れにくい構造へ" />
          </Reveal>
          <div className="developer-reframe-engineering__list">
            {engineeringDesigns.map((decision, index) => (
              <Reveal delay={index * 35} key={decision.number}>
                <article>
                  <header><span>{decision.number}</span><small>{decision.domain}</small></header>
                  <h3>{decision.title}</h3>
                  <div className="developer-reframe-engineering__copy">
                    <section><h4>MEANING</h4><p>{decision.meaning}</p></section>
                    <section><h4>DESIGN</h4><p>{decision.design}</p></section>
                  </div>
                  <ol className="developer-reframe-flow">{decision.flow.map((step) => <li key={step}>{step}</li>)}</ol>
                  <ul className="developer-reframe-tags">{decision.elements.map((element) => <li key={element}>{element}</li>)}</ul>
                  {decision.note && <p className="developer-reframe-engineering__note">{decision.note}</p>}
                </article>
              </Reveal>
            ))}
          </div>
        </Section>

        <Section id="quality-assurance" className="developer-reframe-section developer-reframe-quality">
          <Reveal>
            <ChapterMarker number="03" label="EVIDENCE / VALIDATION" />
            <SectionHeader eyebrow="QUALITY ASSURANCE" title="変更を、安心して積み重ねるために。" lead="COMPASS Interactiveでは、コード、データベース、ブラウザ、外部連携を横断して自動検証を行っています。正常な操作だけでなく、認可エラー、競合、通信失敗、マイグレーション、画面崩れなど、実運用で問題になり得る条件も検証対象に含めています。" />
          </Reveal>
          <div className="developer-reframe-quality__grid">
            {qualityLayers.map((layer, index) => (
              <Reveal delay={index * 45} key={layer.number}>
                <article><header><span>{layer.number}</span><h3>{layer.title}</h3></header><p>{layer.body}</p><ul>{layer.code.map((item) => <li key={item}>{item}</li>)}</ul></article>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="developer-reframe-validation-summary"><p>Validation Summary</p>{validationSummary.map((item) => <strong key={item}>{item}</strong>)}</div>
          </Reveal>
        </Section>

        <Section id="production-validation" className="developer-reframe-section developer-reframe-operation">
          <Reveal><SectionHeader eyebrow="OPERATIONAL VALIDATION" title="β版試験から、実際の講義運用まで。" /></Reveal>
          <div className="developer-reframe-operation__layout">
            <Reveal>
              <div className="developer-reframe-operation__copy">
                <p>COMPASS Interactiveは、協力者約20名が複数端末から参加するβ版E2E試験を通過しています。Student、Admin、Displayを同時に接続し、参加、5秒差分同期、字幕、クイズ、コメント、PDF表示、教員操作、講義終了までの一連のフローを確認しました。（2026年7月25日時点）</p>
                <p>さらに、実際の講義でも主要機能を運用しています。開発者自身が約200名規模の講義やプレゼンテーションで継続的に使用することを前提に、画面共有、教員操作、リアルタイム同期、講義ライフサイクルまで含めて設計しています。</p>
              </div>
            </Reveal>
            <Reveal delay={60}>
              <div className="developer-reframe-operation__scope"><p>Validation Scope</p><ul>{operationalScope.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </Reveal>
          </div>
        </Section>

        <DeveloperProfile />

      </main>

      <Footer variant="developer" />
    </div>
  );
}

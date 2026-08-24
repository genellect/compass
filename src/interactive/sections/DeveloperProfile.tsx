import Image from "next/image";
import { GitHubProfileLink } from "../../components/GitHubProfileLink";

type DeveloperProfileProps = {
  id?: string;
  showWebPortfolio?: boolean;
};

const focusAreas = [
  "AIネイティブな生命科学研究・研究DX",
  "フルスタックWeb・クラウド開発",
  "データ基盤・解析パイプラインの構築",
  "業務システム・自動化基盤の設計",
  "AI・エージェントシステムの設計・開発"
];

const expertise = [
  ["主要言語", "TypeScript / Python / C# / SQL"],
  ["アプリケーション開発", "Next.js / FastAPI / .NET"],
  ["データ・バックエンド基盤", "PostgreSQL / Supabase / Neon / REST API / Realtime / Auth"],
  ["クラウド・実行基盤", "Google Cloud / Cloudflare Workers / Vercel / Docker / Linux"],
  ["開発・運用基盤", "GitHub Actions / CI/CD / Playwright / E2E / Integration Testing"],
  ["AI・エージェント開発", "OpenAI Codex / Claude Code / MCP / LLM API / Agentic Workflows"]
] as const;

export function DeveloperProfile({ id = "developer-profile", showWebPortfolio = false }: DeveloperProfileProps) {
  return (
    <div id={id} className="developer-credit developer-credit--wide developer-credit--portfolio">
      <span>開発者・プロダクト設計者</span>
      <strong>Yuto Matsui</strong>
      <p>生命科学・教育・AIを横断し、研究・教育現場で自ら見いだした課題を、実装可能なプロダクトへ変換する。</p>
      {showWebPortfolio ? (
        <div className="developer-credit__portfolio-links">
          <a
            className="github-profile-link developer-credit__portfolio"
            href="/founder/"
            aria-label="Yuto MatsuiのWebポートフォリオを開く"
          >
            <Image src="/images/compass-mark.svg" alt="" width={19} height={19} aria-hidden="true" />
            <span><strong>Web Portfolio</strong></span>
            <i aria-hidden="true">↗</i>
          </a>
          <GitHubProfileLink className="developer-credit__github" />
        </div>
      ) : (
        <GitHubProfileLink className="developer-credit__github" />
      )}
      <div className="developer-credit__grid">
        <div>
          <h3>得意領域</h3>
          <ul>
            {focusAreas.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <details className="developer-expertise">
          <summary>
            <span>Technical Expertise</span>
            <small>技術領域を表示</small>
          </summary>
          <dl>
            {expertise.map(([term, detail]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </div>
  );
}

import { GitHubProfileLink } from "../../components/GitHubProfileLink";
import styles from "./engineering-docs.module.css";

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
  ["3D・モーション", "Three.js / Blender / Remotion"],
  ["データ・バックエンド基盤", "PostgreSQL / Supabase"],
  ["クラウド・実行基盤", "Google Cloud / Cloudflare / Docker / Terraform"],
  ["開発・運用基盤", "GitHub Actions / Playwright"],
  ["AI・エージェント開発", "OpenAI API / MCP / Agentic Workflows"]
] as const;

export function DeveloperArticle() {
  return <section id="profile" aria-label="開発者紹介" className={styles.productionProfile}>
    <h2 className={styles.visuallyHidden}>開発者紹介</h2>
    <div id="developer-identity" className="developer-credit developer-credit--wide developer-credit--portfolio">
      <span>開発者・プロダクト設計者</span>
      <strong>Yuto Matsui</strong>
      <p>生命科学・教育・AIを横断し、研究・教育現場で自ら見いだした課題を、実装可能なプロダクトへ変換する。</p>
      <GitHubProfileLink className="developer-credit__github" />
      <div className="developer-credit__grid">
        <div><h3>得意領域</h3><ul>{focusAreas.map(item => <li key={item}>{item}</li>)}</ul></div>
        <details className="developer-expertise">
          <summary><span>Technical Expertise</span><small>技術領域を表示</small></summary>
          <dl>{expertise.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>
        </details>
      </div>
    </div>
  </section>;
}

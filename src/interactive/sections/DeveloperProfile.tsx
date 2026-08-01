import { Reveal } from "../components/ui/Reveal";
import { Section } from "../components/ui/Section";
import { GitHubProfileLink } from "../../components/GitHubProfileLink";

export function DeveloperProfile() {
  return (
    <Section className="developer-profile-section">
      <Reveal>
        <div id="developer-profile" className="developer-credit developer-credit--wide">
          <span>開発者・プロダクト設計者</span>
          <strong>Yuto Matsui</strong>
          <p>生命科学・教育・AIを横断し、研究・教育現場で自ら見いだした課題を、実装可能なプロダクトへ変換する。</p>
          <GitHubProfileLink className="developer-credit__github" />
          <div className="developer-credit__grid">
            <div>
              <h3>得意領域</h3>
              <ul>
                <li>生命科学・分子生物学研究</li>
                <li>フルスタックWebアプリケーション開発</li>
                <li>研究データ解析パイプラインの構築</li>
                <li>独自バックエンド基盤による業務自動化・効率化</li>
                <li>AI統合型システムの設計・検証</li>
              </ul>
            </div>
            <details className="developer-expertise">
              <summary>
                <span>Technical Expertise</span>
                <small>技術領域を表示</small>
              </summary>
              <dl>
                <div>
                  <dt>主要言語</dt>
                  <dd>TypeScript / Python</dd>
                </div>
                <div>
                  <dt>フロントエンド</dt>
                  <dd>React / Next.js / Vite</dd>
                </div>
                <div>
                  <dt>バックエンド・データ基盤</dt>
                  <dd>FastAPI / Supabase / PostgreSQL</dd>
                </div>
                <div>
                  <dt>開発・運用基盤</dt>
                  <dd>Git / Docker / Linux / Cloudflare</dd>
                </div>
                <div>
                  <dt>AIエージェント</dt>
                  <dd>OpenAI Codex / Claude Code</dd>
                </div>
              </dl>
            </details>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

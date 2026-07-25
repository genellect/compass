const ProjectTags = ({ tags }: { tags: string[] }) => (
  <ul className="project-tag-list" aria-label="Project fields">
    {tags.map((tag) => <li key={tag}>{tag}</li>)}
  </ul>
);

export function TechnologySection() {
  return (
    <section id="technology" className="section technology-section" aria-labelledby="technology-title">
      <div className="container">
        <div className="section-heading technology-heading" data-reveal>
          <div>
            <p className="section-label">Technology / 教育システム</p>
            <h2 id="technology-title">学びの壁を、<br />仕組みで越える。</h2>
          </div>
          <p>
            学びの壁は、努力だけで越えられるものではありません。
            <br className="technology-copy-desktop-break" />
            だからCOMPASSは、仕組みの側から学びを支えます。
            <br /><br />
            参加できない。届かない。時間が奪われる。答えを信じきれない。そんな教育現場の困りごとを、安全で使いやすく、確かめられる仕組みへと変えていきます。
          </p>
        </div>

        <div className="technology-grid">
          <article className="technology-card technology-card--interactive" data-reveal>
            <div className="technology-card__meta">
              <ProjectTags tags={["Technology", "Education"]} />
            </div>
            <p className="technology-card__eyebrow">COMPASS Interactive</p>
            <h3>講義を、参加できる学習空間へ。</h3>
            <p>
              独自開発のリアルタイム講義支援システム。資料同期、匿名での質問、ライブ投票、リアルタイム字幕、5分ハイライトを一つの講義体験に統合し、学生の疑問と反応をその場で講義へ返します。聞くだけだった時間を、参加し、確かめ、深める時間へ変えます。
            </p>
            <div className="technology-card__actions">
              <a className="button button-primary" href="INTRO_Interactive/">講義を体験する</a>
            </div>
          </article>

          <article id="technology-infrastructure" className="technology-card technology-card--infrastructure" data-reveal>
            <div className="technology-card__meta">
              <p className="project-status project-status--development">開発中</p>
              <ProjectTags tags={["Technology", "Resources"]} />
            </div>
            <p className="technology-card__eyebrow">COMPASS System Infrastructure</p>
            <h3>学びを支える、安全な仕組み。</h3>
            <p>
              COMPASSコミュニティの利用者管理、未来戦略ライブラリの利用権限、個人情報保護、Google Drive・Gmail連携、管理者監査を、一つの運用基盤へつなぎます。安全性と確認可能性を設計の中心に置き、すべての教育体験を滑らかに支えます。
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

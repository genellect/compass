export function ResourcesSection() {
  return (
    <>
<section id="resources" className="section resources-section" aria-labelledby="resources-title">
      <div className="container feature-layout">
        <div className="section-heading" data-reveal>
          <p className="section-label">Resources</p>
          <h2 id="resources-title">情報を、<br />選ぶ力に変える。</h2>
          <p>
            Resourcesは、学習の今に役立つ情報と、将来を選ぶための判断軸を、体系化された資料として届ける領域です。
          </p>
        </div>
        <div className="feature-cards" data-reveal>
          <article className="feature-card resource-card resource-card--library">
            <div className="resource-card__meta">
              <ul className="project-tag-list" aria-label="Project fields">
                <li>Resources</li><li>Education</li>
              </ul>
            </div>
            <h3>未来戦略ライブラリ</h3>
            <p>
              北里大学薬学部生を主な対象に、学部学習、英語、AI、研究室選択、大学院進学、キャリア形成を一つの資料体系として提供する、COMPASSの資料提供事業です。
            </p>
            <p>
              大学アカウントで対象者を確認し、利用ルールへの同意後、資料へのアクセス権と案内を自動で付与します。
            </p>
            <a href="/future-strategy-library/">
              未来戦略ライブラリを見る
            </a>
          </article>
          <article className="feature-card resource-card resource-card--essentials">
            <div className="resource-card__meta">
              <ul className="project-tag-list" aria-label="Project fields"><li>Resources</li></ul>
            </div>
            <h3>COMPASS Essentials</h3>
            <p>
              英語とAIを中心に、未来戦略ライブラリの一部資料を学部・所属を問わず公開しています。他学部生、他大学の学生、教育関係者の方も無料で閲覧可能です。
            </p>
            <p>
              アクセスには、大学アカウントでのログインが必要です。
            </p>
            <a href="https://forms.gle/sW49M329Dcets8ga9" target="_blank" rel="noopener noreferrer">
              Googleフォームで利用申請する
            </a>
          </article>
        </div>
      </div>
    </section>
    </>
  );
}

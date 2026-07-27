export function NewHero() {
  return (
    <section id="top" className="hero hero--editorial" aria-labelledby="hero-title">
      <canvas className="hero-particles" aria-hidden="true" />
      <div className="hero-media" aria-hidden="true" />
      <div className="hero-shade" aria-hidden="true" />
      <div className="container hero-grid">
        <div className="hero-copy" data-reveal>
          <p className="hero-label">学生主導型 教育・テクノロジープラットフォーム</p>
          <p className="hero-trust-note">任意学生支援団体 COMPASS</p>
          <h1 id="hero-title">
            <span>Better Education.</span>
            <br />
            <span>Better Decisions.</span>
          </h1>
          <p className="hero-subcopy">
            北里大学薬学部から、<br className="hero-mobile-break" />学び・研究・未来をつなぐ。
          </p>
          <p className="hero-support">
            <span className="hero-copy-desktop">
              独自システム、資料提供、教育活動、学生コミュニティを横断的につなぎ、学生が自分らしい未来を選ぶための羅針盤。
            </span>
            <span className="hero-copy-mobile">
              独自システム、資料提供、教育活動、学生コミュニティを横断的につなぎ、学生が自分らしい未来を選ぶための羅針盤。
            </span>
          </p>
          <div className="hero-actions" aria-label="Hero actions">
            <a className="button button-primary" href="INTRO_Interactive/">
              講義を体験する
            </a>
            <a
              className="button button-secondary hero-library-link"
              href="https://compass-official.pages.dev/future-strategy-library/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ライブラリを見る
            </a>
          </div>
          <nav className="mobile-orbit-brief" aria-label="Four Directions">
            <a className="mobile-orbit-link mobile-orbit-technology" href="#technology">
              <span>01</span>
              <strong>Technology</strong>
              <small>Systems</small>
            </a>
            <a className="mobile-orbit-link mobile-orbit-resources" href="#resources">
              <span>02</span>
              <strong>Resources</strong>
              <small>Knowledge</small>
            </a>
            <a className="mobile-orbit-link mobile-orbit-education" href="#workshops">
              <span>03</span>
              <strong>Workshops</strong>
              <small>Experience</small>
            </a>
            <a className="mobile-orbit-link mobile-orbit-community" href="#community">
              <span>04</span>
              <strong>Community</strong>
              <small>Co-creation</small>
            </a>
          </nav>
        </div>

        <div
          className="hero-visual hero-visual--editorial"
          data-reveal
          role="img"
          aria-label="COMPASSを中心にTechnology、Resources、Workshops、Communityの四つの方向を示す羅針盤"
        >
          <div className="precision-compass" aria-hidden="true">
            <div className="precision-compass__field" />
            <div className="precision-compass__ring precision-compass__ring--outer" />
            <div className="precision-compass__ring precision-compass__ring--inner" />
            <div className="precision-compass__crosshair" />
            <div className="precision-compass__needle" />
            <div className="precision-compass__core">
              <strong>COMPASS</strong>
              <span>Decision Core</span>
            </div>
            <div className="precision-compass__axis precision-compass__axis--technology">
              <span>01 · NORTH</span><strong>Technology</strong><small>SYSTEMS</small>
            </div>
            <div className="precision-compass__axis precision-compass__axis--resources">
              <span>02 · EAST</span><strong>Resources</strong><small>KNOWLEDGE</small>
            </div>
            <div className="precision-compass__axis precision-compass__axis--education">
              <span>03 · SOUTH</span><strong>Workshops</strong><small>EXPERIENCE</small>
            </div>
            <div className="precision-compass__axis precision-compass__axis--community">
              <span>04 · WEST</span><strong>Community</strong><small>CONNECTION</small>
            </div>
            <div className="precision-compass__coordinate precision-compass__coordinate--north">N</div>
            <div className="precision-compass__coordinate precision-compass__coordinate--east">E</div>
            <div className="precision-compass__coordinate precision-compass__coordinate--south">S</div>
            <div className="precision-compass__coordinate precision-compass__coordinate--west">W</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LegacyHero() {
  return (
<section id="top" className="hero" aria-labelledby="hero-title">
      <canvas className="hero-particles" aria-hidden="true"></canvas>
      <div className="hero-media" aria-hidden="true"></div>
      <div className="hero-shade" aria-hidden="true"></div>
      <div className="container hero-grid">
        <div className="hero-copy" data-reveal>
          <p className="hero-label">任意学生支援団体 COMPASS</p>
          <h1 id="hero-title"><span>Better Education.</span><br /><span>Better Decisions.</span></h1>
          <p className="hero-subcopy">
            北里大学・生命科学系学生のための<br />教育支援プラットフォーム。
          </p>
          <p className="hero-support">
            英語、AI、生命科学、研究、キャリアを横断的につなぎ、学生が自分らしい未来を選ぶための羅針盤。
          </p>
          <div className="hero-actions" aria-label="Hero actions">
            <a className="button button-primary" href="#vision">Discover COMPASS</a>
            <a className="button button-secondary" href="/future-strategy-library/">Explore the library</a>
          </div>
          <nav className="mobile-orbit-brief" aria-label="Mobile Three Orbits">
            <a className="mobile-orbit-link mobile-orbit-resources" href="#resources">
              <span>01</span>
              <strong>Resources</strong>
              <small>Library</small>
            </a>
            <a className="mobile-orbit-link mobile-orbit-education" href="#education">
              <span>02</span>
              <strong>Education</strong>
              <small>Learning</small>
            </a>
            <a className="mobile-orbit-link mobile-orbit-community" href="#community">
              <span>03</span>
              <strong>Community</strong>
              <small>Network</small>
            </a>
          </nav>
        </div>

        <div className="hero-visual" data-reveal aria-label="Resources, Education, Community orbiting around COMPASS">
          <div className="orbit-system" aria-hidden="true">
            <svg className="constellation-lines" viewBox="0 0 620 620" focusable="false">
              <path className="line line-resources" d="M310 310 C210 228 172 150 108 108" />
              <path className="line line-education" d="M310 310 C418 206 488 160 540 108" />
              <path className="line line-community" d="M310 310 C316 432 386 494 470 538" />
              <path className="line line-research" d="M310 310 C206 380 156 458 94 526" />
            </svg>

            <div className="orbit-ring orbit-ring-primary"></div>
            <div className="orbit-ring orbit-ring-secondary"></div>
            <div className="orbit-ring orbit-ring-tertiary"></div>

            <div className="compass-core">
              <span className="compass-needle"></span>
              <strong>COMPASS</strong>
              <small>Decision Core</small>
            </div>

            <div className="orbit-node node-resources">
              <strong>Resources</strong>
              <span>Library / Essentials</span>
            </div>
            <div className="orbit-node node-education">
              <strong>Education</strong>
              <span>English / AI / Life Science</span>
            </div>
            <div className="orbit-node node-community">
              <strong>Community</strong>
              <span>Students / Faculty / Partners</span>
            </div>

            <div className="domain-node domain-english">English Education</div>
            <div className="domain-node domain-ai">AI Literacy</div>
            <div className="domain-node domain-life">Life Science</div>
          </div>
        </div>
      </div>
    </section>
  );
}

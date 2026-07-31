const systemIndex = [
  { number: "01", label: "Interactive", detail: "Learning system", href: "#technology" },
  { number: "02", label: "Library", detail: "Future strategy", href: "#resources" },
  { number: "03", label: "Manifesto", detail: "Ideas for the AI era", href: "#manifesto" },
  { number: "04", label: "Community", detail: "Student co-creation", href: "#community" }
] as const;

const intelligenceDomains = [
  {
    className: "li-intelligence-domain--academic",
    number: "01",
    label: "Academic Intelligence"
  },
  {
    className: "li-intelligence-domain--ai",
    number: "02",
    label: "AI Systems"
  },
  {
    className: "li-intelligence-domain--science",
    number: "03",
    label: "Life Science"
  },
  {
    className: "li-intelligence-domain--technology",
    number: "04",
    label: "Frontier Technology"
  }
] as const;

export function NewHero() {
  return (
    <section
      id="top"
      className="hero hero--editorial hero--living-intelligence"
      aria-labelledby="hero-title"
    >
      <canvas className="hero-particles" aria-hidden="true" />
      <div className="li-hero-atmosphere" aria-hidden="true">
        <span className="li-hero-atmosphere__grid" />
        <span className="li-hero-atmosphere__horizon" />
        <span className="li-hero-atmosphere__glow li-hero-atmosphere__glow--cyan" />
        <span className="li-hero-atmosphere__glow li-hero-atmosphere__glow--green" />
      </div>

      <div className="container hero-grid li-hero-layout">
        <div className="hero-copy li-hero-copy">
          <div className="li-hero-origin">
            <p className="li-hero-eyebrow">
              <span className="li-hero-eyebrow__signal" aria-hidden="true" />
              <span className="li-hero-eyebrow__desktop">
                学生主導型 教育・テクノロジープラットフォーム
              </span>
              <span className="li-hero-eyebrow__mobile">
                学生主導型 教育・テクノロジープラットフォーム
              </span>
            </p>
            <p className="li-hero-trust">任意学生支援団体 COMPASS</p>
          </div>

          <h1 id="hero-title" className="li-hero-title">
            <span className="li-hero-title__line">Don’t Just Learn.</span>
            <span className="li-hero-title__line li-hero-title__line--active">
              <span>Build What’s</span> <span>Next.</span>
            </span>
          </h1>

          <p className="li-hero-lead">
            北里大学薬学部から、<br className="li-hero-mobile-break" />
            学び・研究・未来をつなぐ。
          </p>

          <p className="li-hero-support">
            <span>
              独自システム、実践資料、教育活動、
              <br className="li-hero-support-break" />
              学生コミュニティをひとつに。
            </span>
            <span>
              学生の「知る」を、
              「選ぶ」「動く」へ変える。
            </span>
          </p>

          <nav className="li-system-index" aria-label="COMPASS system index">
            {systemIndex.map((item) => (
              <a className="li-system-index__item" href={item.href} key={item.number}>
                <span className="li-system-index__number">{item.number}</span>
                <span className="li-system-index__copy">
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className="li-system-index__arrow" aria-hidden="true">
                  ↘
                </span>
              </a>
            ))}
          </nav>
        </div>

        <div className="hero-visual li-intelligence-visual" aria-hidden="true">
          <div className="li-intelligence-field">
            <svg
              className="li-intelligence-field__svg"
              viewBox="0 0 720 720"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="li-flow-cyan" x1="70" y1="160" x2="646" y2="552">
                  <stop stopColor="#75E9FF" stopOpacity="0" />
                  <stop offset="0.48" stopColor="#75E9FF" stopOpacity="0.92" />
                  <stop offset="1" stopColor="#8CFFC8" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="li-flow-green" x1="122" y1="600" x2="602" y2="116">
                  <stop stopColor="#8CFFC8" stopOpacity="0" />
                  <stop offset="0.5" stopColor="#8CFFC8" stopOpacity="0.78" />
                  <stop offset="1" stopColor="#75E9FF" stopOpacity="0" />
                </linearGradient>
                <radialGradient id="li-core-field" cx="0" cy="0" r="1" gradientTransform="translate(360 360) rotate(90) scale(205)">
                  <stop stopColor="#75E9FF" stopOpacity="0.22" />
                  <stop offset="0.55" stopColor="#75E9FF" stopOpacity="0.055" />
                  <stop offset="1" stopColor="#75E9FF" stopOpacity="0" />
                </radialGradient>
              </defs>

              <circle cx="360" cy="360" r="318" className="li-field-ring li-field-ring--outer" />
              <circle cx="360" cy="360" r="262" className="li-field-ring li-field-ring--middle" />
              <circle cx="360" cy="360" r="196" className="li-field-ring li-field-ring--inner" />
              <circle cx="360" cy="360" r="205" fill="url(#li-core-field)" />

              <g className="li-field-coordinates">
                <path d="M360 32V688" />
                <path d="M32 360H688" />
                <path d="M128 128L592 592" />
                <path d="M592 128L128 592" />
              </g>

              <g className="li-field-flow li-field-flow--one">
                <path d="M62 208C178 196 214 304 360 360C506 416 540 526 658 512" stroke="url(#li-flow-cyan)" />
              </g>
              <g className="li-field-flow li-field-flow--two">
                <path d="M124 606C194 492 250 456 360 360C470 264 520 180 610 110" stroke="url(#li-flow-green)" />
              </g>
              <g className="li-field-flow li-field-flow--three">
                <path d="M84 392C190 512 282 476 360 360C438 244 524 230 638 322" stroke="url(#li-flow-cyan)" />
              </g>

              <g className="li-field-nodes">
                <circle cx="128" cy="128" r="5" />
                <circle cx="592" cy="128" r="5" />
                <circle cx="592" cy="592" r="5" />
                <circle cx="128" cy="592" r="5" />
                <circle cx="360" cy="98" r="3" />
                <circle cx="622" cy="360" r="3" />
                <circle cx="360" cy="622" r="3" />
                <circle cx="98" cy="360" r="3" />
              </g>

              <g className="li-field-ticks">
                <path d="M360 42V62M678 360H658M360 678V658M42 360H62" />
                <path d="M135 135L150 150M585 135L570 150M585 585L570 570M135 585L150 570" />
              </g>
            </svg>

            <div className="li-intelligence-core">
              <span className="li-intelligence-core__halo li-intelligence-core__halo--outer" />
              <span className="li-intelligence-core__halo li-intelligence-core__halo--inner" />
              <span className="li-intelligence-core__scan" />
              <div className="li-intelligence-core__copy">
                <small>Decision Engine</small>
                <strong>COMPASS</strong>
                <span>INQUIRY → ACTION</span>
              </div>
            </div>

            {intelligenceDomains.map((domain) => (
              <div
                className={`li-intelligence-domain ${domain.className}`}
                key={domain.number}
              >
                <span>{domain.number}</span>
                <strong>{domain.label}</strong>
              </div>
            ))}

            <div className="li-intelligence-sequence">
              <span>Question</span>
              <i aria-hidden="true" />
              <span>Evidence</span>
              <i aria-hidden="true" />
              <span>Model</span>
              <i aria-hidden="true" />
              <span>Prototype</span>
              <i aria-hidden="true" />
              <span>Decision</span>
            </div>
          </div>
        </div>
      </div>

      <div className="li-hero-scroll-cue" aria-hidden="true">
        <span>Explore the system</span>
        <i />
      </div>
    </section>
  );
}

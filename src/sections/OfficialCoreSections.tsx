import type { ReactNode } from "react";

const interactiveIntroUrl = "/INTRO_Interactive/";
const libraryUrl = "https://compass-official.pages.dev/future-strategy-library/";
const essentialsUrl = "https://forms.gle/sW49M329Dcets8ga9";
const joinUrl = "https://docs.google.com/forms/u/1/d/e/1FAIpQLSe8Z0GkK9lmXKutLWO8lGezBoP5zPstNlkAnUEqVOx_IY7v7g/viewform";

const externalProps = { target: "_blank", rel: "noopener noreferrer" } as const;

function SectionHeading({
  label,
  title,
  description,
  id
}: {
  label: string;
  title: ReactNode;
  description?: ReactNode;
  id: string;
}) {
  return (
    <header className="v4-heading" data-reveal>
      <p className="v4-label">{label}</p>
      <h2 id={id}>{title}</h2>
      {description ? <div className="v4-heading__description">{description}</div> : null}
    </header>
  );
}

export function VisionExperienceSection() {
  return (
    <section id="vision" className="v4-section v4-vision" aria-labelledby="vision-title">
      <div className="v4-container v4-vision__grid">
        <SectionHeading
          label="Vision"
          id="vision-title"
          title={<span>学びを、<br className="v4-desktop-break" />意思決定の力へ。</span>}
        />

        <div className="v4-vision__story v4-vision__story--minimal" data-reveal>
          <p className="v4-vision__body">
            AIとテクノロジーによって、教育はもっと主体的で、つながりがあり、行動につながる体験へ変えられます。
          </p>
          <p className="v4-vision__body">
            COMPASSは、学生が学びを自らの選択と挑戦に変えられる、新しい教育体験を目指しています。
          </p>
        </div>
      </div>
    </section>
  );
}

export function CompassExperienceSection() {
  const experiences = [
    {
      number: "01",
      name: "Technology",
      value: "学びを動かす",
      title: <><span>学びの壁を、</span><span>仕組みで越える。</span></>,
      description: "WebシステムとAIを活用し、学生の疑問や反応が届き、次の学びにつながる体験をつくります。",
      href: interactiveIntroUrl,
      cta: "COMPASS Interactiveを見る"
    },
    {
      number: "02",
      name: "Resources",
      value: "未来を知る",
      title: <><span>知らなかった</span><span>未来に、出会う。</span></>,
      description: "英語、AI、研究室選び、大学院進学、キャリア形成まで、未来を考えるための知識と戦略を届けます。"
    },
    {
      number: "03",
      name: "Workshops",
      value: "実際に試す",
      title: <><span>やってみたいを、</span><span>最初の一歩へ。</span></>,
      description: "英語、AIリテラシー、生命科学を中心に、講義、講演、ワークショップを企画・実施します。"
    },
    {
      number: "04",
      name: "Community",
      value: "一緒につくる",
      title: <><span>ひとりでは、</span><span>たどり着けない場所へ。</span></>,
      description: "白金キャンパスを主な拠点に、学生同士が気軽につながり、新しい学びや挑戦を一緒に形にするコミュニティです。"
    }
  ];

  return (
    <section id="experience" className="v4-section v4-experience" aria-labelledby="experience-title">
      <div className="v4-container">
        <SectionHeading
          label="COMPASS Experience"
          id="experience-title"
          title={<span>次の1歩は、<br className="v4-mobile-break" />ここから始まる。</span>}
          description={<p>COMPASSは、WebシステムとAIを基盤に、資料、ワークショップ、共創の機会を一つにつなぎます。学生の「知りたい」「やってみたい」を、次の行動へ届けます。</p>}
        />

        <div className="v4-experience__grid">
          {experiences.map((item) => (
            <article key={item.name} className={`v4-experience-card${item.name === "Technology" ? " v4-experience-card--technology" : ""}`} data-reveal>
              <div className="v4-card-meta"><span>{item.number}</span><strong>{item.name}</strong><em>{item.value}</em></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              {item.href && item.cta ? <a className="v4-button v4-button--light" href={item.href}>{item.cta}</a> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TechnologyCoreSection() {
  return (
    <section id="technology" className="v4-section v4-technology" aria-labelledby="technology-title">
      <div className="v4-technology__mesh" aria-hidden="true" />
      <div className="v4-container">
        <div className="v4-technology__intro">
          <SectionHeading
            label="Technology Core / 教育システム"
            id="technology-title"
            title={<><span>学びの壁を、</span><span>仕組みで越える。</span></>}
            description={<p>講義に参加しにくい。必要な情報が届かない。運営に手間がかかる。AIの答えを確かめにくい。COMPASSは、こうした困りごとを、安全で使いやすく、確かめられる仕組みに変えます。</p>}
          />

          <article className="v4-technology__interactive" data-reveal>
            <p className="v4-card-kicker">COMPASS INTERACTIVE / 参加型講義システム</p>
            <h3>わからないが、<br className="v4-mobile-break" />動き出す。</h3>
            <p className="v4-technology__interactive-lead">教室にいる全員の疑問が、次の説明を動かす。</p>
            <p>COMPASS Interactiveは、一方向だった講義を、学生の反応によって変化する体験へ変えます。</p>
            <a className="v4-button v4-button--light" href={interactiveIntroUrl}>未来を体験する</a>
          </article>
        </div>
      </div>
    </section>
  );
}

export function ResourcesExperienceSection() {
  return (
    <section id="resources" className="v4-section v4-resources" aria-labelledby="resources-title">
      <div className="v4-container">
        <SectionHeading
          label="Resources / 未来への入口"
          id="resources-title"
          title={<span>知らなかった<br className="v4-mobile-break" />未来に、出会う。</span>}
          description={<><p>進路は、知っている選択肢の中からしか選べません。</p><p>未来戦略ライブラリは、英語、AI、研究室選び、大学院進学、キャリア形成まで、学生が自分の未来を考えるための知識と戦略を一つにつなぎます。</p><p>知らなかった選択肢が、次の一歩を変えるかもしれません。</p></>}
        />
        <div className="v4-resource-gateway" data-reveal>
          <a className="v4-button v4-button--primary" href={libraryUrl} {...externalProps}>まだ知らない未来を見る</a>
          <a className="v4-resource-gateway__secondary" href={essentialsUrl} {...externalProps}>薬学部生以外の方はこちら</a>
        </div>
      </div>
    </section>
  );
}

export function CommunityExperienceSection() {
  return (
    <section id="community" className="v4-section v4-community" aria-labelledby="community-title">
      <div className="v4-container">
        <SectionHeading
          label="Community"
          id="community-title"
          title={<span>ひとりでは、<br className="v4-mobile-break" />たどり着けない場所へ。</span>}
        />
        <div className="v4-community__story" data-reveal>
          <p>COMPASSは、白金キャンパスを主な拠点に、学生がつながり、新しい学びや挑戦を一緒に形にしていくコミュニティです。</p>
          <p>教育イベントやワークショップ、情報発信、資料制作、広報、デザイン、動画制作、Webシステム開発など、活動の形はさまざまです。普段の大学生活だけでは出会えない人や考え方に触れながら、自分の興味を企画や作品として形にできます。</p>
          <p>最初から得意なことや、やりたいことが決まっている必要はありません。専門知識や経験がなくても、活動に触れ、仲間と話す中で、自分に合った関わり方を見つけられます。</p>
          <p>何か新しいことを始めたい。大学生活を少し変えてみたい。そんな気持ちがあれば、十分です。私たちと一緒に、ここから始めてみませんか。</p>
          <a className="v4-button v4-button--light" href={joinUrl} {...externalProps}>コミュニティに参加する</a>
        </div>
      </div>
    </section>
  );
}

export function FounderPortfolioSection() {
  const background = [
    ["English", "英検1級 / TOEIC 965 / IELTS 7.5"],
    ["Education", "集団指導 3.5年"],
    ["Research", "分子生物学 2年以上"],
    ["Development", "Web開発・プログラミング 4年"]
  ];

  return (
    <section id="founder" className="v4-section v4-founder" aria-labelledby="founder-title">
      <div className="v4-container">
        <SectionHeading
          label="Founder"
          id="founder-title"
          title={<span>面白そうなので、<br className="v4-mobile-break" />始めました。</span>}
        />

        <div className="v4-founder__profile" data-reveal>
          <figure className="v4-founder__portrait">
            <picture>
              <source type="image/webp" srcSet="/images/founder/yuto-matsui-portrait-480.webp 480w, /images/founder/yuto-matsui-portrait-800.webp 800w" sizes="(min-width: 901px) 340px, 100vw" />
              <img src="/images/founder/yuto-matsui-portrait-800.jpg" width="800" height="1000" loading="lazy" decoding="async" alt="COMPASS代表 松井優知" />
            </picture>
          </figure>
          <div className="v4-founder__profile-copy">
            <p className="v4-card-kicker">Founder &amp; Representative</p>
            <p className="v4-founder__role">創設者・代表</p>
            <h3>Yuto Matsui</h3>
            <div className="v4-founder__statement">
              <p>思いついたら、まずつくる。<br />分野が違えば、つないでみる。<br />一人で足りなければ、人を巻き込む。</p>
              <p>少し無謀なくらいが、ちょうど面白い。<br />COMPASSでは、今日も新しい何かが始まっています。</p>
            </div>
            <dl>
              {background.map(([term, description]) => <div key={term}><dt>{term}</dt><dd>{description}</dd></div>)}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

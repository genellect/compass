import type { ReactNode } from "react";

const interactiveIntroUrl = "/INTRO_Interactive/";
const libraryUrl = "https://compass-official.pages.dev/future-strategy-library/";
const essentialsUrl = "https://forms.gle/sW49M329Dcets8ga9";
const joinUrl = "/community/join/";

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
          title={<><span className="v4-vision-line">学びを、</span><span className="v4-vision-line">意思決定の力へ。</span></>}
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
      description: "英語、AI、研究室選び、大学院進学、キャリア形成まで、未来を考えるための知識と戦略を届けます。",
      href: libraryUrl,
      cta: "ライブラリを見る",
      external: true
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
      title: <><span>ひとりでは見えない、</span><span>新しい場所へ。</span></>,
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
            <article key={item.name} className={`v4-experience-card v4-experience-card--${item.name.toLowerCase()}`} data-reveal>
              <div className="v4-card-meta"><span>{item.number}</span><strong>{item.name}</strong><em>{item.value}</em></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              {item.href && item.cta ? (
                <a
                  className={`v4-button ${item.name === "Technology" ? "v4-button--light" : "v4-button--primary"}`}
                  href={item.href}
                  {...(item.external ? externalProps : {})}
                >
                  {item.cta}
                </a>
              ) : null}
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
            <p className="v4-card-kicker">COMPASS INTERACTIVE</p>
            <h3>わからないが、動き出す。</h3>
            <div className="v4-technology__interactive-copy">
              <p>あなたが飲み込んだその疑問を、誰かも同じように抱えているかもしれない。</p>
              <p>問いも、迷いも、ひらめきも。その場にいる全員の思考が重なったとき、講義はただの説明ではなく、自分たちの学びに変わります。</p>
            </div>
            <a className="v4-button v4-technology__interactive-cta" href={interactiveIntroUrl}>未来の講義を、いま体験。</a>
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
        <div className="v4-resources__editorial">
          <header className="v4-resources__heading" data-reveal>
            <p className="v4-label">Resources / 未来への入口</p>
            <h2 id="resources-title"><span>知らなかった未来に、出会う。</span></h2>
          </header>

          <div className="v4-resources__content" data-reveal>
            <div className="v4-resources__story">
              <p className="v4-resources__lead">次の試験に役立つ情報を探しに来たはずが、<br />気づけば、その先の未来まで見えてくる。</p>
              <p>同じ大学、同じ授業、同じ試験。<br />それでも、知っている情報によって、その先は変わります。</p>
              <div className="v4-resources__promise">
                <p>今すぐ使えて、数年後の選択にも効いてくる。</p>
                <p>未来戦略ライブラリは、学生生活の「次に知りたい」を、一つの場所につなぎます。</p>
              </div>
            </div>

            <div className="v4-resource-gateway">
              <div className="v4-resource-gateway__primary">
                <small>北里大学薬学部生対象</small>
                <a className="v4-button v4-button--primary" href={libraryUrl} {...externalProps}>まだ知らない世界を見る</a>
              </div>
              <a className="v4-resource-gateway__secondary" href={essentialsUrl} {...externalProps}>薬学部生以外の方はこちら</a>
            </div>
          </div>
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
          label="Community / 運営メンバー募集"
          id="community-title"
          title={<><span>面白い大学生活は、</span><span>待っていても始まらない。</span></>}
        />
        <div className="v4-community__experience" data-reveal>
          <div className="v4-community__overview">
            <p>ふと思いついた企画を、休み時間に誰かと話してみる。<br />アイデアを出し合い、デザインや映像をつくり、実際のイベントやサービスとして学生に届ける。</p>
            <p>COMPASSは、白金キャンパスを拠点に、学生の「やってみたい」を、仲間と形にするコミュニティです。</p>
          </div>

          <details className="v4-community__details">
            <summary>
              <span className="v4-community__read-more">続きを読む</span>
              <span className="v4-community__read-less">閉じる</span>
            </summary>
            <div className="v4-community__details-copy">
              <p>教育イベントやワークショップの企画・運営、SNSでの情報発信、教材や資料の制作、広報、デザイン、写真・動画制作、Webシステム開発。<br />興味のある活動に加わることも、自分のアイデアから新しい企画を始めることもできます。</p>
              <p>完全な初心者からでも大丈夫です。<br />投稿やイベントのアイデアを考えるところから始めて、デザイン、動画制作、Web開発まで、興味に合わせて一から挑戦できます。</p>
              <p>最初は「少し面白そう」だけでも、やがて本格的な映像や、実際に学生が使うWebサービスまでつくれるようになる。<br />仲間と楽しみながら、自分でも驚くような作品や経験を増やしていけます。</p>
              <p>一人では思いつかなかったことが、会話の中で生まれる。<br />一人では形にできなかったことが、仲間となら形になる。</p>
              <p>大学生活に、予定されていなかった挑戦と出会いを。</p>
            </div>
          </details>

          <a className="v4-button v4-community__cta" href={joinUrl}>コミュニティに参加する</a>
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

import { CTAButton } from "../components/ui/CTAButton";
import { ProductExperienceMock } from "../components/ui/ProductExperienceMock";
import { Reveal } from "../components/ui/Reveal";
import { Section } from "../components/ui/Section";
import { SectionHeader } from "../components/ui/SectionHeader";
import { TeacherDashboardMock } from "../components/ui/TeacherDashboardMock";
import { EducatorControlPreview } from "../components/ui/EducatorControlPreview";
import { DeveloperProfile } from "./DeveloperProfile";
import {
  aiLearningOutcomes,
  developerGatewayPoints,
  educatorOperations,
  lectureTimeline,
  studentExperienceSteps,
  teacherJourney,
  trustPoints,
  useScenes
} from "../content/mainPageContent";

export function StudentLectureExperience() {
  return (
    <Section id="students" className="student-story section--dark">
      <div className="audience-label" aria-label="学生の体験">
        <span>STUDENT</span>
        <small>講義へ参加する</small>
      </div>
      <div className="student-story__layout">
        <Reveal>
          <SectionHeader
            eyebrow="A QUESTION BECOMES A VOICE"
            title="気づいた瞬間、講義がこちらを向く。"
            lead="大人数の講義でも、小さな疑問をその瞬間に届けられる。同じところで迷った仲間の反応が集まり、次の説明へつながっていきます。"
          />
          <ol className="student-story__steps">
            {studentExperienceSteps.map((item) => (
              <li key={item.step}>
                <span>{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
        <Reveal className="student-story__preview" delay={100}>
          <ProductExperienceMock compact />
          <p className="experience-caption"><span aria-hidden="true" /> 講義画面を再構成したデモ表示</p>
        </Reveal>
      </div>
    </Section>
  );
}

export function LectureExperienceTimeline() {
  return (
    <Section id="features" className="lecture-timeline section--light">
      <Reveal>
        <SectionHeader
          eyebrow="ONE LEARNING JOURNEY"
          title="講義のすべてを、ひとつの学習体験に。"
          lead="資料を追う、反応する、理解を深める、振り返る。分かれていた行動を、一本の講義の流れとしてつなぎます。"
          align="center"
        />
      </Reveal>
      <ol className="lecture-timeline__track">
        {lectureTimeline.map((item) => (
          <li key={item.step}>
            <div className="lecture-timeline__marker">
              <span>{item.step}</span>
              <small>{item.moment}</small>
            </div>
            <div className="lecture-timeline__copy">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function AILearningJourney() {
  return (
    <Section id="ai-support" className="ai-journey section--dark">
      <Reveal>
        <SectionHeader
          eyebrow="AI FOR LEARNING"
          title="講義の流れが、自分の理解に変わる。"
          lead="その場の字幕、5分ごとの要点、みんなの問い。講義の流れを学び直せる形に整え、次の「わかった」へつなぎます。"
          align="center"
        />
      </Reveal>
      <div className="ai-journey__layout">
        <div className="ai-journey__outcomes">
          {aiLearningOutcomes.map((item, index) => (
            <Reveal delay={100 + index * 55} key={item.label}>
              <article>
                <small>{item.label}</small>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function TeacherLectureJourney() {
  return (
    <Section id="teachers" className="teacher-journey section--light">
      <div className="audience-label audience-label--teacher" aria-label="教員の体験">
        <span>TEACHER</span>
        <small>反応を講義へ戻す</small>
      </div>
      <div className="teacher-journey__layout">
        <Reveal>
          <SectionHeader
            eyebrow="FOR TEACHERS"
            title="学生の反応が、次の説明を変える。"
            lead="大人数の講義でも、質問と理解の変化をひとつの画面で捉え、その場で補足し、問い直し、深められます。"
          />
          <ol className="teacher-journey__steps">
            {teacherJourney.map((item) => (
              <li key={item.step}>
                <span>{item.step}</span>
                <div><h3>{item.title}</h3><p>{item.body}</p></div>
              </li>
            ))}
          </ol>
        </Reveal>
        <Reveal className="teacher-journey__dashboard" delay={100}>
          <TeacherDashboardMock />
          <p>質問・投票・理解の変化を、次の説明の手がかりに。</p>
        </Reveal>
      </div>
    </Section>
  );
}

export function LearningUseScenes() {
  return (
    <Section id="use-cases" className="use-scenes section--light">
      <Reveal>
        <SectionHeader
          eyebrow="HOW IT FITS"
          title="学ぶ場面ごとに、参加のしかたが広がる。"
          lead="講義の規模や分野に合わせて、質問、投票、字幕、要点整理を組み合わせられます。"
          align="center"
        />
      </Reveal>
      <div className="use-scenes__list">
        {useScenes.map((scene, index) => (
          <Reveal delay={index * 45} key={scene.number}>
            <article>
              <span>{scene.number}</span>
              <h3>{scene.title}</h3>
              <p>{scene.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export function AdoptionContact() {
  return (
    <Section id="adoption" className="adoption-contact section--light">
      <Reveal>
        <div className="adoption-contact__panel">
          <div className="adoption-contact__intro">
            <div>
              <p className="eyebrow">FOR EDUCATORS &amp; ORGANIZATIONS</p>
              <h2>
                <span>講義や研修への</span>
                <span>導入をご検討の方へ</span>
              </h2>
              <p className="adoption-contact__lead">
                <span className="adoption-contact__lead-line">
                  <span>COMPASS Interactiveは、</span>
                  <span>大学講義や研究室セミナー、</span>
                  <span>学会、企業研修など、</span>
                </span>
                <span className="adoption-contact__lead-line">
                  <span>さまざまな教育・学習環境で</span>
                  <span>ご利用いただけます。</span>
                </span>
              </p>
            </div>
            <CTAButton className="adoption-contact__cta" href="/contact/">
              COMPASS問い合わせフォームへ <span aria-hidden="true">→</span>
            </CTAButton>
          </div>
          <details className="adoption-contact__disclosure">
            <summary>
              <span className="adoption-contact__disclosure-label adoption-contact__disclosure-label--open">続きを読む</span>
              <span className="adoption-contact__disclosure-label adoption-contact__disclosure-label--close">閉じる</span>
              <span className="adoption-contact__disclosure-icon" aria-hidden="true" />
            </summary>
            <div className="adoption-contact__details">
              <p>
                導入にあたっては、講義形式や参加人数、ご利用になりたい機能などを確認したうえで、
                <strong>利用環境の設定、操作方法のご案内、講義当日の運用支援まで個別にサポートいたします。</strong>
              </p>
              <p>
                また、既存の機能をそのまま使っていただくだけでなく、
                <strong>実際の講義や研修のニーズに応じた機能の調整・追加開発や、より使いやすい運用方法のご提案にも柔軟に対応いたします。</strong>
              </p>
              <p>
                北里大学薬学部・薬学研究科での利用については、<strong>無償で導入支援を行っています。</strong>
                北里大学内のその他の部門、ならびに他大学・研究機関・学会・企業での利用については、
                <strong>利用内容に応じて個別にご相談を承ります。</strong>
              </p>
              <p>本格的な導入が決まっていない段階でも構いません。</p>
              <p>
                「自分の講義でどのように使えるか」「こんな機能は実現できるか」といったご相談から、導入・運用・開発に関するご相談まで幅広く受け付けています。
                <strong>ご興味がありましたら、ぜひCOMPASS問い合わせフォームからお気軽にご連絡ください。</strong>
              </p>
            </div>
          </details>
        </div>
      </Reveal>
    </Section>
  );
}

export function LearningTrust() {
  return (
    <Section id="security" className="learning-trust section--light">
      <Reveal>
        <SectionHeader
          eyebrow="TRUST & PRIVACY"
          title="安心して届けられるから、学びに向き合える。"
          lead="学生にも教員にも、何をどのように扱うかが伝わること。参加しやすさと、講義情報を丁寧に扱うことを両立します。"
          align="center"
        />
      </Reveal>
      <div className="learning-trust__boundary">
        <div className="learning-trust__core" aria-hidden="true"><span>LECTURE</span><i /></div>
        <div className="learning-trust__points">
          {trustPoints.map((point, index) => (
            <Reveal delay={index * 55} key={point.title}>
              <article>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{point.title}</h3><p>{point.body}</p></div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function EducatorOperations() {
  return (
    <Section id="educator-operations" className="educator-operations section--light">
      <Reveal>
        <SectionHeader
          eyebrow="EDUCATOR OPERATIONS"
          title={
            <>
              <span className="title-line">
                <span>講義の準備から</span><span className="title-continuation--mobile">画面共有まで、</span>
              </span>
              <span className="title-line">ひとつの管理画面で。</span>
            </>
          }
          lead="許可されたGoogleアカウントでログインし、講義資料の準備から進行、参加機能、AI、教室画面までをひとつの管理画面から操作できます。"
        />
      </Reveal>
      <div className="educator-operations__layout">
        <Reveal>
          <ol className="educator-operations__steps">
            {educatorOperations.map((item) => (
              <li key={item.step}>
                <span>{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <strong>{item.headline}</strong>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
        <Reveal className="educator-operations__preview" delay={100}>
          <EducatorControlPreview />
          <p>実際の教員ワークスペースをもとに再構成したデモ表示</p>
        </Reveal>
      </div>
    </Section>
  );
}

export function DeveloperGateway() {
  return (
    <Section id="developers" className="developer-gateway section--dark">
      <div className="audience-label audience-label--developer" aria-label="開発者の体験">
        <span>DEVELOPER</span>
        <small>設計判断をたどる</small>
      </div>
      <div className="developer-gateway__layout">
        <Reveal>
          <SectionHeader
            eyebrow="BEHIND THE EXPERIENCE"
            title="この体験を、見えない設計から支える。"
            lead="画面の速さ、情報の扱い、AIの妥当性、負荷、費用、障害時の継続性。教育体験から逆算した設計判断を公開します。"
          />
          <CTAButton className="developer-gateway__cta" href="/INTRO_Interactive/developers/">
            開発者向け情報へ <span aria-hidden="true">→</span>
          </CTAButton>
        </Reveal>
        <Reveal delay={100}>
          <ul className="developer-gateway__points">
            {developerGatewayPoints.map((point, index) => (
              <li key={point}><span>{String(index + 1).padStart(2, "0")}</span><p>{point}</p></li>
            ))}
          </ul>
        </Reveal>
      </div>
      <Reveal>
        <DeveloperProfile showWebPortfolio />
      </Reveal>
    </Section>
  );
}

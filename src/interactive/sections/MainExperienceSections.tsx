import { CTAButton } from "../components/ui/CTAButton";
import { ProductExperienceMock } from "../components/ui/ProductExperienceMock";
import { Reveal } from "../components/ui/Reveal";
import { Section } from "../components/ui/Section";
import { SectionHeader } from "../components/ui/SectionHeader";
import { TeacherDashboardMock } from "../components/ui/TeacherDashboardMock";
import { DeveloperProfile } from "./DeveloperProfile";
import {
  aiLearningOutcomes,
  developerGatewayPoints,
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
        <DeveloperProfile />
      </Reveal>
    </Section>
  );
}

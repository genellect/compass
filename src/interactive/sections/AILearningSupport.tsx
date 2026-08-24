import { Section } from "../components/ui/Section";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Reveal } from "../components/ui/Reveal";

const aiFeatures = [
  {
    label: "リアルタイム字幕",
    title: "聞き逃しても、講義についていける。",
    body: "講義音声をその場で字幕化。聞き取りにくかった言葉や専門用語も、すぐに目で確認できます。",
    model: "GPT-Realtime-Whisper｜搭載中"
  },
  {
    label: "5分要点・質問整理",
    title: "「いま何が大事？」を、5分ごとに。",
    body: "資料・字幕・投票・コメントをAIが横断し、直近の要点と、クラスで深めたい問いを整理します。",
    model: "GPT-5.6 Luna｜搭載中"
  },
  {
    label: "一次文献につながる学術回答",
    title: "その疑問を、信頼できる知識の入口へ。",
    body: "講義中の学術的な問いを一次文献と結び、PMID・DOIまでたどれる参考回答を生成します。",
    model: "GPT-5.6 Luna｜搭載中"
  }
] as const;

export function AILearningSupport() {
  return (
    <Section id="ai-support" className="ai-support-section section--dark">
      <Reveal>
        <div className="ai-support-heading">
          <SectionHeader
            eyebrow="AI LEARNING SUPPORT"
            title="聞き逃しも、疑問も、その場で次の理解へ。"
            lead="最新AIが、講義中に生まれる「わからない」を拾い、字幕・要点・質問・学術情報へつなぎます。"
            align="center"
          />
        </div>
      </Reveal>
      <div className="ai-support-grid" aria-label="AI学習支援機能">
        {aiFeatures.map((feature, index) => (
          <Reveal delay={index * 80} key={feature.label}>
            <article className="ai-support-card">
              <header>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{feature.label}</p>
              </header>
              <h3>{feature.title}</h3>
              <p className="ai-support-card__body">{feature.body}</p>
              <p className="ai-support-card__model">{feature.model}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

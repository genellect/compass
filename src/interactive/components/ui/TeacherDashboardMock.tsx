import { teacherDashboard } from "../../content/interactiveContent";
import { QuizBars } from "./QuizBars";

const teacherQuiz = {
  question: "ACE阻害薬による空咳に関連する因子はどれですか？",
  options: [
    { label: "A", text: "ブラジキニン", value: 71 },
    { label: "B", text: "ヒスタミン", value: 12 },
    { label: "C", text: "アセチルコリン", value: 9 },
    { label: "D", text: "ノルアドレナリン", value: 8 }
  ]
};

export function TeacherDashboardMock() {
  return (
    <div className="teacher-dashboard" aria-label="教員ダッシュボードのデモ">
      <div className="teacher-dashboard__top">
        <div>
          <p className="mock-card__label">Lecture Signal</p>
          <h3>講義中の反応</h3>
        </div>
        <div className="response-meter" aria-label={`回答率 ${teacherDashboard.responseRate}%`}>
          <span style={{ width: `${teacherDashboard.responseRate}%` }} />
          <strong>{teacherDashboard.responseRate}%</strong>
        </div>
      </div>

      <QuizBars question={teacherQuiz.question} options={teacherQuiz.options} compact />

      <div className="signal-list">
        {teacherDashboard.signals.map((signal) => (
          <p key={signal}>{signal}</p>
        ))}
      </div>

      <div className="keyword-cloud" aria-label="よく出たキーワード">
        {teacherDashboard.keywords.map((keyword, index) => (
          <span style={{ animationDelay: `${index * 120}ms` }} key={keyword}>
            {keyword}
          </span>
        ))}
      </div>
    </div>
  );
}

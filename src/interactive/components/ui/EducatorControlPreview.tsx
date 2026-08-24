const workspaceViews = [
  { number: "1", label: "準備", description: "資料・タイトル" },
  { number: "2", label: "スライド", description: "ページ操作" },
  { number: "3", label: "参加", description: "投票・コメント" },
  { number: "4", label: "AI", description: "利用中" }
] as const;

export function EducatorControlPreview() {
  return (
    <div
      className="teacher-dashboard educator-control"
      aria-label="実際の教員ワークスペースを参考に再構成した静的デモ"
    >
      <header className="educator-control__header">
        <div>
          <p className="mock-card__label">Educator workspace</p>
          <h3>Lecture 08</h3>
        </div>
        <div className="educator-control__live" aria-label="講義中、経過時間42分18秒">
          <strong><span aria-hidden="true" /> LIVE</strong>
          <small>42:18</small>
        </div>
      </header>

      <ol className="educator-control__workflow" aria-label="教員ワークスペースの操作領域">
        {workspaceViews.map((view, index) => (
          <li className={index === 2 ? "is-active" : undefined} key={view.number}>
            <span>{view.number}</span>
            <div><strong>{view.label}</strong><small>{view.description}</small></div>
          </li>
        ))}
      </ol>

      <div className="educator-control__context">
        <div>
          <span className="educator-control__icon" aria-hidden="true">M</span>
          <p><small>Google認証済み</small><strong>Verified</strong></p>
        </div>
        <div>
          <span className="educator-control__file" aria-hidden="true">PDF</span>
          <p><small>講義資料</small><strong>lecture_08.pdf</strong></p>
          <em>Uploaded</em>
        </div>
      </div>

      <div className="educator-control__states" aria-label="講義中の機能状態">
        <div className="educator-control__state educator-control__state--poll">
          <div><small>Live Poll</small><strong>Accepting responses</strong></div>
          <p><b>48</b><span> responses</span></p>
        </div>
        <div className="educator-control__state">
          <div><small>AI Assist</small><strong>ON</strong></div>
          <span className="educator-control__toggle is-on" aria-hidden="true" />
        </div>
        <div className="educator-control__state">
          <div><small>Comments</small><strong>Visible</strong></div>
          <span className="educator-control__toggle is-on" aria-hidden="true" />
        </div>
      </div>

      <div className="educator-control__share">
        <strong>画面共有を開始 <span aria-hidden="true">→</span></strong>
        <small>スライド・コメント・投票結果を教室画面へ共有</small>
      </div>

      <section className="ai-review" aria-labelledby="ai-review-title">
        <header>
          <div><small>AI Review</small><h4 id="ai-review-title">AI generated summary</h4></div>
          <span>AI generated</span>
        </header>
        <blockquote>RNA repeat expansion can contribute to neurodegeneration through multiple mechanisms...</blockquote>
        <footer>
          <div aria-label="AI出力の操作例"><span>編集する</span><strong>学生へ共有</strong></div>
          <small><span aria-hidden="true">✓</span> Reviewed by educator</small>
        </footer>
      </section>
    </div>
  );
}

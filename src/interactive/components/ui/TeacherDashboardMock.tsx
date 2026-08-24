export function TeacherDashboardMock() {
  return (
    <div className="teacher-dashboard educator-control" aria-label="Educator Controlのデモ">
      <header className="educator-control__header">
        <div>
          <p className="mock-card__label">Educator Control</p>
          <h3>Lecture 08</h3>
        </div>
        <div className="educator-control__live" aria-label="講義中、経過時間42分18秒">
          <strong><span aria-hidden="true" /> LIVE</strong>
          <small>42:18</small>
        </div>
      </header>

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

      <div className="educator-control__states">
        <section className="educator-control__state educator-control__state--poll">
          <div><small>Live Poll</small><strong>Accepting responses</strong></div>
          <p><b>48</b><span> responses</span></p>
        </section>
        <section className="educator-control__state">
          <div><small>AI Assist</small><strong>ON</strong></div>
          <span className="educator-control__toggle is-on" aria-label="AI Assistは有効" />
        </section>
        <section className="educator-control__state">
          <div><small>Comments</small><strong>Visible</strong></div>
          <span className="educator-control__toggle is-on" aria-label="コメントは表示中" />
        </section>
      </div>

      <div className="educator-control__share" aria-label="画面共有を開始">
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
          <div aria-label="AI出力の操作"><span>編集する</span><strong>学生へ共有</strong></div>
          <small><span aria-hidden="true">✓</span> Reviewed by educator</small>
        </footer>
      </section>
    </div>
  );
}

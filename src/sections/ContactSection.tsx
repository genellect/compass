export function ContactSection() {
  return (
    <>
<section id="contact" className="section contact-section" aria-labelledby="contact-title">
  <div className="container contact-card" data-reveal>
    <p className="section-label">Contact / お問い合わせ</p>
    <h2 id="contact-title">ご意見・ご質問を歓迎しています。</h2>

    <p>
      学生の方も、教員・教育関係者の方も、所属を問わずお問い合わせいただけます。活動や資料についてのご質問、ご意見、ご相談、連携のご提案まで、お気軽にお寄せください。
    </p>

    <a
      className="button button-primary"
      href="/contact/"
    >
      お問い合わせフォームを開く
    </a>
  </div>
</section>
    </>
  );
}

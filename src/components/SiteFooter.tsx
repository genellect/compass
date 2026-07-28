export function SiteFooter() {
  return (
    <>
<footer className="site-footer">
  <div className="container footer-inner">
    <div className="footer-brand">
      <p className="footer-logo">COMPASS</p>
      <p>Better Education. Better Decisions.</p>
    </div>

    <nav className="footer-nav" aria-label="Footer navigation">
      <a href="#technology">Technology</a>
      <a href="#resources">Resources</a>
      <a href="#community">Community</a>
      <a href="#founder">Founder</a>
      <a href="#contact">Contact</a>
      <a href="messages/index.html">Messages</a>
    </nav>

    <nav className="footer-cta" aria-label="Footer calls to action">
      <a href="https://compass-official.pages.dev/future-strategy-library/" target="_blank" rel="noopener noreferrer">未来戦略ライブラリを見る</a>
      <a href="/community/join/">COMPASSに参加する</a>
    </nav>

    <div className="footer-note">
      <p>
        COMPASSは、学生有志による任意の学生支援活動であり、大学公式組織ではありません。
        本サイトおよび関連資料の内容は、大学・学部・研究室・所属機関の見解を代表するものではありません。
      </p>
      <p>
        代表者名・連絡先を除き、特定の研究室名、運営者の所属研究室情報、登録者情報、
        その他の機密情報は公開しておらず、著作権・中立性・情報管理に十分配慮しています。
      </p>
    </div>

    <p className="copyright">© 2026 COMPASS. All rights reserved.</p>
  </div>
</footer>
    </>
  );
}

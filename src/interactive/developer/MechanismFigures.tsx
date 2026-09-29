import styles from "./engineering-docs.module.css";

export function ArchitectureMap() {
  return <figure className={styles.architectureMap}>
    <figcaption>主要コンポーネントと通信経路</figcaption>
    <svg className={styles.mapDesktop} viewBox="0 0 900 414" role="img" aria-label="ブラウザはSupabaseのData API、Edge Functions、Asset Workerに接続する。講義状態はPostgreSQL、資料はPrivate R2に保存。Edge FunctionsはDBで認可を確認しAI APIと公開調整を実行する。">
      <defs><marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#71839a" /></marker></defs>
      <rect x="12" y="28" width="206" height="346" rx="3" fill="#f5f7fa" stroke="#cbd5e1" />
      <text x="30" y="60" className={styles.svgTitle}>ブラウザ</text><text x="30" y="87">React / Vite</text>
      <path d="M30 108 H198" stroke="#cbd5e1" />
      <text x="30" y="143">教員：講義を操作</text><text x="30" y="195">学生：参加・回答</text><text x="30" y="247">Display：教室へ投影</text>
      <text x="30" y="327" className={styles.svgSmall}>静的配信</text><text x="30" y="351">Cloudflare Pages</text>
      <g fill="none" stroke="#71839a" strokeWidth="1.3" markerEnd="url(#map-arrow)">
        <path d="M218 75 H316" /><path d="M218 207 H316" /><path d="M218 341 H316" />
        <path d="M570 75 H688" /><path d="M570 203 H618 V130 H688" />
        <path d="M570 224 H688" /><path d="M570 341 H688" />
        <path d="M442 306 V245" markerStart="url(#map-arrow)" />
      </g>
      <text x="231" y="64" className={styles.svgSmall}>取得・更新</text><text x="231" y="194" className={styles.svgSmall}>管理・AI</text><text x="231" y="328" className={styles.svgSmall}>PDF転送</text>
      <text x="587" y="63" className={styles.svgSmall}>SQL / RPC</text><text x="593" y="245" className={styles.svgSmall}>API呼び出し</text><text x="591" y="328" className={styles.svgSmall}>保存・読出</text><text x="454" y="281" className={styles.svgSmall}>公開調整</text>
      <rect x="318" y="36" width="252" height="78" rx="3" fill="#fff" stroke="#aebdce" />
      <text x="336" y="67" className={styles.svgTitle}>Auth / Data API</text><text x="336" y="94">認証・DBアクセス</text>
      <rect x="318" y="167" width="252" height="78" rx="3" fill="#fff" stroke="#aebdce" />
      <text x="336" y="198" className={styles.svgTitle}>Edge Functions</text><text x="336" y="225">管理操作・外部API・認可</text>
      <rect x="318" y="306" width="252" height="70" rx="3" fill="#fff" stroke="#aebdce" />
      <text x="336" y="334" className={styles.svgTitle}>Asset Worker</text><text x="336" y="358">資料の公開・Range配信</text>
      <rect x="690" y="36" width="198" height="113" rx="3" fill="#edf3fb" stroke="#7998bc" />
      <text x="708" y="65" className={styles.svgTitle}>PostgreSQL</text><text x="708" y="91">講義状態・権限</text><text x="708" y="118">集計・実行記録</text>
      <rect x="690" y="188" width="198" height="70" rx="3" fill="#fff" stroke="#aebdce" strokeDasharray="4 3" />
      <text x="708" y="218" className={styles.svgTitle}>外部API</text><text x="708" y="241">AI・文献検索</text>
      <rect x="690" y="306" width="198" height="70" rx="3" fill="#edf3fb" stroke="#7998bc" />
      <text x="708" y="334" className={styles.svgTitle}>Private R2</text><text x="708" y="358">PDF・アーカイブ</text>
      <text x="318" y="405" className={styles.svgSmall}>Auth・Data API・Edge Functions・PostgreSQLはSupabase上で稼働</text>
    </svg>
    <div className={styles.mapMobile}>
      <p><strong>ブラウザ</strong><span>教員・学生・Display / React・Vite</span></p>
      <dl><div><dt>状態の取得・更新</dt><dd>Data API（テーブル操作・RPC）→ PostgreSQL</dd></div><div><dt>管理・AI操作</dt><dd>Edge Functions → PostgreSQL・外部API</dd></div><div><dt>PDFの転送・閲覧</dt><dd>Asset Worker → Private R2</dd></div><div><dt>PDF公開の調整</dt><dd>Asset Worker ↔ Edge Functions ↔ DB</dd></div></dl>
    </div>
    <div className={styles.mapFoot}><p><strong>状態の同期</strong><span>コメント・ライブ投票は全接続端末へのRealtime配信と、通常5秒間隔の状態取得を併用する構成。通知の欠落や切断時はDBの現在状態を再取得。</span></p><p><strong>PowerPoint連携</strong><span>Windows / Presenter Bridge → Gateway・Edge Functions → 講義状態</span></p><p><strong>字幕音声</strong><span>実行許可後、教員ブラウザからAI APIへ直接送信。</span></p></div>
  </figure>;
}

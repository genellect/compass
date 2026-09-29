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
      <text x="596" y="63" className={styles.svgSmall}>RPC</text><text x="593" y="245" className={styles.svgSmall}>API呼び出し</text><text x="591" y="328" className={styles.svgSmall}>保存・読出</text><text x="454" y="281" className={styles.svgSmall}>公開調整</text>
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
      <dl><div><dt>状態の取得・更新</dt><dd>Data API / RPC → PostgreSQL</dd></div><div><dt>管理・AI操作</dt><dd>Edge Functions → PostgreSQL・外部API</dd></div><div><dt>PDFの転送・閲覧</dt><dd>Asset Worker → Private R2</dd></div><div><dt>PDF公開の調整</dt><dd>Asset Worker ↔ Edge Functions ↔ DB</dd></div></dl>
    </div>
    <div className={styles.mapFoot}><p><strong>Displayへの通知</strong><span>Supabase Realtimeを併用。通知欠落時はスナップショットを再取得。</span></p><p><strong>PowerPoint連携</strong><span>Windows / Presenter Bridge → Gateway・Edge Functions → 講義状態</span></p><p><strong>字幕音声</strong><span>実行許可後、教員ブラウザからAI APIへ直接送信。</span></p></div>
  </figure>;
}
export function TransactionFigure() {
  return <figure className={styles.syncScene}>
    <figcaption><strong>一つの回答が、教室の表示に届くまで</strong><span>投票を例にした同期経路</span></figcaption>
    <div className={styles.syncPath}>
      <div className={styles.inputNode}><span className={styles.nodeLabel}>学生のブラウザ</span><div className={styles.ballot}><span>投票</span><strong>選択肢 A</strong><span>回答を送信 <b aria-hidden="true">↗</b></span></div><small>自身の認証IDで書き込み</small></div>
      <div className={styles.pathArrow} aria-label="学生からDBへの書き込み">→</div>
      <div className={styles.databaseNode}><span className={styles.nodeLabel}>PostgreSQL</span><strong>回答・集計・バージョンを<br />一括で確定</strong><div className={styles.commitState}><span>投票の状態</span><b>v11 <i aria-hidden="true">→</i> v12</b></div><small>DBトランザクション</small></div>
      <div className={styles.pathArrow} aria-label="DBの確定状態を各端末が取得">→</div>
      <div className={styles.receiverNode}><span className={styles.nodeLabel}>学生のブラウザ群</span><div><span><i className={styles.onlineDot} />端末 A</span><strong>v12</strong><small>取得済み</small></div><div><span><i className={styles.waitDot} />端末 B</span><strong>v11 → v12</strong><small>次の取得で更新</small></div><div><span><i className={styles.offlineDot} />端末 C</span><strong>切断中</strong><small>復帰後に再取得</small></div></div>
    </div>
    <div className={styles.syncContract}><p><strong>DB内は一括更新</strong><span>回答だけを保存して集計が未更新、という途中状態を残さない。</span></p><p><strong>端末は非同期に追従</strong><span>通常5秒間隔で取得。古い応答では表示を巻き戻さない。</span></p></div>
    <p className={styles.sceneCaption}>バージョン値は説明用。全端末の受信を待ってDBをコミットする方式ではない。</p>
  </figure>;
}
export function VersionFigure() {
  return <figure className={styles.flow}><figcaption>応答の到着順が逆転した例 <span>説明用のバージョン値</span></figcaption><div className={styles.trace}>
    <div><span>① 新しい応答</span><code>polls = 12</code><strong>適用 → 表示 v12</strong></div>
    <div><span>② 遅れた応答</span><code>polls = 11</code><strong>棄却 → 表示 v12を維持</strong></div>
  </div><p className={styles.figureNote}>項目ごとに適用済みバージョンと比較する。通知にはDisplayのバージョン、字幕にはストリーム別の連番も用いる。</p></figure>;
}
export function DispatchFigure() {
  return <figure className={styles.flow}><figcaption>同一の開始要求に対する送信権の取得</figcaption><div className={styles.trace}>
    <div><span>初回</span><code>dispatchAllowed: true</code><strong>記録を作成 → 外部へ送信</strong></div>
    <div><span>再要求</span><code>dispatchAllowed: false</code><strong>既存記録を返す → 送信しない</strong></div>
  </div><div className={styles.failureBranch}><strong>応答不明のまま送信権の期限が経過</strong><span>送信済みの可能性を残し、予約額を基準に精算する。</span></div></figure>;
}
export function PublicationFigure() {
  return <figure className={styles.flow}><figcaption>PDF保存後の公開手順 <span>上から下へ進行</span></figcaption>
    <div className={styles.sequence}>
      <div className={styles.lanes}><strong>Edge Functions / DB<small>公開ジョブ・アクセス世代</small></strong><strong>Asset Worker / R2<small>PDF実体・台帳・マニフェスト</small></strong></div>
      <div className={styles.message}><span>受信結果を記録<code>uploaded</code></span><b aria-label="WorkerからDBへ">←</b><span>ハッシュ・容量を検証<code>uploaded</code></span></div>
      <div className={styles.message}><span>確定操作を準備</span><b aria-label="DBからWorkerへ">→</b><span>非公開の資料を登録<code>visible: false</code></span></div>
      <div className={styles.message}><span>応答を検証・記録<code>committed</code></span><b aria-label="WorkerからDBへ">←</b><span>マニフェストの世代・ETagを返す<code>committed</code></span></div>
      <div className={styles.message}><span>有効化する世代を確定</span><b aria-label="DBからWorkerへ">→</b><span>条件付きで公開へ切替<code>activating → active</code></span></div>
      <div className={styles.message}><span>応答を検証・公開完了<code>active</code></span><b aria-label="WorkerからDBへ">←</b><span>有効化後の世代・ETagを返す<code>visible: true</code></span></div>
    </div>
    <div className={styles.failureBranch}><strong>処理後に応答が失われた場合</strong><span>同じ公開IDで台帳と実体を照合し、完了済みの段階を確認して再開する。</span></div>
    <div className={styles.failureBranch}><strong>途中で取り消された場合</strong><span>世代・ETagを照合して巻き戻し・清掃する。終了記録を残し、遅れて届いた要求による再公開を遮断する。</span></div>
  </figure>;
}
export function LatestOnlyFigure() {
  return <figure className={styles.flow}><figcaption>ページ4の送信中に、教員が5 → 6へ進めた例</figcaption>
    <div className={styles.trace}><div><span>PowerPoint</span><code>4 → 5 → 6</code><strong>現在位置は6</strong></div><div><span>Bridgeの送信</span><code>4 → 6</code><strong>送信待ちの5を6で置換</strong></div></div>
    <p className={styles.figureNote}>通信中の要求は維持し、次に送る位置を最新値に集約する。</p>
  </figure>;
}

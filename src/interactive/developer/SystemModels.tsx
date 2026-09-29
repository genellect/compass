import styles from "./system-models.module.css";

function Arrow({ children, bidirectional = false }: { children: string; bidirectional?: boolean }) {
  return <div className={styles.arrow}><span>{children}</span><b aria-hidden="true">{bidirectional ? "↔" : "→"}</b></div>;
}

export function LectureStateModel() {
  return <figure className={styles.model}>
    <figcaption>講義状態の更新と配信</figcaption>
    <div className={styles.chain}>
      <div className={styles.node}><strong>教員・学生の操作</strong><p>教員：資料・投票・講義の進行</p><p>学生：回答・コメント</p></div>
      <Arrow>更新</Arrow>
      <div className={`${styles.node} ${styles.authority}`}><span className={styles.platform}>PostgreSQL</span><strong>講義IDに紐付く状態</strong><p>資料・投票・コメント・字幕</p><p>参加情報・開催状態・更新番号</p></div>
      <Arrow>状態を返却</Arrow>
      <div className={styles.node}><strong>各端末の画面</strong><p>教員・学生・Displayが必要な状態を取得</p><p>取得したデータを各画面へ反映</p></div>
    </div>
    <div className={styles.relationship}><strong>Displayへの更新通知</strong><span>Supabase Realtimeで再取得を促す。通知が届かない場合も、定期取得でDBの状態を確認する。</span></div>
  </figure>;
}

export function MaterialDeliveryModel() {
  return <figure className={styles.model}>
    <figcaption>表示位置とPDFの配信経路</figcaption>
    <div className={styles.path}>
      <strong className={styles.pathLabel}>講義の進行</strong>
      <div className={styles.chain}>
        <div className={styles.node}><strong>教員画面 / Bridge</strong><p>現在の資料・ページを更新</p></div><Arrow>更新</Arrow>
        <div className={`${styles.node} ${styles.authority}`}><strong>PostgreSQL</strong><p>資料ID・ページ位置</p></div><Arrow>状態を返却</Arrow>
        <div className={styles.node}><strong>学生・Display</strong><p>表示対象のページを決定</p></div>
      </div>
    </div>
    <div className={styles.path}>
      <strong className={styles.pathLabel}>資料の取得</strong>
      <div className={styles.chain}>
        <div className={styles.node}><strong>Private R2</strong><p>PDF本体・公開状態</p></div><Arrow>読出し</Arrow>
        <div className={styles.node}><strong>Asset Worker</strong><p>閲覧権限・公開状態を検証</p></div><Arrow>Range配信</Arrow>
        <div className={styles.node}><strong>学生・Display</strong><p>必要なデータを取得・描画</p></div>
      </div>
    </div>
  </figure>;
}

export function AiExecutionModel() {
  return <figure className={styles.model}>
    <figcaption>AIの実行制御とデータ経路</figcaption>
    <div className={styles.governance}><strong>PostgreSQL</strong><span>利用許可・利用枠・実行記録・停止要求</span><p>Edge Functionsが実行前に照会し、利用枠と送信記録を更新</p></div>
    <div className={styles.path}>
      <strong className={styles.pathLabel}>要約・資料分析・学術回答</strong>
      <div className={styles.chain}>
        <div className={styles.node}><strong>講義データ</strong><p>文字起こし・資料・質問</p></div><Arrow>入力</Arrow>
        <div className={styles.node}><strong>Edge Functions</strong><p>入力の準備・外部API連携・出力の検査</p></div><Arrow bidirectional>要求・応答</Arrow>
        <div className={styles.node}><strong>AIプロバイダー</strong><p>モデルによる生成</p></div>
      </div>
    </div>
    <div className={styles.relationship}><strong>字幕の音声経路</strong><span>実行許可後、教員ブラウザがAIプロバイダーへ音声を直接送信する。接続の開始・停止と利用記録はサーバーで管理する。</span></div>
  </figure>;
}

export function AccessModel() {
  return <figure className={styles.model}>
    <figcaption>認証後のアクセス判定</figcaption>
    <div className={styles.path}>
      <div className={styles.chain}>
        <div className={styles.node}><strong>学生の認証ID</strong><p>匿名認証で発行</p></div><Arrow>照合</Arrow>
        <div className={`${styles.node} ${styles.authority}`}><strong>参加関係・所有権</strong><p>DBのRLS・RPCで判定</p></div><Arrow>許可</Arrow>
        <div className={styles.node}><strong>参加中の講義</strong><p>講義の閲覧・自身の投稿や回答</p></div>
      </div>
    </div>
    <div className={styles.path}>
      <div className={styles.chain}>
        <div className={styles.node}><strong>教員の認証ID</strong><p>Google認証・TOTP</p></div><Arrow>照合</Arrow>
        <div className={`${styles.node} ${styles.authority}`}><strong>所属・管理権限</strong><p>Edge Functions・DBで判定</p></div><Arrow>許可</Arrow>
        <div className={styles.node}><strong>権限を持つ講義</strong><p>講義の管理・許可されたAI操作</p></div>
      </div>
    </div>
  </figure>;
}

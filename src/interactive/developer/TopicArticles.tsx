import { SourceLinks, Table } from "./DocPrimitives";
import { SecurityAccessModel } from "./SecurityAccessModel";
import styles from "./engineering-docs.module.css";

export function SecurityArticle() {
  return <>
<section id="identity" className={styles.section} aria-label="認証とアクセス制御">
<p>学生はSupabase Anonymous Auth、教員・管理者はGoogle OAuth＋TOTPによる二段階認証（2FA）を利用する。教員は自分の講義を操作し、管理者はこれに加えて教員アカウントと運用設定を管理する。</p>
<SecurityAccessModel />
<div id="authorization" className={styles.authorizationDetail}>
<p>教員・管理者の操作は、Edge Functionsで認証情報を検証し、DBで環境への所属・セッション・操作権限を再検証する。認可に使う行をロックし、データの参照・更新まで同一トランザクションで処理する。</p>
<p>管理セッションはAuthセッションとTOTP構成に紐付き、Authセッション作成から最大8時間有効とする。失効時は、そこから発行したAI・Display・Presenterの権限も失効する。</p>
</div>
</section>
<section id="permissions" className={styles.section}><h2>管理者権限</h2>
<p>管理者（owner）は教員を招待し、ロールとAI利用資格を設定する。アカウントの利用停止やセッション失効、環境全体のAI利用条件の変更も管理者が行い、利用台帳と監査情報を参照できる。通常の講義操作は管理者も自分の講義に限られるが、他の教員の講義を緊急停止する権限を持つ。</p>
<p>有料AIには、教員・管理者ともに利用条件と利用枠を適用する。教員の利用停止による権限失効と、講義の緊急停止は独立した操作として扱う。</p>
<p>管理台帳（アカウント・権限・セッション）の更新と環境のAI利用条件の変更には、直近5分以内のTOTP検証に基づく、一回限りの実行許可を要求する。許可を実行者と変更内容に紐付け、許可の消費、更新、監査記録を同一トランザクションで確定する。更新結果は要求IDで記録し、再送による重複更新を防ぐ。</p>
</section>
<section id="data" className={styles.section}><h2>データの保存と外部送信</h2>
<Table columns={["データ", "保存・送信先"]} rows={[
        ["講義状態・コメント・投票", "PostgreSQL。講義への参加関係と操作権限に基づいて読み書きする。"],
        ["PDF・アーカイブ", "Private R2。Workerがアクセスを検証して配信する。"],
        ["マイク音声", "字幕の開始後にAIプロバイダーへ送信する。COMPASSのDB・R2には録音ファイルとして保存しない。"],
        ["確定文字起こし", "教員ブラウザのIndexedDBに保存する。字幕はEdge Functions経由でDisplayへ配信し、要約の入力は外部AIへ送信する。"],
        ["資料テキスト・質問など", "資料分析・学術回答など、許可された処理の入力として外部APIへ送信する。"]
      ]} />
<p>ブラウザ内の文字起こしは30日を基準に清掃する。端末上で実行する処理のため、ブラウザを開いていない間に削除が完了するとは限らない。講義後アーカイブの閲覧期限と、R2上のファイルの削除は別の処理で管理する。</p>
</section>
<section id="future" className={styles.section}><h2>今後の開発計画</h2>
<p>大学・学部・講義組織を単位とするテナント分離を計画している。利用者と講義データを組織IDに紐付け、RLS・Edge Functions・DBトランザクションで所属組織と操作権限を検証する。資料配信、AI利用記録、監査・アーカイブにも組織の境界を適用する。</p>
<p>組織ごとに管理者・教員・支援担当の権限を設定し、異動や退職に伴う権限失効を管理する。支援担当には常時の講義本文閲覧を認めない。</p>
<p>本番・検証・審査には、それぞれ専用のSupabaseプロジェクトとR2バケットを用意する。OAuth設定、アクセス資格情報、AIプロジェクトと利用枠も環境ごとに独立させる。</p>
<p>学生SSO・出席管理は、QRによる未登録参加を維持し、匿名参加後にSSOを追加する構成を検討している。</p>
</section>
    <SourceLinks revision="e3ed31eaa698b2031d23df5dc7e848314fa5de25" items={[
  [
    "Google IDの検証と本人への紐付け",
    "supabase/functions/_shared/adminIdentity.ts"
  ],
  [
    "Edge Functionsの共通検証",
    "supabase/functions/_shared/googleAdminOperations.ts"
  ],
  [
    "操作別ポリシー・所有権・DBトランザクション",
    "supabase/migrations/20260811012111_phase7_30c2_unified_admin_authorization.sql"
  ],
  [
    "セッションと認証要素の再検証",
    "supabase/migrations/20260810160000_phase7_30c1_google_ai_master.sql"
  ],
  [
    "招待・管理者権限・操作の確定と監査",
    "supabase/migrations/20260812043000_phase7_30d_admin_ledger_authority.sql"
  ],
  [
    "同じAuthセッションからの復元",
    "supabase/migrations/20260825090000_admin_auth_login_restore.sql"
  ],
  [
    "教員用保存領域とトークンの除去",
    "src/lib/adminAuth/adminAuthStorage.ts"
  ],
  [
    "組織テナントと継続運用の計画",
    "docs/PHASE7_31_CONTEST_PUBLICATION_AND_COMMERCIAL_READINESS.md#L339"
  ],
  [
    "文字起こしの保存・清掃",
    "src/caption/captionTranscriptStore.ts"
  ],
  [
    "Displayへの字幕配信",
    "supabase/functions/broadcast-display-caption/index.ts"
  ],
  [
    "文字起こしを使う要約生成",
    "supabase/functions/generate-lecture-summary/index.ts"
  ]
]} />
  </>;
}

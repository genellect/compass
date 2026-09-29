import { Section, SourceLinks, Table } from "./DocPrimitives";

export function SecurityArticle() {
  return <>
    <Section id="identity" title="利用者と操作権限">
      <p>学生はQRコードや講義コードから参加し、ブラウザで匿名認証IDを取得する。氏名・学籍番号の登録は求めないが、投稿や回答はこのIDに紐付ける。DBは「どの利用者が、どの講義に参加しているか」を確認して読み書きを許可する。</p>
      <Table columns={["利用者", "認証・アクセス", "操作範囲"]} rows={[
        ["学生", "Supabase Anonymous Auth", "参加中の講義、自身の投稿・回答"],
        ["教員", "Google認証＋ワンタイムコードによる追加認証（TOTP / AAL2）", "権限を持つ講義の管理、許可されたAI操作"],
        ["Display", "講義に紐付く閲覧権限", "教室表示に必要な情報。教員管理権限は持たない。"],
        ["アーカイブ閲覧", "講義後の閲覧用アクセス", "公開条件・期限に従った閲覧"]
      ]} />
      <p>同じブラウザで教員画面と学生画面を開く場合に備え、両者の認証情報は別の保存領域で扱う。教員の操作権限は、Edge FunctionsとDBが本人確認・所属・講義の所有権から判定する。DBの行単位のアクセス制御（RLS）とサーバー側の関数（RPC）が、他の講義や他の参加者のデータへの操作を制限する。</p>
      <SourceLinks items={[["学生の匿名認証", "src/lib/anonymousAuth.ts"], ["教員用クライアント", "src/lib/adminAuth/adminSupabaseClient.ts"], ["教員用セッション保存", "src/lib/adminAuth/adminAuthStorage.ts"], ["教員の本人確認・所属・権限", "supabase/migrations/20260809143000_phase7_30b1_admin_identity_aal2.sql"]]} />
    </Section>
    <Section id="data" title="保存先と外部送信">
      <Table columns={["データ", "保存・送信先"]} rows={[
        ["講義状態・コメント・投票", "PostgreSQL。講義と参加者の権限で読み書きを制限。"],
        ["PDF・アーカイブ", "Private R2。Workerでアクセスを検証して配信。"],
        ["マイク音声", "教員が字幕を開始した際にAIプロバイダーへ送信。COMPASSのDB・R2には録音ファイルとして保存しない。"],
        ["確定文字起こし", "教員ブラウザのIndexedDB。字幕・要約に使う範囲はサーバーでも扱う。"],
        ["資料テキスト・質問など", "資料分析・学術回答など、許可された処理の入力として外部APIへ送信。"]
      ]} />
      <p>ブラウザ内の文字起こしは、30日を基準に清掃する。端末上で動く処理のため、ブラウザを開いていない間に削除が完了するとは限らない。講義後アーカイブの閲覧期限と、R2上のファイルの削除は別の処理で管理する。</p>
      <SourceLinks items={[["文字起こしの保存・清掃", "src/caption/captionTranscriptStore.ts"], ["アーカイブ出力", "supabase/functions/_shared/archiveExport.ts"], ["アーカイブ閲覧", "src/archive/archiveClient.ts"]]} />
    </Section>
    <Section id="future" title="今後の開発範囲">
      <p>学生SSO・出席管理は未実装である。QRによる未登録参加を維持し、大学が出席管理を導入する場合に、匿名参加後のSSOを追加する構成を検討している。AI統合基盤はAPI設計から見直す予定である。</p>
    </Section>
  </>;
}

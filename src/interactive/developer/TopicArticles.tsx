import { Section, SourceLinks, Table } from "./DocPrimitives";
import { AccessModel } from "./SystemModels";

export function SecurityArticle() {
  return <>
    <Section id="identity" title="認証と講義への参加">
      <p>学生はQRコードや講義コードから参加する。Supabase Anonymous Authがブラウザに匿名の認証IDを発行し、投稿や回答をこのIDに紐付ける。氏名・学籍番号の登録は不要で、このIDによる大学の在籍確認は行わない。</p>
      <p>教員はGoogle認証に加え、TOTPによるワンタイムコード認証を行う。同じブラウザで教員画面と学生画面を利用できるよう、教員用と学生用の認証情報は別の保存領域で管理する。</p>
    </Section>

    <Section id="authorization" title="サーバー側の認可">
      <p>認証IDを持つだけで、すべての講義にアクセスできるわけではない。学生は講義への参加関係、教員は本人確認・所属・管理権限に基づいて、サーバーが操作の可否を判定する。</p>
      <AccessModel />
      <p>ブラウザからDBへアクセスする経路には行単位のアクセス制御（RLS）を設定し、他の講義や他の参加者のデータへの操作を制限する。Edge FunctionsやDB関数を経由する処理でも、対象講義と利用者の権限を検証する。</p>
      <p>Displayには教室表示に必要な講義の閲覧権限を与え、教員の管理権限は与えない。講義後のアーカイブは、講義中の操作とは別の閲覧用アクセスとして、公開条件と期限を確認する。</p>
    </Section>

    <Section id="data" title="データの保存と外部送信">
      <Table columns={["データ", "保存・送信先"]} rows={[
        ["講義状態・コメント・投票", "PostgreSQL。講義への参加関係と操作権限に基づいて読み書きする。"],
        ["PDF・アーカイブ", "Private R2。Workerがアクセスを検証して配信する。"],
        ["マイク音声", "字幕の開始後にAIプロバイダーへ送信する。COMPASSのDB・R2には録音ファイルとして保存しない。"],
        ["確定文字起こし", "教員ブラウザのIndexedDBに保存する。字幕・要約に使う範囲はサーバーでも扱う。"],
        ["資料テキスト・質問など", "資料分析・学術回答など、許可された処理の入力として外部APIへ送信する。"]
      ]} />
      <p>ブラウザ内の文字起こしは30日を基準に清掃する。端末上で実行する処理のため、ブラウザを開いていない間に削除が完了するとは限らない。講義後アーカイブの閲覧期限と、R2上のファイルの削除は別の処理で管理する。</p>
    </Section>

    <Section id="future" title="今後の開発範囲">
      <p>学生SSO・出席管理は未実装である。QRによる未登録参加を維持し、大学が出席管理を導入する場合に、匿名参加後のSSOを追加する構成を検討している。AI統合基盤はAPI設計から見直す予定である。</p>
    </Section>
    <SourceLinks items={[
  [
    "学生の匿名認証",
    "src/lib/anonymousAuth.ts"
  ],
  [
    "教員用クライアント",
    "src/lib/adminAuth/adminSupabaseClient.ts"
  ],
  [
    "教員用セッション保存",
    "src/lib/adminAuth/adminAuthStorage.ts"
  ],
  [
    "教員の本人確認・所属・権限",
    "supabase/migrations/20260809143000_phase7_30b1_admin_identity_aal2.sql"
  ],
  [
    "文字起こしの保存・清掃",
    "src/caption/captionTranscriptStore.ts"
  ],
  [
    "アーカイブ出力",
    "supabase/functions/_shared/archiveExport.ts"
  ],
  [
    "アーカイブ閲覧",
    "src/archive/archiveClient.ts"
  ]
]} />
  </>;
}

import { Flow, Note, Section, SourceLinks, Table } from "./DocPrimitives";
import { DispatchFigure, LatestOnlyFigure, PublicationFigure, TransactionFigure, VersionFigure } from "./MechanismFigures";

export function ArchitectureArticle() {
  return <>
    <TransactionFigure />
    <Section id="state" title="同期プロトコル">
      <p>回答の保存を契機に、DBトリガーが集計値とバージョンを更新する。端末は適用済みのバージョンを送信し、変更のある項目を取得する。</p>
      <Table columns={["取得対象", "内容", "取得単位"]} rows={[
        ["講義の共通状態", "資料ページ、投票結果、公開コメント、字幕・要約", "項目別の既知バージョンを送信し、変更された項目を返す。"],
        ["本人の状態", "自身の回答、リアクション、投稿可否", "認証IDから参加者を特定する専用RPC。共通状態と分離。"],
        ["コメント履歴", "画面に収まらない過去のコメント", "時刻とIDのカーソルでページング。履歴を開いた際に取得。"]
      ]} />
      <SourceLinks items={[["回答・集計・バージョンの更新", "supabase/migrations/20260711020445_live_state_integration.sql"], ["共通状態と本人状態の分離", "supabase/migrations/20260714021129_phase1_sync_protocol_v2.sql"], ["スナップショットの取得契約", "src/repositories/supabaseLiveStateRepository.ts"]]} />
    </Section>
    <Section id="capacity" title="同時参加と配信負荷">
      <p>学生端末は通常5秒間隔で状態を取得する。教員1人・Display1台・学生300人を想定し、同時参加時のロック競合、取得ごとの書き込み、繰り返し集計を抑制している。</p>
      <Table columns={["対象", "現行の制御"]} rows={[
        ["参加要求の競合", <>講義行を<code>FOR SHARE</code>で確認し、参加要求同士の排他ロックを避ける。終了処理の<code>FOR UPDATE</code>とは競合させ、参加と終了の順序を確定する。</>],
        ["配信するデータ量", "項目別バージョンを照合。コメントは1回最大25件、過去の履歴は別取得とする。投票結果には保存済み集計値を使う。"],
        ["参加状況の書き込み", "最終アクセス時刻の更新は45秒以上の間隔を置く。5秒ごとの取得すべてをpresence更新にしない。"],
        ["参加人数の集計", "直近90秒の活動を概数として扱い、講義ごとの15秒バケットで集計結果を再利用する。"],
        ["端末の休止・通信失敗", "開始・復帰時の取得タイミングを分散。背面タブの取得を間引き・停止し、失敗時は再試行間隔を延ばす。"]
      ]} />
      <Note>300人は実装が想定する単一講義の規模であり、この資料による性能保証ではない。通信要求は参加者数に応じて増加し、DBの共有行には更新時の競合が残る。複数講義の同時利用は別途負荷評価の対象となる。</Note>
      <SourceLinks items={[["300人規模を想定した参加・配信処理", "supabase/migrations/20260826085622_single_lecture_300_capacity_hardening.sql"], ["参加人数の15秒バケット集計", "supabase/migrations/20260716140920_phase6_6_ux_archive_metrics_digest.sql"], ["取得間隔・復帰時の分散", "src/lib/liveSync.ts"], ["背面タブと再試行", "src/hooks/useAdaptiveLiveSync.ts"]]} />
    </Section>
    <Section id="recovery" title="遅延・切断からの復帰">
      <p>各端末は適用済みバージョンを保持する。ネットワーク上で応答の順序が入れ替わっても、古い状態で新しい表示を上書きしない。講義を切り替えた後に届いた応答は、要求時の世代を照合して除外する。</p>
      <VersionFigure />
      <Flow title="Displayで通知が欠落した場合" steps={[["DBで更新", "講義状態を確定"], ["通知が欠落", "Displayの表示が遅れる"], ["定期取得", "現在の状態を再取得"], ["表示を更新", "取得したバージョンへ追従"]]} note="Displayは非公開Realtime通知と通常5秒間隔の取得を併用する。確定字幕はスナップショットから復帰できるが、欠落した途中の文字列をすべて再生するわけではない。" />
      <SourceLinks items={[["項目別のバージョン比較", "src/lib/liveSnapshot.ts"], ["応答の適用と講義切替の世代管理", "src/context/CompassStateContext.tsx"], ["Displayの通知・連番・再接続", "src/display/displayRealtime.ts"]]} />
    </Section>
    <Section id="lifecycle" title="講義の終了">
      <Flow title="講義の状態遷移" steps={[["draft", "準備"], ["open", "参加・回答を受付"], ["closed", "新規書き込みを停止"]]} />
      <p>開始時にDB時刻で期限を定め、現行実装では最大90分で終了する。手動終了と期限切れは共通の終了処理に集約し、RPCでも期限を検証する。教員ブラウザの停止や定期処理の遅延があっても、端末の時計だけで受付可否を決めない。</p>
      <SourceLinks items={[["講義行のロック・期限・終了処理", "supabase/migrations/20260714080706_phase2_lecture_lifecycle.sql"]]} />
    </Section>
  </>;
}

export function DeliveryArticle() {
  return <>
    <Section id="path" title="資料の配信経路">
      <p>PDF本体はPrivate R2、資料ID・公開状態・現在ページはPostgreSQLで管理する。ページ移動時に同期するのは位置情報であり、PDFや映像を端末ごとに送り直す処理ではない。</p>
      <Flow title="PDFのアップロードと閲覧" steps={[["教員ブラウザ", "PDFを検査・チケットを取得"], ["Asset Worker", "認可と実体を検証"], ["Private R2", "PDFを保存"], ["学生・Display", "Worker経由でRange取得"]]} />
      <SourceLinks items={[["配信・チケットの検証", "cloudflare/asset-worker/src/worker.ts"]]} />
    </Section>
    <Section id="publication" title="DBとR2をまたぐ公開トランザクション">
      <p>DBの更新とR2への保存は、一つのACIDトランザクションにできない。公開ジョブ、Workerの台帳、配信用マニフェストを照合し、保存・確定・有効化を段階的に進める。</p>
      <PublicationFigure />
      <Table columns={["制御情報", "役割"]} rows={[
        ["publication ID・世代", "どの公開要求に属する処理かを識別し、古い世代の操作を拒否する。"],
        ["PDFハッシュ・バイト数", "チケットが示す資料と、実際に受信したファイルを照合する。"],
        ["ETagによる条件付き更新", "読み取った台帳・マニフェストが更新済みなら書き換えを拒否し、競合を検出する。"],
        ["清掃・終了の記録", "取り消し後の遅延要求による再公開を遮断する。待ち時間の経過だけを安全条件にしない。"]
      ]} />
      <SourceLinks items={[["公開手順と応答の検証", "supabase/functions/manage-pdf-publications/index.ts"], ["Workerの公開状態・復旧・ETag制御", "cloudflare/asset-worker/src/pdfPublication.ts"], ["DB側の公開ジョブ・調整処理", "supabase/migrations/20260721075029_phase7_26_browser_pdf_publication.sql"], ["有効化中の終了と清掃", "supabase/migrations/20260721190000_phase7_26_terminal_activation_cleanup.sql"]]} />
    </Section>
    <Section id="presenter" title="PowerPoint連携">
      <p>Windows上のPresenter BridgeがPowerPointのスライド位置を観測し、対応するPDFページを講義状態へ反映する。ブラウザとのペアリング後、更新はGateway・Edge Functionsを経由する。</p>
      <LatestOnlyFigure />
      <Table columns={["送信側の状態", "用途"]} rows={[
        [<code key="desired">desired</code>, "PowerPointで観測した最新位置。送信待ちの位置を上書きする。"],
        [<code key="ack">acknowledged</code>, "送信先から応答を受け、更新を確認できた位置。"],
        [<code key="uncertain">unacknowledgedAttempt</code>, "送信済みだが応答未確認の要求があることを記録する。"]
      ]} />
      <h3>応答が失われた場合</h3>
      <p>確認済み位置が4、ページ5への更新後に応答だけが失われ、その間に教員が4へ戻った場合、送信先は5のままかもしれない。このため、確認済み位置と同じ4でも再送する。位置が変わらない再試行には、同じ要求ID・連番を使う。</p>
      <Note>連携対象はスライドとPDFのページ位置である。PowerPointのアニメーションや動画の再現は対象外となる。</Note>
      <SourceLinks items={[["最新位置・確認済み位置・再送の管理", "presenter-bridge/src/Compass.Presenter.Core/LatestOnlyPageDispatcher.cs"], ["PowerPointの状態観測", "presenter-bridge/src/Compass.Presenter.PowerPoint.External/PowerPointComObservationSource.cs"], ["連携対象の資料条件", "presenter-bridge/src/Compass.Presenter.Core/PresentationEligibilityEvaluator.cs"]]} />
    </Section>
  </>;
}

export function AiArticle() {
  return <>
    <Section id="features" title="機能とデータ">
      <Table columns={["機能", "入力", "出力"]} rows={[
        ["字幕", "教員が許可したマイク音声", "逐次字幕・確定した文字起こし"],
        ["講義要約", "対象時間帯の文字起こし・コメント", "定期的な要点。入力不足時は生成・公開を見送る。"],
        ["資料分析・投票案", "PDFから抽出したテキスト", "教材の分析・投票の下書き"],
        ["学術回答", "質問・検索した文献", "出典付きの参考回答。教員による訂正・非表示。"]
      ]} />
      <p>各機能は共通の利用許可・利用量管理を経由する。許可の取得と実行開始は分かれており、マイクの使用には教員による開始操作が必要となる。</p>
    </Section>
    <Section id="dispatch" title="送信記録と再要求の扱い">
      <p>有料処理は、利用枠の予約、外部APIへの送信権取得、結果と利用量の確定に分ける。DBは開始要求IDに操作・プロバイダー・要求を結び付け、送信権を取得した記録を保存する。</p>
      <DispatchFigure />
      <p>再要求では既存の送信記録を先に確認する。後から機能やセッションが無効になっても、同じ処理を未送信に戻さない。記録と異なる操作・プロバイダーへの差し替えは拒否する。</p>
      <Note>制御の単位は同じ開始要求に結び付いた送信である。外部プロバイダーを含む「必ず一度だけの実行」を保証するものではない。</Note>
      <SourceLinks items={[["送信権・要求の対応付け・応答不明時の精算", "supabase/migrations/20260811203000_phase7_30c2_google_ai_provider_dispatch.sql"], ["要約の送信失敗処理", "supabase/migrations/20260905161526_summary_dispatch_failure_guard.sql"]]} />
    </Section>
    <Section id="admission" title="開始と停止の競合">
      <p>送信権の取得時に、教員セッション、講義の所有権と期限、利用方針、AI許可、利用枠を再確認する。講義・AI制御・利用記録を停止処理と同じ順序でロックし、競合時の判断をDBで確定する。</p>
      <Flow title="送信前のロック順序" steps={[["講義", "開催状態・期限"], ["AI制御", "許可・停止要求"], ["利用記録", "実行中・未送信を確認"]]} note="停止が先に確定すれば新たな送信を拒否する。すでに送信した処理は送信記録を保持して精算する。" />
      <p>教員画面の一括操作も、機能ごとの開始結果を扱う。停止・講義切替の後に返った開始結果は次の講義へ適用しない。</p>
      <SourceLinks items={[["教員セッションに紐付くAI許可", "supabase/migrations/20260820081453_google_aal2_session_ai_master.sql"], ["一括開始・中断・講義切替", "src/components/AdminAiControl/aiQuickStart.ts"]]} />
    </Section>
    <Section id="evidence" title="学術回答の生成と検査">
      <Flow title="検索結果から回答を生成する経路" steps={[["文献検索", "PubMed・Crossref・OpenAlex"], ["書誌照合", "識別子・研究種別など"], ["回答生成", "取得した文献IDを指定"], ["出力検査", "主張・出典・数値の対応"]]} />
      <p>文献の識別子と主張の参照関係を検査するが、論文の解釈まで自動で正しいと判定するものではない。自動公開の経路には教員未確認の表示があり、すべての回答が公開前に人の確認を受ける仕様ではない。</p>
      <SourceLinks items={[["文献検索と回答検査", "supabase/functions/_shared/academicAnswers.ts"], ["要約・学術回答の公開処理", "supabase/functions/generate-lecture-summary/index.ts"]]} />
    </Section>
  </>;
}

export function SecurityArticle() {
  return <>
    <Section id="identity" title="利用者と操作権限">
      <p>学生はQRコードや講義コードから未登録で参加する。内部では匿名認証IDを発行し、DBが認証IDと講義への参加関係を照合する。氏名・学籍番号の登録は参加条件としない。</p>
      <Table columns={["利用者", "認証・アクセス", "操作範囲"]} rows={[
        ["学生", "Supabase Anonymous Auth", "参加中の講義、自身の投稿・回答"],
        ["教員", "Google認証＋TOTP / AAL2", "権限を持つ講義の管理、許可されたAI操作"],
        ["Display", "講義に紐付く閲覧権限", "教室表示に必要な情報。教員管理権限は持たない。"],
        ["アーカイブ閲覧", "講義後の閲覧用アクセス", "公開条件・期限に従った閲覧"]
      ]} />
      <p>学生と教員の認証クライアント・保存領域は分離する。書き込みの可否は、Edge FunctionsとDBのRLS・RPCが所有権、セッション、講義状態から判断する。</p>
      <SourceLinks items={[["学生の匿名認証", "src/lib/anonymousAuth.ts"], ["教員用クライアント", "src/lib/adminAuth/adminSupabaseClient.ts"], ["教員用セッション保存", "src/lib/adminAuth/adminAuthStorage.ts"], ["教員の本人確認・所属・権限", "supabase/migrations/20260809143000_phase7_30b1_admin_identity_aal2.sql"]]} />
    </Section>
    <Section id="data" title="保存先と外部送信">
      <Table columns={["データ", "保存・送信先"]} rows={[
        ["講義状態・コメント・投票", "PostgreSQL。講義と参加者の権限で読み書きを制限。"],
        ["PDF・アーカイブ", "Private R2。Workerでアクセスを検証して配信。"],
        ["マイク音声", "許可された字幕処理でAIプロバイダーへ送信。COMPASSのDB・R2に録音ファイルを保存する経路ではない。"],
        ["確定文字起こし", "教員ブラウザのIndexedDB。字幕・要約に使う範囲はサーバーでも扱う。"],
        ["資料テキスト・質問など", "資料分析・学術回答など、許可された処理の入力として外部APIへ送信。"]
      ]} />
      <p>IndexedDBには30日を基準とする清掃処理があるが、実行にはブラウザの動作が必要となる。アーカイブの閲覧期限と保存データの削除も別の処理である。外部AIでの保持条件は、利用先の契約・設定に従う。</p>
      <SourceLinks items={[["文字起こしの保存・清掃", "src/caption/captionTranscriptStore.ts"], ["アーカイブ出力", "supabase/functions/_shared/archiveExport.ts"], ["アーカイブ閲覧", "src/archive/archiveClient.ts"]]} />
    </Section>
    <Section id="future" title="今後の開発範囲">
      <p>学生SSO・出席管理は未実装である。QRによる未登録参加を維持し、大学が出席管理を導入する場合に、匿名参加後のSSOを追加する構成を検討している。AI統合基盤はAPI設計から見直す予定である。</p>
    </Section>
  </>;
}

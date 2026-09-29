import { Flow, Section, SourceLinks, Table } from "./DocPrimitives";
import { AiExecutionModel, MaterialDeliveryModel } from "./SystemModels";
import styles from "./engineering-docs.module.css";

export function DeliveryArticle() {
  return <>
    <Section id="path" title="資料の配信経路">
      <p>講義中の表示位置はPostgreSQL、PDF本体はPrivate R2で管理する。学生端末とDisplayは講義状態から表示する資料とページを決め、Asset Workerを通してPDFを取得する。画面の映像を転送する方式ではなく、各ブラウザがPDFを描画する構成である。</p>
      <MaterialDeliveryModel />
      <p>Asset Workerは閲覧権限と公開状態を確認してからPDFを返す。HTTP Rangeに対応し、ブラウザは必要なバイト範囲を指定して取得できる。ページの変更通知にPDF本体を含める必要はない。</p>
    </Section>

    <Section id="publication" title="資料の公開手順">
      <p>資料の追加は、アップロード、公開準備、配信側の有効化、DBへの確定という段階で進める。アップロード済みのファイルが、そのまま学生の閲覧対象になることはない。</p>
      <figure className={styles.flow}>
        <figcaption>DBと配信側の公開処理</figcaption>
        <div className={styles.sequence}>
          <div className={styles.lanes}>
            <strong>Edge Functions / DB<small>公開台帳・講義の資料一覧</small></strong>
            <strong>Asset Worker / R2<small>PDF本体・配信用マニフェスト</small></strong>
          </div>
          <div className={styles.message}>
            <span>ファイルの受信結果を台帳に記録</span><b aria-label="WorkerからDBへ受信結果を返す">←</b><span>ハッシュ・容量を検証して保存</span>
          </div>
          <div className={styles.message}>
            <span>公開準備を指示</span><b aria-label="DB側からWorkerへ公開準備を要求">→</b><span>資料を非公開の状態で登録</span>
          </div>
          <div className={styles.message}>
            <span>公開先の世代番号を記録し、有効化を指示</span><b aria-label="DB側からWorkerへ有効化を要求">→</b><span>公開状態と世代番号を更新</span>
          </div>
          <div className={styles.message}>
            <span>結果を照合し、資料一覧・世代番号・表示状態を一括確定</span><b aria-label="WorkerからDBへ有効化の結果を返す">←</b><span>更新後の世代番号とETagを返す</span>
          </div>
        </div>
      </figure>
      <p>R2側のマニフェストは、配信対象のファイルと公開状態を記録する一覧である。DB側の公開台帳は処理の進行を記録する。Edge Functionsが両者の応答を照合し、配信側の有効化を確認した後に、DBの資料一覧と講義の表示状態を更新する。</p>
    </Section>

    <Section id="consistency" title="DBとR2の整合性">
      <p>DBとR2は独立した保存先であり、両方の更新を一つのトランザクションで確定することはできない。そのため、公開処理の識別、競合する更新の検出、閲覧時の世代照合を組み合わせて整合性を保つ。</p>
      <Table columns={["識別情報", "役割"]} rows={[
        ["公開ID・操作ID", "再試行が同じ公開処理であることを識別する。台帳と配信側の記録から完了済みの段階を確認する。"],
        ["マニフェストのETag", "読み取り後に別の処理がマニフェストを更新していないかを照合する。公開の取り消し時にも確認する。"],
        ["閲覧世代（access_version）", "閲覧チケットと配信側の公開状態を照合する。一致しない世代のチケットでは配信しない。"]
      ]} />
      <p>配信側の更新だけが完了し、応答が失われると、DBとR2の世代番号が一時的に一致しないことがある。この間は閲覧を拒否し、未確定の組み合わせで資料を返さない。同じIDで再試行すると、配信側の完了状態を確認してDBの確定へ進める。</p>
      <p>講義終了後に届いた公開要求は取り消す。取り消しの際も対象資料・世代・ETagを確認し、後続の公開結果を上書きしない。終了・削除の記録は残し、遅れた要求で資料が再び公開されることを防ぐ。</p>
    </Section>

    <Section id="presenter" title="PowerPoint連携">
      <p>Windows上のPresenter Bridgeは、COMを通じてPowerPointの現在のスライドを観測する。対応するPDFのページ位置をGateway・Edge Functions経由でDBへ送り、ブラウザ操作と同じ講義状態の配信経路へ接続する。</p>
      <Flow title="PowerPointから講義状態への反映" steps={[
        ["PowerPoint", "現在のスライドをCOMで取得"],
        ["Presenter Bridge", "送信待ちの位置を最新値に更新"],
        ["Gateway / DB", "資料の対応と要求の連番を確認"],
        ["各端末", "講義状態を取得し、該当ページを表示"]
      ]} />
      <p>Bridgeは、送信中の位置、次に送る位置、サーバーで確認済みの位置を別々に保持する。送信中にスライドが進んだ場合は、待機中の位置を最新値へ置き換える。通信遅延で操作が蓄積しても、過去の位置を順番に送らず、現在位置へ追従する。</p>
      <p>応答を確認できない要求は、未反映とは断定できない。そのため未確認の送信がある間は、現在位置が以前の確認済み位置と同じでも送信を省略しない。DB側では同一要求の再送を識別し、古い連番の更新は拒否する。</p>
      <p>接続時に確認したPDFやPowerPointの内容が変わった場合は接続を失効させる。連携対象は対応付けた資料のページ位置であり、PowerPointのアニメーションや動画は配信しない。</p>
    </Section>
    <SourceLinks items={[
  [
    "閲覧権限・資料の公開状態・Range配信",
    "cloudflare/asset-worker/src/worker.ts#L1682"
  ],
  [
    "同じ操作IDによる公開処理と応答の検証",
    "supabase/functions/manage-pdf-publications/index.ts#L649"
  ],
  [
    "非公開登録・有効化・完了済み状態の回収",
    "cloudflare/asset-worker/src/pdfPublication.ts#L1361"
  ],
  [
    "DBでの資料・閲覧世代・講義状態の更新",
    "supabase/migrations/20260721075029_phase7_26_browser_pdf_publication.sql#L1651"
  ],
  [
    "終了後の取り消しと清掃記録",
    "cloudflare/asset-worker/src/pdfPublication.ts#L972"
  ],
  [
    "最新位置・確認済み位置・再試行",
    "presenter-bridge/src/Compass.Presenter.Core/LatestOnlyPageDispatcher.cs#L42"
  ],
  [
    "資料の照合、同一要求の再送、古い連番の拒否",
    "supabase/migrations/20260905074220_presenter_bound_authority_and_terminal_lease.sql#L561"
  ],
  [
    "PowerPointの状態観測",
    "presenter-bridge/src/Compass.Presenter.PowerPoint.External/PowerPointComObservationSource.cs"
  ]
]} />
  </>;
}

export function AiArticle() {
  return <>
    <Section id="features" title="AI処理の構成">
      <p>AIは、講義中の字幕・要約、教材の分析、質問への参考回答に利用する。実行条件と利用枠をPostgreSQLに記録し、Edge Functionsが外部APIとの連携を担当する。字幕の音声は、サーバーの実行許可を得た教員ブラウザからAIプロバイダーへ直接送信する。</p>
      <AiExecutionModel />
      <Table columns={["機能", "入力", "講義での利用"]} rows={[
        ["字幕", "教員が許可したマイク音声", "逐次字幕を表示し、確定した文字起こしを保存する。"],
        ["講義要約", "対象時間帯の文字起こし・コメント", "定期的に要点を生成する。入力不足時は生成・公開を見送る。"],
        ["資料分析・投票案", "PDFから抽出したテキスト", "教材の分析と投票の下書きを作成する。"],
        ["学術回答", "質問・検索した文献", "出典付きの参考回答を生成する。教員が訂正・非表示にできる。"]
      ]} />
    </Section>

    <Section id="dispatch" title="実行許可と利用量管理">
      <p>有料の生成処理は、利用許可の確認、利用枠の予約、送信記録の確定を経て開始する。DBは講義ごとの利用枠と実行記録を管理し、Edge Functionsは許可された要求をAIプロバイダーへ送る。</p>
      <Flow title="生成処理の実行手順" steps={[
        ["利用枠の予約", "権限・利用条件・残り枠を確認"],
        ["送信記録の確定", "開始要求ID・操作・送信先を記録"],
        ["外部APIの呼び出し", "初回の送信許可に従って実行"],
        ["結果と利用量の記録", "応答を処理し、予約した利用枠を精算"]
      ]} />
      <p>外部AIの処理はDBトランザクションの外で実行される。応答が失われても処理済みの可能性があるため、同じ開始要求IDが届いたときは既存の送信記録を返し、新しい送信許可を出さない。操作や送信先を差し替えた同一IDの要求も拒否する。</p>
      <p>既存の送信記録は、現在の機能の有効・無効を調べる前に照合する。権限が後から変わっても、送信済みの処理を未送信に戻さないためである。</p>
      <details className={styles.supplement}><summary>資料分析の結果が不明な場合の精算</summary><p>送信後の結果を確認できないまま記録の期限を過ぎた場合、予約額を利用記録に計上する。外部で実行済みの可能性を考慮した管理上の精算であり、AIプロバイダーから取得した請求額ではない。</p></details>
    </Section>

    <Section id="admission" title="字幕セッションの制御">
      <p>字幕は、一度の応答で完了する生成処理と異なり、ブラウザとAIプロバイダーの音声接続が続く。開始時には講義の開催状態、教員の権限、利用許可、停止要求をDBで確認する。</p>
      <p>開始処理と停止処理は、講義、字幕制御、利用記録を同じ順序でロックする。停止が先に確定していれば新しい送信を拒否し、送信許可が先に確定していれば、その記録を残したまま接続の終了と精算を処理する。</p>
      <p>外部の接続が作られた後に応答が失われることもある。通話IDで接続を特定できる場合は終了要求を保存し、外部接続の終了処理へ進める。ブラウザ上の停止表示だけで終了したとは扱わない。</p>
      <details className={styles.supplement}><summary>開始要求の期限と字幕の利用時間</summary><p>送信記録の期限は、開始結果が不明な要求を精算するためのものである。起動済みの音声接続を、この期限だけで終了させることはない。ただし、期限後に同じ開始要求が再要求された場合は、開始応答を利用できなかったものとして終了要求と精算を処理する。</p></details>
    </Section>

    <Section id="evidence" title="学術回答の生成と公開">
      <p>学術回答では、PubMed・Crossref・OpenAlexから文献を検索し、取得した書誌情報を根拠として回答を生成する。生成結果には文献IDとの対応を持たせ、出典と数値の整合を検査してから公開する。</p>
      <Flow title="検索から公開まで" steps={[
        ["文献検索・照合", "識別子や研究種別を確認"],
        ["回答生成", "取得した文献IDを指定"],
        ["出力検査", "主張・出典・数値の対応を確認"],
        ["公開・教員確認", "未確認の表示と、訂正・非表示の操作"]
      ]} />
      <p>出典との対応を検査しても、論文の解釈まで正しいとは限らない。自動公開した回答には教員未確認の表示を付け、教員が内容を確認して訂正・非表示にできる。</p>
    </Section>
    <SourceLinks items={[
  [
    "開始要求と送信記録の照合・再送拒否",
    "supabase/migrations/20260811203000_phase7_30c2_google_ai_provider_dispatch.sql#L328"
  ],
  [
    "現行の期限切れ精算処理",
    "supabase/migrations/20260812023000_phase7_30c2_google_realtime_provider.sql#L2217"
  ],
  [
    "字幕の送信前検証とロック順序",
    "supabase/migrations/20260811203000_phase7_30c2_google_ai_provider_dispatch.sql#L442"
  ],
  [
    "応答消失時の通話終了と精算",
    "supabase/migrations/20260812023000_phase7_30c2_google_realtime_provider.sql#L2333"
  ],
  [
    "起動済み通話を期限切れ回収から除外",
    "supabase/migrations/20260812023000_phase7_30c2_google_realtime_provider.sql#L2490"
  ],
  [
    "文献検索・書誌照合・回答検査",
    "supabase/functions/_shared/academicAnswers.ts"
  ],
  [
    "要約・学術回答の公開",
    "supabase/functions/generate-lecture-summary/index.ts"
  ]
]} />
  </>;
}

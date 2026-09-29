import { Flow, Section, SourceLinks, Table } from "./DocPrimitives";
import styles from "./engineering-docs.module.css";

export function DeliveryArticle() {
  return <>
    <Section id="path" title="資料の配信経路">
      <p>教員がPowerPointやブラウザでページを進めると、学生端末と教室のDisplayも対応するPDFページへ移動する。同期するのは資料IDとページ位置であり、画面の映像ではない。</p>
      <Flow title="ページ移動時の処理" steps={[
        ["教員がページを変更", "講義状態の資料ID・ページ位置を更新"],
        ["各端末が状態を取得", "対応するPDFページへ移動"],
        ["必要な資料を取得", "Asset Workerを経由し、Private R2からPDFをRange取得"]
      ]} />
      <p>講義状態はPostgreSQL、PDF本体はPrivate R2に保存する。Workerは閲覧権限と公開状態を確認してから、要求された範囲のデータを返す。</p>
      <SourceLinks items={[["閲覧権限・資料の公開状態・Range配信", "cloudflare/asset-worker/src/worker.ts#L1682"]]} />
    </Section>

    <Section id="publication" title="PDFの公開と障害復旧">
      <p>PDFは、アップロードの完了だけでは学生に公開されない。Workerがハッシュと容量を検証し、マニフェストへ非公開の資料として登録する。マニフェストは、配信対象ファイルと公開状態の一覧である。</p>
      <p>公開時には、閲覧を許可する公開状態の世代番号（閲覧世代）を更新する。Workerが先に公開状態を切り替え、その応答を確認したDBが資料一覧・閲覧世代・講義の表示状態をまとめて更新する。</p>
      <figure className={styles.flow}>
        <figcaption>PDFの公開手順<span>DBとR2は別々に更新される</span></figcaption>
        <div className={styles.sequence}>
          <div className={styles.lanes}>
            <strong>Edge Functions / DB<small>公開要求と講義状態</small></strong>
            <strong>Asset Worker / R2<small>PDF本体と配信用マニフェスト</small></strong>
          </div>
          <div className={styles.message}>
            <span>受信結果を記録</span><b aria-label="WorkerからDBへ受信結果を返す">←</b><span>ファイルを検証して保存</span>
          </div>
          <div className={styles.message}>
            <span>公開準備を指示</span><b aria-label="DB側からWorkerへ準備を要求">→</b><span>新しい資料を非公開で登録</span>
          </div>
          <div className={styles.message}>
            <span>準備完了を確認し、目標の閲覧世代を記録</span><b aria-label="DB側からWorkerへ公開を要求">→</b><span>公開状態と閲覧世代を切替</span>
          </div>
          <div className={styles.message}>
            <span>応答を検証し、資料一覧・閲覧世代・表示状態を一括更新</span><b aria-label="WorkerからDBへ公開結果を返す">←</b><span>切替後の世代とETagを返す</span>
          </div>
        </div>
        <p className={styles.figureNote}>更新時は、読み取ったマニフェストの版を識別するETagを照合する。取り消し処理でも、読み取り後に別の公開処理が更新していた場合は書き換えを拒否し、新しい公開状態を上書きしない。</p>
      </figure>

      <h3>Workerの更新後に応答が失われた場合</h3>
      <p>R2側の切替だけが完了し、DBには未完了の記録が残ることがある。Workerは閲覧チケットとマニフェストの閲覧世代（<code>access_version</code>）を照合し、一致しない要求を拒否する。この番号は公開状態を示すもので、PDFの内容を識別するハッシュとは異なる。</p>
      <figure className={styles.flow}>
        <figcaption>公開途中の不一致と再試行<span>世代番号は説明用</span></figcaption>
        <div className={styles.trace}>
          <div><span>公開前</span><span>DB：世代7<br />R2：世代7</span><strong>世代7のチケットで閲覧できる</strong></div>
          <div><span>応答が消失</span><span>DB：世代7<br />R2：世代8</span><strong>世代7のチケットは拒否される</strong></div>
          <div><span>同じ要求で再試行</span><span>R2の完了済み状態を照合し、DBを世代8へ更新</span><strong>世代8のチケットで閲覧を再開</strong></div>
        </div>
      </figure>
      <p>再試行では同じ公開IDと操作IDを使い、台帳・PDF実体・マニフェストから完了済みの段階を確認する。その間に講義が終了した場合は公開を取り消し、対象資料と世代を照合してマニフェストを戻す。終了済みの台帳と削除済みの記録を残し、遅れて到着した要求による再公開も遮断する。</p>
      <SourceLinks items={[
        ["同じ操作IDによる公開処理と応答の検証", "supabase/functions/manage-pdf-publications/index.ts#L649"],
        ["非公開登録・有効化・完了済み状態の回収", "cloudflare/asset-worker/src/pdfPublication.ts#L1361"],
        ["DBでの資料・閲覧世代・講義状態の更新", "supabase/migrations/20260721075029_phase7_26_browser_pdf_publication.sql#L1651"],
        ["終了後の取り消しと清掃記録", "cloudflare/asset-worker/src/pdfPublication.ts#L972"]
      ]} />
    </Section>

    <Section id="presenter" title="PowerPoint連携">
      <p>Windows上のPresenter BridgeがPowerPointの現在位置を観測し、Gateway・Edge Functionsを通じて講義状態を更新する。ページ4の送信中に教員が5、6へ進めた場合、次の送信対象は6へ更新する。通信が遅れた間の操作をすべて再生せず、現在位置への追従を優先する。</p>
      <h3>送信済みと確認済みの扱い</h3>
      <p>ページ5への更新後に応答だけが失われ、その間に教員が4へ戻った場合、サーバーには5が残っている可能性がある。この場合は、以前の確認済み位置と同じ4であっても送信する。</p>
      <figure className={styles.flow}>
        <figcaption>更新に成功しても、応答だけが失われる場合</figcaption>
        <div className={styles.trace}>
          <div><span>ページ4を表示中</span><span>Bridgeの確認済み位置：4</span><strong>DBのページ：4</strong></div>
          <div><span>ページ5を送信</span><span>DBは更新したが、応答が届かない</span><strong>DBのページ：5</strong></div>
          <div><span>教員が4へ戻る</span><span>未確認の送信があるため、4を送信</span><strong>DBのページ：4へ更新</strong></div>
        </div>
      </figure>
      <p>受信するDBも要求の連番を確認する。同一要求の再送には書き換えずに応答し、古い連番は拒否する。接続時に確認したPDFやPowerPointの内容が変わった場合は接続を失効させる。ページ番号が同じでも、別の資料を誤って動かさないためである。</p>
      <p>連携対象はスライドとPDFのページ位置である。PowerPointのアニメーションや動画は配信しない。</p>
      <SourceLinks items={[
        ["最新位置・確認済み位置・再試行", "presenter-bridge/src/Compass.Presenter.Core/LatestOnlyPageDispatcher.cs#L42"],
        ["資料の照合、同一要求の再送、古い連番の拒否", "supabase/migrations/20260905074220_presenter_bound_authority_and_terminal_lease.sql#L561"],
        ["PowerPointの状態観測", "presenter-bridge/src/Compass.Presenter.PowerPoint.External/PowerPointComObservationSource.cs"]
      ]} />
    </Section>
  </>;
}

export function AiArticle() {
  return <>
    <Section id="features" title="AI機能と入出力">
      <Table columns={["機能", "入力", "出力"]} rows={[
        ["字幕", "教員が許可したマイク音声", "逐次字幕・確定した文字起こし"],
        ["講義要約", "対象時間帯の文字起こし・コメント", "定期的な要点。入力不足時は生成・公開を見送る。"],
        ["資料分析・投票案", "PDFから抽出したテキスト", "教材の分析・投票の下書き"],
        ["学術回答", "質問・検索した文献", "出典付きの参考回答。教員による訂正・非表示。"]
      ]} />
      <p>有料処理は、DBに記録した利用許可と利用枠に基づいて開始する。字幕に使うマイクは教員の開始操作で有効になる。</p>
    </Section>

    <Section id="dispatch" title="外部APIの重複送信">
      <p>資料分析では、開始時に利用枠を予約し、外部APIを呼ぶ直前にDBへ送信記録を残す。同じ分析の再試行は開始要求IDで識別し、処理内容と送信先も照合する。</p>
      <figure className={styles.flow}>
        <figcaption>資料分析の応答が失われた場合</figcaption>
        <div className={styles.sequence}>
          <div className={styles.lanes}>
            <strong>Edge Functions<small>外部APIを呼び出す</small></strong>
            <strong>PostgreSQL<small>送信記録と利用枠を管理する</small></strong>
          </div>
          <div className={styles.message}>
            <span>開始要求Aの送信許可を取得</span><b aria-label="Edge FunctionからDBへ送信許可を要求">→</b><span>利用条件を確認し、送信記録を確定</span>
          </div>
          <div className={styles.message}>
            <span>外部APIを呼び出す</span><b aria-label="DBから初回の送信許可を返す">←</b><span>初回のみ送信を許可</span>
          </div>
        </div>
        <div className={styles.sequence}>
          <div className={styles.lanes}>
            <strong>Edge Functions</strong><strong>外部AI</strong>
          </div>
          <div className={styles.message}>
            <span>資料分析を送信</span><b aria-label="Edge Functionから外部AIへ送信">→</b><span>要求を受信して実行</span>
          </div>
          <div className={styles.message}>
            <span>結果を受信できない</span><b aria-label="外部AIからの応答が失われる">×</b><span>実行後の応答が消失</span>
          </div>
        </div>
        <div className={styles.sequence}>
          <div className={styles.lanes}>
            <strong>Edge Functions</strong><strong>PostgreSQL</strong>
          </div>
          <div className={styles.message}>
            <span>同じ開始要求Aを再試行</span><b aria-label="同じ開始要求をDBに照会">→</b><span>既存の送信記録を確認</span>
          </div>
          <div className={styles.message}>
            <span>同じ要求を外部へ再送しない</span><b aria-label="DBが再送不可を返す">←</b><span>新しい送信許可を出さず、既存記録を返す</span>
          </div>
        </div>
        <p className={styles.figureNote}>応答がないことは、外部で実行されなかったことを意味しない。外部API側の実行まで一つのDBトランザクションに含めることはできない。</p>
      </figure>
      <p>資料分析の結果を確認できないまま送信記録の期限を過ぎた場合は、実行済みの可能性を残して予約額を利用記録に計上する。これは外部の請求額を取得した値ではなく、結果不明の処理に対する管理上の精算である。</p>
      <p>再要求では現在の機能の有効・無効を調べる前に、既存の送信記録を確認する。後から権限が無効になっても、送信済みの要求を未送信として扱わない。同じ開始要求の操作やプロバイダーを差し替えることも拒否する。</p>
      <SourceLinks items={[
        ["開始要求と送信記録の照合・再送拒否", "supabase/migrations/20260811203000_phase7_30c2_google_ai_provider_dispatch.sql#L328"],
        ["現行の期限切れ精算処理", "supabase/migrations/20260812023000_phase7_30c2_google_realtime_provider.sql#L2217"]
      ]} />
    </Section>

    <Section id="admission" title="字幕の開始と停止">
      <p>字幕では、教員ブラウザが外部AIとの音声接続を維持する。その開始時に、講義の開催状態、教員の権限、AIの利用許可、停止要求をDBで再確認する。講義・字幕制御・利用記録を停止処理と同じ順序でロックし、開始と停止が同時に届いた場合の順序を確定する。</p>
      <figure className={styles.flow}>
        <figcaption>字幕の送信許可と停止要求が競合した場合</figcaption>
        <div className={styles.trace}>
          <div><span>停止が先に確定</span><span>送信許可の確認時点で停止済み</span><strong>新しい送信を拒否する</strong></div>
          <div><span>送信許可が先に確定</span><span>AIとの音声接続が作られる可能性がある</span><strong>送信記録を保持し、接続の終了・精算を扱う</strong></div>
        </div>
      </figure>
      <p>音声接続の作成後に応答が失われた場合も、接続が存在する可能性を残す。接続先を通話IDで確認できるものには終了要求を保存し、終了処理へ進める。ブラウザの表示を停止状態へ戻すだけでは、外部で継続している接続の終了にはならない。</p>
      <details className={styles.sources}>
        <summary>送信記録の期限と字幕の利用時間</summary>
        <p>送信記録の期限は、開始処理の結果が確認できない要求を精算するために使う。字幕の利用時間ではない。起動済みの音声接続は、この期限を過ぎただけでは終了させない。期限後に同じ開始要求が再要求された場合は、開始応答を利用できなかったものとして、終了要求と精算を処理する。</p>
      </details>
      <SourceLinks items={[
        ["字幕の送信前検証とロック順序", "supabase/migrations/20260811203000_phase7_30c2_google_ai_provider_dispatch.sql#L442"],
        ["応答消失時の通話終了と精算", "supabase/migrations/20260812023000_phase7_30c2_google_realtime_provider.sql#L2333"],
        ["起動済み通話を期限切れ回収から除外", "supabase/migrations/20260812023000_phase7_30c2_google_realtime_provider.sql#L2490"]
      ]} />
    </Section>

    <Section id="evidence" title="学術回答の生成と検査">
      <p>学術回答は、質問に対応する文献をPubMed・Crossref・OpenAlexから検索し、取得した書誌情報を使って生成する。出力には文献IDとの対応を持たせ、参照先や数値の整合を検査する。</p>
      <Flow title="学術回答の処理経路" steps={[
        ["文献検索", "質問に対応する候補を取得"],
        ["書誌照合", "識別子・研究種別などを確認"],
        ["回答生成", "取得した文献IDを指定"],
        ["出力検査", "主張・出典・数値の対応を検査"]
      ]} />
      <p>この検査で確認するのは、取得した文献と出力の対応である。論文の解釈まで自動で正しいと判定するものではない。自動公開される回答には教員未確認の表示があり、教員が訂正・非表示にできる。</p>
      <SourceLinks items={[
        ["文献検索・書誌照合・回答検査", "supabase/functions/_shared/academicAnswers.ts"],
        ["要約・学術回答の公開", "supabase/functions/generate-lecture-summary/index.ts"]
      ]} />
    </Section>
  </>;
}

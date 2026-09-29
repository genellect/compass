import { Flow, Note, Section, SourceLinks, Table } from "./DocPrimitives";
import styles from "./engineering-docs.module.css";

function VoteTransaction() {
  return <figure className={styles.flow}>
    <figcaption>選択肢Aへの回答を1件受け付ける場合 <span>票数・バージョンは説明用</span></figcaption>
    <div className={styles.transaction}>
      <strong className={styles.boundaryLabel}>PostgreSQL：3つの更新を同じトランザクションで確定</strong>
      <ol className={styles.flowSteps}>
        <li><strong>回答を保存</strong><span>参加者の回答：A</span></li>
        <li><strong>集計値を加算</strong><span>Aの票数：17 → 18票</span></li>
        <li><strong>更新番号を進める</strong><span>投票バージョン：11 → 12</span></li>
      </ol>
    </div>
    <div className={styles.transfer}>確定後の状態を各端末が取得</div>
    <div className={styles.fanout}>
      <div><span>端末A：取得済み</span><strong>A：18票</strong><small>バージョン12</small></div>
      <div><span>端末B：取得待ち</span><strong>A：17票</strong><small>次の取得で18票へ</small></div>
      <div><span>端末C：切断中</span><strong>更新を保留</strong><small>再接続後に現在値を取得</small></div>
    </div>
  </figure>;
}

function JoinCloseOrder() {
  return <figure className={styles.flow}>
    <figcaption>参加処理と終了処理が同時に届いた場合</figcaption>
    <div className={styles.trace}>
      <div><span>参加確認が先</span><span>参加登録が完了するまで<br />終了処理が待機</span><strong>登録後に講義を終了</strong></div>
      <div><span>終了処理が先</span><span>講義終了を確定してから<br />参加要求を確認</span><strong>終了済みのため参加を拒否</strong></div>
    </div>
    <p className={styles.figureNote}>参加要求同士は共有ロックを取得できる。講義終了は同じ行の排他ロックを必要とする。</p>
  </figure>;
}

function DelayedResponse() {
  return <figure className={styles.flow}>
    <figcaption>同じ講義の応答が送信順と逆に到着した場合</figcaption>
    <div className={styles.trace}>
      <div><span>先に到着</span><span>投票バージョン12<br />A：18票</span><strong>18票を表示</strong></div>
      <div><span>遅れて到着</span><span>投票バージョン11<br />A：17票</span><strong>古い投票データは適用しない</strong></div>
    </div>
  </figure>;
}

export function ArchitectureArticle() {
  return <>
    <Section id="state" title="投票結果の確定と配信">
      <p>学生が回答すると、PostgreSQLは回答の保存、票数の加算、投票バージョンの更新を一括で確定する。集計やバージョンの更新が失敗すれば回答の保存も取り消され、回答と集計値の食い違いを残さない。</p>
      <VoteTransaction />
      <p>学生端末は通常5秒間隔で状態を取得する。DBの確定を全端末の受信待ちにはせず、通信の遅い端末は次の取得で追いつく。同じ参加者から回答が再送されても、投票と参加者の組み合わせに対する一意制約が重複登録を防ぐ。</p>
      <SourceLinks items={[
        ["回答の保存と重複時の扱い", "src/repositories/supabasePollRepository.ts#L11-L35"],
        ["参加者ごとに1回答とする一意制約", "supabase/migrations/20260710104958_remote_baseline.sql#L89-L104"],
        ["回答の保存に連動する集計・バージョン更新", "supabase/migrations/20260711020445_live_state_integration.sql#L231-L259"],
        ["講義状態の項目別バージョン", "supabase/migrations/20260714021129_phase1_sync_protocol_v2.sql#L23-L94"],
      ]} />
    </Section>

    <Section id="lifecycle" title="参加と講義終了の競合">
      <p>QRコードを提示した直後には、多数の参加要求が同じ講義へ集中する。参加処理は講義行を共有ロックで確認し、この確認のために学生を一人ずつ待たせない。一方、教員の終了操作は同じ行の排他ロックを取得するため、参加登録と講義終了の順序がDBで決まる。</p>
      <JoinCloseOrder />
      <p>講義終了時には投票の受付とAI制御も停止し、終了記録を保存する。最大90分の期限はDB時刻で判定し、手動終了と期限切れを同じ終了処理に通す。教員がブラウザを閉じても、講義の受付期限は延長されない。</p>
      <SourceLinks items={[
        ["共有ロックによる参加確認と参加者登録", "supabase/migrations/20260826085622_single_lecture_300_capacity_hardening.sql#L55-L118"],
        ["講義・AI制御・利用記録のロックと終了処理", "supabase/migrations/20260715145555_phase4_1_ai_concurrency_lanes.sql#L182-L303"],
        ["DB時刻による開催判定と期限切れ処理", "supabase/migrations/20260714080706_phase2_lecture_lifecycle.sql#L395-L445"],
        ["期限切れ時の終了処理呼び出し", "supabase/migrations/20260714080706_phase2_lecture_lifecycle.sql#L609-L643"],
      ]} />
    </Section>

    <Section id="display" title="Displayの描画完了確認">
      <p>教員画面は、Displayが実際に描画したページの報告を使って同期状態を判定する。PDFの描画完了時に資料ID・資料の版・ページを照合し、現在の表示指示に一致する場合だけ完了を報告する。</p>
      <Flow title="教員が6ページ目へ進めた場合" steps={[
        ["教員", "6ページ目への変更をDBに保存"],
        ["Display", "通知または定期取得で変更を知り、6ページ目を描画"],
        ["DB", "描画報告の更新時刻・ページ・接続世代を照合"],
        ["教員画面", "現在の表示指示と報告が一致すれば同期済みと表示"],
      ]} />
      <p>5ページ目の描画完了が遅れて届いても、6ページ目の同期確認には使わない。再読み込み前の古い接続から届いた報告も、接続世代の番号で除外する。描画報告の送信に失敗した場合は再送し、その間に新しいページを描画した場合は最新の報告を優先する。</p>
      <SourceLinks items={[
        ["資料・版・ページを照合した描画完了通知", "src/pages/DisplayPage.tsx#L213-L285"],
        ["接続世代とDBの現在状態に対する描画報告の検証", "supabase/migrations/20260825173000_final_display_delivery_ack.sql#L1223-L1277"],
        ["教員画面に返す同期状態の判定", "supabase/migrations/20260825173000_final_display_delivery_ack.sql#L1421-L1439"],
        ["描画報告の再送と最新報告の優先", "src/display/displayRealtime.ts#L650-L724"],
      ]} />
    </Section>

    <Section id="recovery" title="遅延・切断からの復帰">
      <p>端末は投票・資料ページ・字幕などの項目ごとに、適用済みバージョンを保持する。応答の到着順ではなく各項目のバージョンを比較し、古い値による上書きを防ぐ。</p>
      <DelayedResponse />
      <p>講義を切り替えると、端末内で通信要求を識別する番号を更新する。前の番号で開始した通信の応答は適用しない。講義Aの通信が残ったまま講義Bへ移っても、後から届いたAの結果がBの画面を上書きすることはない。</p>
      <p>DisplayはRealtime通知をきっかけに状態を取得する。通知が欠落した場合も、通常5秒間隔の取得で現在の状態へ追いつく。確定字幕も再取得できるが、通信中に失われた途中字幕をすべて再生する方式ではない。</p>
      <SourceLinks items={[
        ["項目別のバージョン比較", "src/lib/liveSnapshot.ts#L56-L100"],
        ["要求世代の照合と応答の適用", "src/context/CompassStateContext.tsx#L486-L677"],
        ["通知を受けた状態取得とフォールバック", "src/pages/DisplayPage.tsx#L288-L366"],
        ["学生・Displayの取得間隔", "src/lib/liveSync.ts#L1-L28"],
      ]} />
    </Section>

    <Section id="capacity" title="300人規模を想定した取得処理">
      <p>学生300端末が5秒ごとに取得すると、単純計算では毎秒60回の要求になる。この取得のたびに全回答の再集計や参加記録の書き込みを行わないよう、保存時と取得時の処理を設計している。</p>
      <Table columns={["処理", "実装"]} rows={[
        ["投票結果", "回答の保存時に集計値を加算し、各端末には集計済みの票数を返す。"],
        ["資料・投票などの更新", "端末の既知バージョンと比較する。投票だけが変わった場合、未変更の資料情報は返さない。"],
        ["コメント", "ライブ取得は1回最大25件。過去のコメントは履歴用の取得経路で読む。"],
        ["参加状況", "最終アクセスの書き込みは45秒以上の間隔を置く。直近90秒の活動人数を15秒単位で集計し、講義内で再利用する。"],
      ]} />
      <p>活動人数は、書き込みがなくても時間の経過で減る。このため人数の情報は毎回返し、DBのバージョン更新だけに依存しない。学生端末の初回・復帰時の取得タイミングは分散し、通信失敗時は再試行間隔を延ばす。</p>
      <Note>300人は単一講義の設計上の想定であり、実測の処理能力を示す値ではない。要求数は端末数に応じて増え、集計や講義状態の共有行には更新時の競合が残る。</Note>
      <SourceLinks items={[
        ["取得件数・参加記録の更新間隔・人数の返却", "supabase/migrations/20260826085622_single_lecture_300_capacity_hardening.sql#L131-L287"],
        ["15秒単位の人数集計と再利用", "supabase/migrations/20260716140920_phase6_6_ux_archive_metrics_digest.sql#L143-L219"],
        ["初回・復帰時の分散と再試行間隔", "src/lib/liveSync.ts#L1-L79"],
        ["履歴・本人の状態・共通状態の取得", "src/repositories/supabaseLiveStateRepository.ts"],
      ]} />
    </Section>
  </>;
}

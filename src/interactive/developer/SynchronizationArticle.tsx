import { Flow, Section, SourceLinks, Table } from "./DocPrimitives";
import { LectureStateModel } from "./SystemModels";
import styles from "./engineering-docs.module.css";

export function ArchitectureArticle() {
  return <>
    <Section id="state" title="講義状態の管理">
      <p>一つの講義には、教員の管理画面、学生端末、教室のDisplayが接続する。これらが共有する資料の表示位置、投票、コメント、字幕、開催状態を、講義IDに紐付けてPostgreSQLに保存する。各端末はDBで確定した状態を取得し、用途に応じて表示する。</p>
      <LectureStateModel />
      <p>更新の確定に、全端末からの受信確認は必要としない。DB内の整合性はトランザクションで保ち、各端末への反映は非同期に進める構成である。通信の遅い端末が講義全体の進行を止めることはないが、端末間には一時的な表示の差が生じる。</p>
    </Section>

    <Section id="lifecycle" title="トランザクションと講義終了">
      <p>投票の回答、集計値、更新番号は、同じDBトランザクションで確定する。学生端末が回答を保存すると、DBのトリガーが集計値と更新番号を更新する。途中で失敗すれば一連の更新を取り消すため、回答だけが保存されて票数に反映されない状態を残さない。</p>
      <Table columns={["制御対象", "DBでの処理"]} rows={[
        ["回答の重複", "投票IDと参加者IDの組み合わせを一意にする。通信の再送で同じ回答が重複登録されることを防ぐ。"],
        ["講義への参加", "講義行の共有ロックを取得して開催状態を確認する。複数の参加要求は並行して処理できる。"],
        ["講義の終了", "同じ講義行の排他ロックを取得する。参加処理との前後関係を確定してから、講義を終了する。"]
      ]} />
      <p>終了時は、投票の受付とAI制御も停止し、終了記録を保存する。手動終了と期限切れは同じ終了処理を使う。最大90分の開催期限はDB時刻で判定し、期限を過ぎた参加要求は受け付けない。</p>
    </Section>

    <Section id="recovery" title="状態の配信と再同期">
      <p>コメント・ライブ投票は、教員・学生・Displayの全接続端末へRealtimeで配信し、通常5秒間隔の状態取得を併用する構成とする。Realtimeで更新を届け、定期取得で通知の欠落や切断から復帰する。</p>
      <p>端末は、講義状態をまとめて取得するスナップショットAPIを呼び出す。資料、投票、字幕などには個別の更新番号があり、端末が把握している番号を送ると、DBは更新された項目のデータを返す。</p>
      <Flow title="スナップショットによる状態取得" steps={[
        ["端末から要求", "講義IDと、項目ごとの既知の更新番号を送る"],
        ["DBから応答", "変更された項目のデータと、新しい更新番号を返す"],
        ["画面へ反映", "端末内の番号と比較し、新しい項目を適用する"]
      ]} />
      <p>通知が欠落した場合や切断から復帰した場合は、DBにある現在の状態を取得する。切断中の操作を順番に再生する方式ではない。</p>
      <p>応答が遅れて届いても、項目ごとの更新番号を比較して古い値を適用しない。講義を切り替えた後は、切替前に開始した通信の応答も除外する。確定字幕は再取得の対象になるが、失われた途中字幕をすべて復元するものではない。</p>
    </Section>

    <Section id="display" title="Displayの描画確認">
      <p>教員が指定したページがDBに保存されても、DisplayでPDFの描画が完了したとは限らない。このためDisplayは描画完了をDBへ報告し、教員画面はその報告から同期状態を表示する。</p>
      <Flow title="表示指示から描画確認まで" steps={[
        ["表示指示", "DBに資料とページ位置を保存"],
        ["PDF描画", "Displayが該当ページを描画"],
        ["報告の検証", "DBが現在の表示指示と接続を照合"],
        ["同期状態の表示", "教員画面へ確認結果を返す"]
      ]} />
      <p>報告では資料ID、資料の版、ページ、表示指示の更新時刻、接続世代を照合する。前のページの描画や、再接続前のDisplayからの報告を、現在の指示に対する完了として扱わない。報告の送信に失敗した場合は再送し、複数の報告が待機している場合は最新の描画結果を優先する。</p>
    </Section>

    <Section id="capacity" title="読み取り負荷の制御">
      <p>一つの講義状態を多数の端末が繰り返し取得するため、端末ごとの要求で同じ集計をやり直さないことが重要になる。集計を更新時に行う処理と、取得結果を講義内で再利用する処理を設けている。</p>
      <Table columns={["対象", "取得時の処理"]} rows={[
        ["投票結果", "回答の保存時に更新した集計値を返す。取得のたびに全回答を数え直さない。"],
        ["資料・投票・字幕", "既知の更新番号と比較し、未変更の項目のデータを省く。"],
        ["参加状況", "最終アクセスの書き込みは45秒以上の間隔を置く。直近90秒の活動人数は15秒単位で集計し、講義内で再利用する。"]
      ]} />
      <p>活動人数は、書き込みがなくても時間とともに変化する。この情報は更新番号にかかわらず毎回返す。また、初回・復帰時の取得タイミングを端末間で分散し、通信失敗時は再試行間隔を延ばす。</p>
      <details className={styles.supplement}><summary>想定する端末数と評価範囲</summary><p>単一講義で300人の参加を想定している。300端末が5秒ごとに取得する場合、定常時の要求数は単純計算で毎秒60回になる。Realtimeの配信負荷はこの計算に含まない。これは設計条件であり、実測の処理能力を示す値ではない。端末数に応じて要求数は増え、集計値や講義状態を更新する共有行では競合も発生する。</p></details>
    </Section>
    <SourceLinks items={[
  [
    "回答の保存と重複時の扱い",
    "src/repositories/supabasePollRepository.ts#L11-L35"
  ],
  [
    "参加者ごとに1回答とする一意制約",
    "supabase/migrations/20260710104958_remote_baseline.sql#L89-L104"
  ],
  [
    "回答の保存に連動する集計・バージョン更新",
    "supabase/migrations/20260711020445_live_state_integration.sql#L231-L259"
  ],
  [
    "講義状態の項目別バージョン",
    "supabase/migrations/20260714021129_phase1_sync_protocol_v2.sql#L23-L94"
  ],
  [
    "共有ロックによる参加確認と参加者登録",
    "supabase/migrations/20260826085622_single_lecture_300_capacity_hardening.sql#L55-L118"
  ],
  [
    "講義・AI制御・利用記録のロックと終了処理",
    "supabase/migrations/20260715145555_phase4_1_ai_concurrency_lanes.sql#L182-L303"
  ],
  [
    "DB時刻による開催判定と期限切れ処理",
    "supabase/migrations/20260714080706_phase2_lecture_lifecycle.sql#L395-L445"
  ],
  [
    "期限切れ時の終了処理呼び出し",
    "supabase/migrations/20260714080706_phase2_lecture_lifecycle.sql#L609-L643"
  ],
  [
    "資料・版・ページを照合した描画完了通知",
    "src/pages/DisplayPage.tsx#L213-L285"
  ],
  [
    "接続世代とDBの現在状態に対する描画報告の検証",
    "supabase/migrations/20260825173000_final_display_delivery_ack.sql#L1223-L1277"
  ],
  [
    "教員画面に返す同期状態の判定",
    "supabase/migrations/20260825173000_final_display_delivery_ack.sql#L1421-L1439"
  ],
  [
    "描画報告の再送と最新報告の優先",
    "src/display/displayRealtime.ts#L650-L724"
  ],
  [
    "項目別のバージョン比較",
    "src/lib/liveSnapshot.ts#L56-L100"
  ],
  [
    "要求世代の照合と応答の適用",
    "src/context/CompassStateContext.tsx#L486-L677"
  ],
  [
    "通知を受けた状態取得とフォールバック",
    "src/pages/DisplayPage.tsx#L288-L366"
  ],
  [
    "学生・Displayの取得間隔",
    "src/lib/liveSync.ts#L1-L28"
  ],
  [
    "取得件数・参加記録の更新間隔・人数の返却",
    "supabase/migrations/20260826085622_single_lecture_300_capacity_hardening.sql#L131-L287"
  ],
  [
    "15秒単位の人数集計と再利用",
    "supabase/migrations/20260716140920_phase6_6_ux_archive_metrics_digest.sql#L143-L219"
  ],
  [
    "初回・復帰時の分散と再試行間隔",
    "src/lib/liveSync.ts#L1-L79"
  ],
  [
    "履歴・本人の状態・共通状態の取得",
    "src/repositories/supabaseLiveStateRepository.ts"
  ]
]} />
  </>;
}

export const stackMetrics = [
  { value: "748", label: "管理ファイル" },
  { value: "56", label: "DBマイグレーション" },
  { value: "31", label: "Edge Functions" },
  { value: "43", label: "pgTAP SQL" },
  { value: "18", label: "Playwright specs" },
  { value: "x86 + x64", label: "ネイティブ対応" }
];

export const technologyStack = [
  ["フロントエンド", "React 19 · TypeScript 6 · Vite 8 · React Router 8"],
  ["バックエンド / DB", "Supabase · PostgreSQL · RLS · RPC · Realtime · Edge Functions"],
  ["認証 / セキュリティ", "Supabase Auth · Google Cloud · TOTP · 2FA · サーバー側認可"],
  ["インフラ / 配信", "Cloudflare Pages · Workers · Private R2"],
  ["AI / 学術検索", "OpenAI Realtime · バッチ処理 · Crossref · OpenAlex · NCBI"],
  ["資料配信", "PDF.js · QRコード · Private R2 Range配信"],
  ["Windows / PowerPoint", ".NET 10 · C# · PowerPoint Presenter Bridge · x86 / x64"],
  ["テスト / 品質", "Playwright (Chromium / WebKit) · axe-core · pgTAP · 負荷 / 競合テスト · oxlint · Prettier · SBOM"],
  ["開発環境", "Node 22.22 · Dev Container · Docker-in-Docker · ローカルSupabase · Codespaces · Codex Cloud"],
  ["パッケージ管理", "npm · package-lock.json"]
] as const;

export const architectureLayers = [
  {
    number: "01",
    title: "画面と権限",
    body: "Educator、Student、Display、Reviewは同じ講義データを共有しますが、役割ごとに権限を分離しています。各画面には、その役割に必要な情報と操作だけを提供します。"
  },
  {
    number: "02",
    title: "状態管理と認可",
    body: "講義状態、所有権、認可、利用状態、監査情報はPostgreSQLで一元管理します。重要な操作はRLSとRPCでサーバー側から再検証し、ブラウザから送られた識別子や状態をそのまま信用しません。"
  },
  {
    number: "03",
    title: "同期",
    body: "バージョン付きの状態を同期の基準とし、Realtimeは即時反映が必要な処理に限定して使用します。購読や通信に失敗した場合も、認可済みの最新状態を再取得して復帰できます。"
  },
  {
    number: "04",
    title: "サーバー処理",
    body: "Edge Functionsは、シークレット、有料API、管理操作、外部サービスへのアクセスをブラウザから分離します。\n\nAI処理では、実行可否、利用上限、同時実行数、使用量を外部APIの呼び出し前に検証します。"
  },
  {
    number: "05",
    title: "非公開資料",
    body: "PDF本文はPrivate R2に保存し、講義状態とは独立した経路で配信します。PublisherとWorkerを通じて、短時間だけ有効なアクセス権、ハッシュ、nonce、Range Requestを組み合わせ、公開条件と部分配信を制御します。"
  },
  {
    number: "06",
    title: "PowerPoint連携",
    body: ".NET / C# Bridgeへの通信はloopbackとGatewayに限定します。Origin、Host、本文ハッシュ、timestamp、nonce、P-256署名を検証し、許可された操作だけをPowerPointへ渡します。\n\nWindows x86 / x64は個別の対象としてビルド・テストします。"
  }
];

export const roleMatrix = [
  ["Student", "Anonymous Auth", "自身の投稿・回答、参加中の講義", "auth.uid() · RLS · RPC"],
  ["Educator", "Google OAuth + TOTP AAL2", "自身の講義、AI実行、管理操作", "認証クライアント分離 · 保存領域分離 · セッション管理"],
  ["Display", "講義単位のアクセス", "教室表示に必要な情報", "講義への紐付け · 非公開チャネル · 復旧経路"],
  ["Review", "閲覧専用アクセス", "終了後に公開された講義内容", "公開条件 · 書き込み拒否"]
] as const;

export const threatMatrix = [
  ["他の参加者へのなりすまし", "ブラウザから送られた参加者IDを信用せず、auth.uid() から所有者を判定", "投稿・回答の所有権", "所有権・ライフサイクルのpgTAP"],
  ["講義終了後の書き込み・AI実行", "サーバー時刻を基準に90分で停止し、終了処理を共通化・冪等化", "講義終了後の状態整合性", "SQLテスト · ブラウザE2E"],
  ["PDFの早期公開・不正アクセス", "pending → uploaded → committed → active の公開手順に加え、hash・nonce・access versionで制御", "非公開資料と公開タイミング", "SQL · Worker · ブラウザテスト"],
  ["AI処理の重複・費用超過", "AI実行前に利用上限、実行枠、冪等性を確認・確保し、外部API呼び出しと分離", "API費用と重複実行", "競合テスト · 利用量管理の契約テスト"],
  ["Educatorセッションの不正利用", "認証クライアントと保存領域を分離し、AAL2、セッション追跡、失効処理を適用", "教員権限と管理操作", "認証統合テスト"],
  ["Presenter Bridgeへの不正操作", "loopback限定、Origin / Host、本文ハッシュ、timestamp、nonce、P-256署名を検証", "Windows側のPowerPoint操作", ".NETセキュリティテスト"]
] as const;

export const selectedDecisions = [
  {
    number: "01",
    title: "状態同期",
    problem: "Educator、Student、Displayの状態を短時間で一致させながら、参加者数の増加に伴うSupabaseへの読み取り負荷を抑える必要があります。",
    design: "講義状態をバージョン管理し、5秒間隔の状態取得を同期の基準にします。即時性が必要な処理だけRealtimeを使用し、すべての画面を常時購読には依存させません。\n\nこれにより、Supabaseへの負荷を抑えながら状態のずれを短時間で収束させ、Realtimeや通信に問題が起きた場合も次回の状態取得から復帰できます。",
    evidence: "同期プロトコル · ブラウザ統合 · バックオフ · バックグラウンド復帰"
  },
  {
    number: "02",
    title: "講義ライフサイクル",
    problem: "教員のブラウザが停止した場合や端末時刻にずれがある場合でも、講義終了と終了後の権限制御を確実に成立させる必要があります。",
    design: "講義開始時にサーバー時刻から終了期限を確定します。手動終了、定期処理、各RPCの期限判定は、同じ冪等な終了処理へ集約します。\n\n終了要求が重複しても同じ状態へ収束し、期限後の書き込みやAI実行はブラウザの状態にかかわらずサーバー側で拒否します。",
    evidence: "期限判定 · 同時実行 · DBマイグレーション · ブラウザE2E"
  },
  {
    number: "03",
    title: "PDF公開",
    problem: "アップロード途中や破損したPDF、古い世代のファイルを公開せず、大容量ファイルの転送を講義状態の同期から分離する必要があります。",
    design: "PDFは pending → uploaded → committed → active の状態で管理し、アップロード完了と公開を分離します。\n\nSHA-256、nonce、世代情報を照合し、配信時には短時間だけ有効なアクセス権とRange Requestを検証します。必要な条件を満たしたファイルだけが公開状態へ移行します。",
    evidence: "公開状態遷移 · Worker · Publisher · アップロード競合"
  },
  {
    number: "04",
    title: "AI実行",
    problem: "AIの認可、費用、同時実行、重複要求、学術的根拠をモデルや外部APIの応答だけに依存させることはできません。",
    design: "外部APIを呼び出す前に、認可、利用上限、同時実行枠、冪等性、使用量をデータベース側で確認・確保します。\n\n学術回答では、PubMed、Crossref、OpenAlexから取得した文献情報をモデル出力とは独立して検証し、根拠が確認できない回答の表示を抑制します。",
    evidence: "AI認可 · 実トランザクション競合 · 使用量管理 · 文献検証"
  }
];

export const verificationRows = [
  ["コード / 依存関係", "型、lint、依存関係、secret、production build", "TypeScript · oxlint · npm audit · secret scan · CycloneDX SBOM"],
  ["データベース", "migration、所有権、RLS、競合、upgrade", "zero-base / populated upgrade · 43 pgTAP files · 実トランザクション競合テスト"],
  ["ブラウザ", "主要操作、画面サイズ、アクセシビリティ、異常系", "Playwright · Chromium · WebKit · axe-core"],
  ["システム連携", "Auth → Edge Functions → DB → browser", "Local Supabase · GoTrue TOTP · Edge Functions · 3-cycle lifecycle"],
  ["Windows", "x86 / x64差異、loopback、署名付きリクエスト", "Windows x64 / x86 build and tests"]
] as const;

export const ciJobs = [
  "品質検証・非ライブ回帰テスト",
  "デモ環境のブラウザE2E",
  "ローカルSupabase・pgTAP・実ブラウザE2E",
  "Presenter Bridge · Windows x64",
  "Presenter Bridge · Windows x86"
];

export const codebaseMetrics = [
  ["748", "tracked files"],
  ["119", "directories"],
  ["56", "DB migrations"],
  ["31", "Edge Function entrypoints"],
  ["43", "pgTAP SQL files"],
  ["18", "Playwright specs"],
  ["34", "C# / .NET files"]
] as const;

export const directoryRows = [
  ["supabase/", "175", "PostgreSQL · RLS · RPC · Realtime · Edge Functions · SQL tests"],
  ["src/", "159", "React UI · 状態管理 · データアクセス"],
  ["scripts/", "144", "静的検査 · 負荷 · 競合 · upgrade · release検証"],
  ["docs/", "109", "Architecture · Security · Runbook · 検証記録"],
  ["presenter-bridge/", "47", "Windows / .NET · PowerPoint連携"],
  ["e2e/", "25", "Demo · Local Supabase · ブラウザE2E"],
  ["publisher/", "15", "PDF公開 · 復旧処理"],
  ["cloudflare/", "12", "Asset Worker · Private R2 · Presenter Gateway"]
] as const;

export const developerPrinciples = [
  {
    number: "01",
    label: "FIELD-LED DESIGN",
    title: "現場の解像度が、設計の深さを決める。",
    body: "教育、生命科学、英語、AI、ソフトウェア開発にまたがる知見を、個別の機能ではなくプロダクト全体の設計へ反映しています。\n\n教育現場で見えるのは、教員の操作負荷だけではありません。学生が質問をためらう場面、理解が追いつかなくなる瞬間、講義後に情報が失われる過程までが設計対象です。研究現場で求められる信頼性、再現性、根拠の追跡可能性も、AI回答やAIネイティブ開発のワークフロー設計に組み込んでいます。"
  },
  {
    number: "02",
    label: "BUILT FOR THE CLASSROOM",
    title: "現場で使われ、現場とともに育つ。",
    body: "COMPASS Interactiveは、講義やプレゼンテーションを継続的に行う開発者自身が、その体験をより良くするために構築する教育システムです。\n\n講義の進行、学生の参加、理解度の把握、質問や議論、講義後の振り返りまでを実際の教育現場で運用し、その結果を継続的にプロダクトへ反映します。\n\n開発者自身が長く使える実用性と、他の教員がそれぞれの授業や発表へ導入できる品質・テナント分離・汎用性を両立しています。"
  },
  {
    number: "03",
    label: "CONSISTENT BRAND EXPERIENCE",
    title: "COMPASSの思想を、すべてのプロダクトへ。",
    body: "COMPASSシリーズは、「学びを、意思決定の力へ」という共通理念のもとで設計しています。\n\nCOMPASS Interactiveの情報設計、文章表現、視覚表現、操作体験は、単なるプロダクトUXにとどまりません。公式Webサイト、未来戦略ライブラリ（COMPASS Platformの独立プロダクト）、そして運営母体である学生支援団体の活動理念まで、一貫した思想で設計しています。\n\nCOMPASSに触れる学生が、その体験を通じて自ら考え、自分の力で未来を切り拓いていけること。この行動変容までを見据え、プロダクトをまたいだ一貫したUXを構築しています。\n\nプロダクトが変わっても、利用者が向き合う問いは変わりません。どの接点から入っても、同じ思想、同じ品質、同じCOMPASSとして理解できる体験へ統合しています。"
  }
];

export const ownershipItems = [
  "プロダクト設計・要件定義",
  "インタラクション・ビジュアルデザイン",
  "フロントエンド / データベース / サーバー / クラウド設計",
  "セキュリティモデル・障害設計",
  "テスト戦略・CI・リリース検証",
  "講義運用・商用基盤運用",
  "広報・マーケティング・技術ドキュメント整備"
];

export const designPrinciples = [
  {
    number: "01",
    label: "FIELD-LED DESIGN",
    title: "現場の解像度が、設計の深さを決める",
    body: "教育、生命科学、英語、AI、ソフトウェア開発にまたがる知見をもとに、開発者自身が課題発見、要件定義、UX設計、アーキテクチャ、検証、運用までを一貫して横断。教育現場の課題や利用者の行動を、個別の機能だけでなく、プロダクト全体の設計判断へ反映した。"
  },
  {
    number: "02",
    label: "BUILT FOR THE CLASSROOM",
    title: "現場で使われ、現場とともに育つ",
    body: "COMPASS Interactiveは、講義やプレゼンテーションを継続的に行う開発者自身が、その体験をより良くするために構築した教育システムである。実際の教育現場で運用しながら、講義の進行、学生の参加、理解度の確認、質問や議論のあり方を改善していく。開発者自身が長く使い続けられる実用性を持ちながら、他の教員もそれぞれの授業や発表に導入できる品質と汎用性を備えている。"
  },
  {
    number: "03",
    label: "CONSISTENT BRAND EXPERIENCE",
    title: "すべてを貫く、COMPASSの思想",
    body: "COMPASSシリーズは、「学びを、意思決定の力へ」という共通理念のもとに設計されている。COMPASS公式サイトや各紹介ページから、COMPASS InteractiveのStudent、Admin、Display、Archiveまで、その理念を一貫した世界観として展開。色彩やタイポグラフィだけでなく、情報の見せ方、言葉の選び方、操作のあり方まで統一し、どの接点からでもCOMPASSの思想と価値が伝わる体験を構築している。"
  }
];

export const guideTopics = ["ARCHITECTURE", "SECURITY", "OPERATIONS", "QUALITY"];

export const technologyStacks = [
  { number: "01", label: "Web・紹介サイト", technologies: "Next.js / React / TypeScript" },
  { number: "02", label: "プロダクトUI", technologies: "React 19 / TypeScript 6 / Vite 8 / React Router 7" },
  { number: "03", label: "データ・認証・アクセス制御", technologies: "Supabase / PostgreSQL / Auth / RLS / RPC" },
  { number: "04", label: "サーバーレス・AI・リアルタイム", technologies: "Edge Functions / OpenAI API / Realtime API" },
  { number: "05", label: "ホスティング・ストレージ・配信", technologies: "Cloudflare Pages / Workers / Private R2" },
  { number: "06", label: "品質保証・CI/CD", technologies: "GitHub Actions / Playwright / pgTAP / axe-core / SBOM" }
];

export const supportingStack = [
  { area: "Toolchain", detail: "Node.js / npm / Git / GitHub" },
  { area: "AI Development Agents", detail: "OpenAI Codex / Claude Code" },
  { area: "Change Management", detail: "Feature Flags / Expand-first Migration / Rollback Runbook" },
  { area: "Load Control", detail: "Versioned Snapshot / Backoff / Visibility-aware Sync" },
  { area: "Academic Sources", detail: "PubMed / Crossref / OpenAlex" }
];

export const scaleStats = [
  { label: "管理対象ファイル", value: "440", unit: "files" },
  { label: "管理対象行数", value: "112,703", unit: "lines" },
  { label: "Database migration", value: "28", unit: "" },
  { label: "Edge Functions", value: "26", unit: "" },
  { label: "非Live回帰テスト", value: "55", unit: "groups" }
];

export const directoryMetrics = [
  { area: "src/", files: "117", lines: "28,448", detail: "React UI、状態管理、Repository、PDF、字幕、要約" },
  { area: "supabase/", files: "127", lines: "51,182", detail: "Migration、RLS、RPC、Edge Functions、pgTAP" },
  { area: "cloudflare/", files: "8", lines: "9,508", detail: "Private R2配信Workerとテスト" },
  { area: "publisher/", files: "15", lines: "2,389", detail: "Local Publisherと復旧経路" },
  { area: "e2e/", files: "14", lines: "3,147", detail: "Playwright E2E" },
  { area: "scripts/", files: "77", lines: "9,124", detail: "回帰、負荷、セキュリティ、Gate" },
  { area: "docs/", files: "82", lines: "8,905", detail: "設計記録、Runbook、Rollback、運用資料" },
  { area: "合計", files: "440", lines: "112,703", detail: "実装・テスト・設計・運用資産", total: true }
];

export const architectureBoundaries = [
  {
    number: "01",
    label: "Interfaces",
    code: "Student / Admin / Display / Archive",
    body: "学生、教員、教室表示、講義後閲覧を、それぞれの利用状況に適した画面として分離しています。同じ講義データを共有しながら、利用者ごとに必要な情報と操作だけを提示します。"
  },
  {
    number: "02",
    label: "State & Authorization",
    code: "PostgreSQL / RLS / RPC / Anonymous Auth",
    body: "講義状態、所有権、認可、Lifecycle、監査情報をPostgreSQL側の正本として管理します。ブラウザ内の状態だけに依存せず、重要な操作はデータベース側で再検証します。"
  },
  {
    number: "03",
    label: "Server Capabilities",
    code: "26 Edge Functions / AI Grants / Usage Ledger",
    body: "秘密情報、有料処理、管理操作、外部API連携をブラウザから分離します。AIや外部サービスの利用条件、予算、実行履歴もサーバー側で管理します。"
  },
  {
    number: "04",
    label: "Private Asset Delivery",
    code: "Local Publisher → Private R2 → Cloudflare Worker",
    body: "PDF本文を講義状態とは別の経路で管理し、短寿命の認可付き経路から配信します。資料保護と軽量な講義同期を両立するための境界です。"
  },
  {
    number: "05",
    label: "Verification & Operations",
    code: "GitHub Actions / Playwright / pgTAP / Runbook",
    body: "コード、データベース、ブラウザ操作、統合動作、変更手順を同じリポジトリで検証します。本番環境から隔離された自動検証によって、変更による破壊を早期に検出します。"
  }
];

export const systemBoundaries = [
  { boundary: "Browser", responsibility: "公開情報の表示と、短寿命の操作権限" },
  { boundary: "PostgreSQL", responsibility: "講義状態、所有権、認可、監査の正本" },
  { boundary: "Edge Functions", responsibility: "Secret、有料API、管理操作、外部連携" },
  { boundary: "Cloudflare", responsibility: "Web配信、Private Asset、Range配信" },
  { boundary: "CI", responsibility: "本番環境から隔離された自動検証" }
];

export const engineeringDesigns = [
  {
    number: "01",
    domain: "AUTHORIZATION",
    title: "匿名参加と、確かな所有権",
    meaning: "名前や学籍番号を入力せずに参加できる一方で、投稿や回答の所有者はシステム上で区別されます。参加の心理的障壁を下げながら、他者のデータを変更できない境界を保ちます。",
    design: "ブラウザ内のparticipant IDだけを認可根拠にはしません。Supabase Anonymous Authのauth.uid()を参加者の所有権へ結びつけ、講義状態と所有権をPostgreSQL側で再検証します。",
    flow: ["Anonymous Auth", "auth.uid()", "Participant ownership", "RLS / RPC authorization"],
    elements: ["Row Level Security", "Explicit GRANT", "Private schema", "Fixed search_path", "Ownership and isolation tests"]
  },
  {
    number: "02",
    domain: "SYNCHRONIZATION",
    title: "変わった部分だけを、5秒で届ける",
    meaning: "講義中に必要な更新を素早く届けながら、通信量とサーバー負荷を抑えます。画面全体を繰り返し取得せず、変化した情報だけを同期します。",
    design: "講義状態をsection単位のversionで管理します。クライアントは既知のversionをsnapshot RPCへ送り、更新されたsectionだけを受け取ります。",
    flow: ["Foreground — 5 sec", "Failure — Exponential backoff", "Background — Limited synchronization", "Hidden tab — Reduced activity", "Comment history — On demand"],
    elements: ["7 section versions", "Visibility-aware synchronization", "Failure backoff", "Presence TTL", "Participant count cache", "Initial comment limit"]
  },
  {
    number: "03",
    domain: "LECTURE LIFECYCLE",
    title: "講義の開始から終了までを、サーバーが管理する",
    meaning: "講義の終了忘れや状態の不整合を防ぎ、終了後の閲覧や保存期間まで一貫して管理します。",
    design: "講義開始時に、サーバー時刻を基準として最大90分のhard_stop_atを確定します。手動終了、Cron、各RPCの期限判定は、同じ冪等な終了処理へ集約します。",
    flow: ["DRAFT", "OPEN", "CLOSED", "ARCHIVE", "EXPIRY"],
    elements: ["Server time", "90-minute hard stop", "Idempotent state transition", "Cron fallback", "RPC deadline guard", "30-day archive policy"]
  },
  {
    number: "04",
    domain: "PRIVATE PDF DELIVERY",
    title: "資料を守りながら、講義を軽く保つ",
    meaning: "配布資料を保護しながら、ページ同期や講義操作の負荷を抑えます。PDF本文と、講義中に変化する状態を別々の経路で扱います。",
    design: "PDF本文はPrivate R2へ保存し、Supabaseには資料ID、version、現在ページ、R2参照のみを保持します。Cloudflare Workerが短寿命ticket、Origin、Range、retentionを検証して配信します。",
    flow: ["Local validation", "Pending upload", "Immutable object", "Commit / Activate", "Short-lived authorized delivery"],
    elements: ["15 MiB", "75 pages", "20,000 characters", "PDF magic bytes", "SHA-256", "Nonce and replay prevention", "Immutable object key", "Range delivery"],
    note: "この構成により、資料保護、途中失敗、再送、配信負荷を単一のupload処理へ集中させません。"
  },
  {
    number: "05",
    domain: "AI, COST & HUMAN REVIEW",
    title: "AIの実行条件と責任を、先に設計する",
    meaning: "AI機能を安全かつ継続的に利用するために、費用、根拠、公開条件、教員確認を明確にします。",
    design: "AI処理を字幕、資料解析、Poll提案、5分要約、学術回答へ分離します。実行前に、講義状態、feature flag、一回限りのgrant、予算、同時実行枠を検証します。provider callの前に利用量を予約し、成功、失敗、不明応答をusage ledgerへ記録します。出力はschema、根拠、重複、情報量を検査し、必要な機能では教員確認を公開条件とします。",
    flow: ["Grant", "Budget reservation", "Provider call", "Quality gate", "Human review"],
    elements: ["One-time grant", "Budget reservation", "Concurrency lanes", "Usage ledger", "Provider timeout", "Structured output", "Source grounding", "Human review state", "Audio non-retention"],
    note: "AIモデルそのものだけでなく、AIを安全かつ持続的に運用するための境界を設計しています。"
  }
];

export const qualityLayers = [
  {
    number: "01",
    title: "Code & Dependencies",
    code: ["TypeScript", "Lint", "Production Build", "Secret Scan", "High-severity Audit", "SBOM"],
    body: "型エラー、依存関係、秘密情報の混入、production buildへの影響を継続的に確認します。"
  },
  {
    number: "02",
    title: "Database & Authorization",
    code: ["Clean Migration", "Upgrade Migration", "pgTAP", "RLS Isolation", "Ownership", "Race Conditions", "DB Type Drift"],
    body: "新規環境への導入に加え、既存データを保持した状態からの更新も検証します。所有権、RLS、同時実行、型の不整合までをデータベース側で確認します。"
  },
  {
    number: "03",
    title: "Browser & Accessibility",
    code: ["Chromium", "WebKit", "Desktop", "Mobile", "axe-core", "Visual Contract", "Overflow Detection"],
    body: "Student、Admin、Displayの各画面を、複数のブラウザと画面サイズで検証します。操作性、アクセシビリティ、レイアウト崩れ、表示領域からのはみ出しも確認対象です。"
  },
  {
    number: "04",
    title: "Integration & Failure Handling",
    code: ["Edge → Database → Browser", "Timeout", "Retry", "Concurrent Requests", "Safe Failure", "Trace / Video / Logs"],
    body: "単一の関数だけでなく、Edge Functions、データベース、ブラウザをまたぐ一連の操作を検証します。タイムアウト、再試行、同時リクエスト、途中失敗時の挙動も確認します。"
  }
];

export const validationSummary = [
  "55 NON-LIVE REGRESSION GROUPS",
  "CLEAN + UPGRADE MIGRATION TESTS",
  "DESKTOP + MOBILE E2E",
  "CHROMIUM + WEBKIT"
];

export const operationalScope = [
  "20-person beta E2E",
  "Multiple devices",
  "Student / Admin / Display",
  "End-to-end lecture flow",
  "Classroom operation",
  "Designed for 200-person use"
];

export const aiEngineeringRoles = [
  {
    label: "HUMAN DIRECTION",
    title: "課題と責任を定める",
    body: "現場を観察し、解くべき課題、守るべき条件、採用する設計を人間が判断する。"
  },
  {
    label: "AI DEVELOPMENT AGENTS",
    title: "実装と検証を加速する",
    body: "OpenAI Codex / Claude Codeを、要件整理、実装、リファクタリング、テスト、エラー分析の支援に活用する。"
  },
  {
    label: "CRITICAL REVIEW",
    title: "疑い、検証し、修正する",
    body: "生成結果をそのまま採用せず、例外条件、セキュリティ、整合性、再現性を継続的に検証する。"
  }
];

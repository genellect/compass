# Phase 3 実装案

## 構成

```text
contracts/library-registration/eligibility-cases.json
  ├─ TypeScript資格判定テスト
  └─ FastAPI資格判定テスト

src/library-registration/eligibility.ts
  └─ RegistrationMvp.tsx

services/library-api/app/eligibility.py
  └─ FastAPI /phase3/evaluate
```

## 実装順序

1. 判定ステータス、理由コード、正規化をTypeScriptの純粋関数へ分離する。
2. 同じ契約をPythonへ実装し、FastAPIの検証用エンドポイントを作る。
3. 共通JSONケースを両言語のテストから実行する。
4. UIを条件付き項目、3分類以上の明示的結果、同意版表示へ更新する。
5. 画面内の同一送信を`already_registered`として再現する。
6. 型検査、単体テスト、FastAPI結合テスト、静的ビルド、凍結サイト検証を実行する。
7. 実ブラウザで承認・個別確認・対象外・重複の経路とMobile表示を確認する。

## 本番接続時の差し替え点

- モック認証選択をGoogle Identity Servicesへ置き換える。
- フロントエンドのローカル送信をFastAPI呼び出しへ置き換える。
- FastAPIリクエスト内の認証事実はクライアント値を使わず、検証済みIDトークンから生成する。
- `existing_registration`はDB検索結果から生成し、リクエストボディでは受け付けない。
- 規約・プライバシーの正式版と発効日を設定する。

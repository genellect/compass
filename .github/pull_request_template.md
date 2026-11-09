<!--
人もagentも同じ項目を埋める。該当しない項目は削除せず「なし」と書く。
後半の「変更ファイル」から「未確認事項と残存risk」までは、`AGENTS.md`のFinal Report契約と同じ項目である。
運用ルールは`docs/team-development.md`にある。
-->

## 背景・目的

<!-- なぜこの変更が必要か（課題・きっかけ）と、達成したいこと。関連するIssueがあれば「Closes #番号」と書く。 -->

## 概要

<!-- 何を変更したか。1〜3行。 -->

## 変更の種類と区分

- [ ] 新機能（feat）
- [ ] 不具合の修正（fix）
- [ ] 文書（docs）
- [ ] テスト（test）
- [ ] 保守・設定（chore）
- [ ] CI（ci）

<!-- 区分は`docs/team-development.md`の§2。両方に触れる場合は安全境界。 -->

- [ ] 静的Web（公開ページの文言・画像・CSS・layout・componentで、static exportに閉じる）
- [ ] 安全境界（フォーム、Library登録、Functions、GAS、API、infra、配信設定、依存、CI、開発環境、agent方針）

## 変更ファイル

<!-- 変更したpathを領域ごとに列挙する。 -->

## User-visible behavior

<!--
公開UI、copy、route、form挙動が変わったか。
変わっていない場合は「なし」と明記する。
独立surface（Interactive紹介、開発者紹介、yuto-matsui.com）へ波及するかも書く。
-->

## 実行した検証

<!--
実行したcommandと実際の結果。実行していないものは「未実行」と書く。
手元、CI、Cloudflare Preview、Productionでの確認は分けて書く。
推測やagentの出力を実行済みとして扱わない。
-->

- [ ] GitHub Actions `CI result` / `Library security result`
- [ ] 変更に関係するresponsive spec・Cloudflare Previewの実表示（UI / navigation / font / breakpoint / animationを変更した場合）
- [ ] `npm run dev:doctor`（開発環境の定義を変更した場合）
- [ ] `services/library-api`の`uv run python -m pytest`（API変更の場合）
- [ ] 未実行のgateと理由:

<!--
visual regressionはWindows baseline（`*-win32.png`）に依存するため、
cloudからは実行しない。CIでも実行しない（Windows hostでの任意監査）。
-->

## スクリーンショット・Preview

<!-- 画面の変更がある場合に、対象routeのCloudflare Preview URLと、変更前後のスクリーンショットを示す。 -->

## 実施したGit・Production操作

<!--
commit、push、branch。
Cloudflare deploy、GAS deployment、Terraform apply、database migration、secret変更、
Production form送信、実email送信は、ユーザーの明示依頼がない限り「なし」であること。
-->

## 未確認事項と残存risk

<!--
このPRで扱わない点と、このrepositoryだけでは証明できない外部状態。
Cloudflare dashboard設定、GAS deployment状態、実メール疎通、Production data等。
-->

## Status

<!-- `AGENTS.md`のContent Status Vocabularyから選ぶ。 -->

- [ ] `Production`
- [ ] `Operationally verified`
- [ ] `Implemented, verification pending`
- [ ] `Planned`

---

- [ ] 1つの目的に絞り、変更範囲外のcopy・file・architectureを整理していない
- [ ] 関連する文書・テストを同じPRで更新した
- [ ] secret、credential、token、OTP、個人情報、保護資料を含まない
- [ ] COMPASS InteractiveのcheckoutやProduction dataを持ち込んでいない
- [ ] 未実行・失敗した検証を、合格として書いていない

<!--
`AGENTS.md`のFinal Report契約をPR本文へそのまま持ち込むためのtemplate。
人もagentも同じ項目を埋める。該当しない項目は削除せず「なし」と書く。
-->

## 概要

<!-- 何を、なぜ変更したか。1〜3行。 -->

## 変更ファイル

<!-- 変更したpathを領域ごとに列挙する。 -->

## User-visible behavior

<!--
公開UI、copy、route、form挙動が変わったか。
変わっていない場合は「なし」と明記する。
-->

## 実行した検証

<!--
実行したcommandと実際の結果。実行していないものは「未実行」と書く。
推測やcopilot出力を実行済みとして扱わない。
-->

- [ ] `npm run cloud:check`
- [ ] `npm run check:responsive:cloud`（UI / navigation / font / breakpoint / animationを変更した場合）
- [ ] `npm run dev:doctor`（Dev Container定義を変更した場合）
- [ ] `services/library-api`の`uv run python -m pytest`（API変更の場合）
- [ ] 未実行のgateと理由:

<!--
visual regressionはWindows baseline（`*-win32.png`）に依存するため、
cloudからは実行しない。判定はGitHub Actions **Responsive Quality Gate** の結果を使う。
-->

## 実施したGit・Production操作

<!--
commit、push、branch。
Cloudflare deploy、GAS deployment、Terraform apply、database migration、secret変更、
Production form送信、実email送信は、ユーザーの明示依頼がない限り「なし」であること。
-->

## 未確認事項と残存risk

<!--
このrepositoryだけでは証明できない外部状態。
Cloudflare dashboard設定、GAS deployment状態、実メール疎通、Production data等。
-->

## Status

<!-- `AGENTS.md`のContent Status Vocabularyから選ぶ。 -->

- [ ] `Production`
- [ ] `Operationally verified`
- [ ] `Implemented, verification pending`
- [ ] `Planned`

---

- [ ] secret、credential、token、OTP、個人情報、保護資料を含まない
- [ ] COMPASS InteractiveのcheckoutやProduction dataを持ち込んでいない
- [ ] 変更範囲外のcopy・file・architectureを整理していない

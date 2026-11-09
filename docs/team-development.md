# チーム開発ルール

Status: Canonical
Scope: このrepositoryで作業する全員（人とAI agent）
Last verified: 2026-11-09

COMPASSの開発に参加する人とAI agentのための運用ルール。役割、変更の区分、開発の流れ、Git、review、agentの使い方、本番公開を定める。AI agent向けの手順は[`AGENTS.md`](../AGENTS.md)がこの文書を具体化し、開発環境は[`CONTRIBUTING.md`](../CONTRIBUTING.md)と[`CLOUD_DEVELOPMENT.md`](CLOUD_DEVELOPMENT.md)、検証の選び方は[`agent-delivery-policy.md`](agent-delivery-policy.md)にある。

この文書と`AGENTS.md`が食い違う場合は作業を止め、オーナーに確認する。

## 1. 役割

| 役割 | 担当 | 責任 |
|---|---|---|
| オーナー | `@genellect` | 優先順位、`main`へのmerge、Production公開、外部サービス・費用・secretの判断、このルールの承認 |
| 開発メンバー | repositoryのCollaborator | 担当タスクの実装、PRの作成、他のメンバーのPRのreview |
| AI agent | Claude Code、Codex、GitHub Copilotなど | 依頼者の指示による実装と検証。成果物の責任は依頼者が持つ |

## 2. 変更の区分

COMPASSの変更の大半は静的Webの更新である。静的Webは開発速度を最優先し、安全境界に触れる変更だけに手厚い確認を求める。

| 区分 | 対象 |
|---|---|
| 静的Web | 公開ページの文言、画像、CSS、layout、component、animationで、static exportに閉じる変更。公式親サイト、未来戦略ライブラリのLP、Manifesto、依頼された独立surfaceを含む |
| 安全境界 | Community・Contactフォーム、Library登録、`functions/`、`google-apps-script/`、`services/`、`infra/`、`contracts/`、配信設定（`_headers`、`_redirects`、`next.config.ts`）、依存とlockfile、`.github/`、開発環境、agent方針 |

1つのPRが両方に触れる場合は安全境界として扱う。区分はPR本文に書く。

| 段階 | 静的Web | 安全境界 |
|---|---|---|
| 手元の検証 | 対象routeのDesktop/Mobileと変更した操作だけ（[`agent-delivery-policy.md`](agent-delivery-policy.md)） | 専用runbookのgate。広範囲なら`npm run check` |
| 必須CI | `CI result`と`Library security result`。静的WebのPRでは2つとも4分以内に終わる（2026-10-29〜11-04の実測。未来戦略ライブラリのLPはLibraryのrehearsalが加わり約4分）。静的Webのためにjobを追加しない | 同じ2つ。変更したpathに応じてLibraryのrehearsalとAPI testが加わる |
| review | オーナーのmerge判断をreviewとみなす | オーナー以外が作ったPRは、作成者とは別のメンバー1名以上の承認が要る |
| 最新`main`の取り込み | conflictがなければ不要 | 最新`main`を取り込んだheadで必須CIの成功を確かめる |
| Cloudflare Preview | Web UIの変更はPreviewの実表示で確認する。影響の限られた微調整でオーナーがProduction公開を指示した場合は省略できる（`AGENTS.md`のGit and Deployment） | runbookのPreview手順に従う |

## 3. 開発の流れ

1. **タスクを決める。** 目的、対象範囲、完了条件をIssueまたは依頼に書く。
2. **branchを作る。** 最新の`origin/main`から作る。名前は`<種類>/<内容>`（例: `fix/library-hero-spacing`）とする。種類は`feat`、`fix`、`docs`、`test`、`chore`、`ci`のいずれかで、内容は英小文字とハイフンで短く書く。agentのツールがbranch名を自動で決める場合に限り、その接頭辞（`claude/`、`codex/`）のままでよい。
3. **変更する。** 1つのPRでは1つの目的だけを扱う。関連する文書とテストは同じPRで更新する。無関係なcopy・file・architectureを整理しない。
4. **PRを出す。** [PR template](../.github/pull_request_template.md)の全項目を書く。作業途中の共有にはDraft PRを使う。
5. **CIとreviewを通す。** 必須CIがすべて成功し、§2の区分に応じたreviewを得るまでmergeしない。
6. **mergeする。** オーナーがsquash mergeで`main`に取り込む。PRのタイトルがcommitの件名になるため、変更が分かるタイトルにする。CLIでは確かめたheadを固定して`gh pr merge <番号> --squash --match-head-commit <SHA>`を実行する。

## 4. Gitの運用

- `main`へ直接pushしない。force pushとbranch保護の変更をしない。
- 作業を始める前に`git fetch origin main`を実行する。安全境界の変更ではPRを出す前とmergeの前にも最新`main`を取り込み、影響する検証をやり直す。
- 他のメンバーのbranchには、本人の了承なくpushしない。
- 並行作業では、タスクごとに`git worktree`または別のcheckoutを使う。他の人やagentが使用中のcheckoutとbranchは編集しない。
- merge済みのbranchは削除する。mergeせずに閉じたPRのbranchも削除する。commitはPRに残り、PRの画面から復元できる。残したい案はIssueに記録する。
- PRのないbranchを残さない。作業を共有するときはDraft PRを出す。

## 5. Review

- reviewで最も重視するのは次の2点である。
  1. 変更が目的に合い、無関係な変更を含まないか。
  2. 本番への影響（公開サイト、独立surface、フォーム、Library、メール）が検証されているか。
- あわせて、原因が証拠で特定されているか、secretや個人情報が含まれていないか、検証結果が事実どおりで未実行の項目が明示されているかを確かめる。
- オーナー自身のPRはreviewを省略できる。PRと必須CIは省略できない。
- agentが作った変更は、作業を依頼した人の変更として扱う。オーナーのアカウントで動くagentが他のメンバーの依頼で作った安全境界の変更にも、reviewが要る。

## 6. AI agentの利用

- 依頼には、目的、対象範囲、完了条件を書く。
- 並行して動かすagentには別々のbranchとworktreeを割り当て、同じfileを編集させない。
- 依頼者は、agentの成果物を自分で確認してからreviewに出す。
- agentが作ったcommitには、ツールが付ける`Co-Authored-By`行を残す。
- agentにmergeやProduction公開をさせるのは、オーナーがそのPRについて明示的に指示した場合に限る。実装・commit・push・PR作成の依頼に、これらの許可は含まれない。
- 作業の引き継ぎはPRの説明とGitHub Issuesに記録する。sessionごとの引き継ぎ文書は新たに作らない。既存の日付付きの引き継ぎ文書は、当時の記録として残す。
- 不具合の原因はlog、source、再現結果などの証拠で特定する。証拠が得られない場合は「未確定」と書き、推測と事実を分ける。個別の事例に合わせた規則・例外分岐・promptの文言を足さず、失敗の一般形を特定して、既存の一般則か構造（code上の決定論的な検査を含む）で対処する。

## 7. 本番公開

- `main`へのmergeは、Cloudflare Pages project `compass-official`のProduction配信を起動し得る。そのためmergeはProduction操作として扱う。
- Library API、GAS deployment、Terraform、database migration、secret変更は、それぞれ別の外部変更であり、オーナーの明示承認を必要とする。
- 有料サービスの契約、外部サービスの追加、費用が発生する設定はオーナーが判断する。

## 8. GitHubの設定

オーナーが次の設定を保守する。このrepositoryの内容からは設定の現状を確かめられないため、変更した場合はこの節を更新する。

| 設定 | 値 | 理由 |
|---|---|---|
| `main`のruleset | PRを必須にし、直接push、force push、削除を禁止する | `main`はProduction配信を起動し得る |
| 必須status check | `CI result`、`Library security result` | 2つだけに保ち、静的WebのPRを待たせない |
| 最新`main`との一致の強制 | 無効 | 静的Webの速度を優先する。安全境界では§3の手順で人が確かめる |
| 必須の承認数 | 0 | オーナーのPRを待たせない。オーナー以外のPRの承認は§2・§5の運用で求める |
| merge方式 | squash mergeだけを許可する | PRのタイトルを`main`の履歴にする |
| Automatically delete head branches | 有効 | merge済みbranchを残さない |
| CODEOWNERS | [`.github/CODEOWNERS`](../.github/CODEOWNERS)で安全境界のpathにオーナーのreviewを自動で依頼する | 依頼だけで、承認を必須にはしない |

### 設定の手順

repository `genellect/compass`のSettingsで、オーナーが次の順に行う。設定を見直すときも同じ手順で現状と照合する。

1. **Settings → General → Pull Requests**
   1. **Allow squash merging**だけをオンにし、**Allow merge commits**と**Allow rebase merging**をオフにする。
   2. squash mergeの件名の既定値は**Default to pull request title**を選ぶ。
   3. **Automatically delete head branches**をオンにする。
2. **Settings → Branches**で`main`のbranch保護ルールの有無と内容を控える。
3. **Settings → Rules → Rulesets → New ruleset → New branch ruleset**で次のrulesetを作り、**Create**を押す。

   | 項目 | 設定 |
   |---|---|
   | Ruleset name | `main` |
   | Enforcement status | **Active** |
   | Bypass list | 空のまま |
   | Target branches | **Add target → Include default branch** |
   | Restrict deletions | オン |
   | Require a pull request before merging | オン。Required approvalsは**0**、Allowed merge methodsは**Squash**だけ |
   | Require status checks to pass | オン。**Add checks**で`CI result`と`Library security result`を追加する。**Require branches to be up to date before merging**はオフ |
   | Block force pushes | オン |

4. 手順2で保護ルールがあった場合は、rulesetと食い違わないよう削除する。
5. 確認：開いているPRで、2つのcheckに**Required**と表示され、mergeボタンの選択肢が**Squash and merge**だけであること。

## 9. このルールの変更

変更はPRで提案し、オーナーの承認を得る。同じPRで`AGENTS.md`、`CONTRIBUTING.md`、`CLAUDE.md`、`.github/copilot-instructions.md`など関連する文書をすべて更新し、文書間に矛盾を残さない。

文書間の矛盾を見つけた場合は、どちらかの誤りとして扱い、自分の判断で直さない。code、設定、記録と事実を照合したうえで、ただちにオーナーに確認する。

# Phase 7B 本番Drive OAuth / Secret Manager bootstrap手順

対象: 本番Drive所有者OAuth、Google Picker、本番folder fingerprint照合、既存Secret Managerへのversion追加  
redirect URI: `http://localhost:8769/oauth2/callback`  
local開始URL: `http://localhost:8769/`

## 1. 安全境界

このhelperは、Google Pickerで人間が承認した本番folderを選び、所有者・folder MIME・
未削除・共有可能・承認済みSHA-256 fingerprintを2回検証する。検証後も、本番worker、
Scheduler、Terraform activationは有効化しない。

helperが実装している外部書込みは、次の**既存**Secret Manager containerへの
`gcloud secrets versions add --data-file=-`だけである。

- `fsl-drive-oauth-client-id`
- `fsl-drive-oauth-client-secret`
- `fsl-drive-oauth-refresh-token`
- `fsl-drive-resource-id`

Drive permissionの作成・変更・削除、secret container作成、secret payload読取り、
clipboard操作、local `.env`作成、Terraform apply、worker activationは実装していない。
OAuth token、client secret、folder IDはprocess memoryとGoogle Pickerに必要な
`no-store` loopback応答だけで扱い、console、証跡file、Gitへ出さない。HTTP access logは
無効であり、OAuth callbackの認可codeをlogへ残さない。

## 2. 実行前PASS GATE

次をすべて満たすまで起動しない。

1. 専用Google Cloud projectと本番Web OAuth clientが人間の承認対象になっている。
2. OAuth clientのAuthorized redirect URIに
   `http://localhost:8769/oauth2/callback`が完全一致で登録されている。
3. Google Drive APIとGoogle Picker APIが有効である。
4. Data Accessに`https://www.googleapis.com/auth/drive.file`だけがDrive scopeとして
   登録されている。
5. Picker API keyはWebsite restriction `http://localhost:8769/*`とGoogle Picker API
   restrictionを持つ。
6. OAuth publishing statusとowner accountが、本番refresh tokenの有効期間要件を
   満たす。External/Testingの期限付きrefresh tokenを本番credentialとして固定しない。
7. 上記4つのSecret Manager containerが既に存在し、実行者はpayload閲覧権限ではなく
   必要最小限の`versions.add`権限を持つ。
8. Terraformはまだ旧numeric versionまたはstandbyをpinしており、新version追加だけで
   workerが起動しない。
9. 本番folder owner本人と別の人間reviewerが、folder用途とfingerprintを承認している。
   このDrive reviewerは管理画面の第二管理者を意味せず、管理者追加やProduction Cutoverの条件にしない。
   管理画面のprivate 2-account allowlist、MFA・recovery、deny-by-defaultはPhase 8B Gateで別に確認する。

## 3. gcloud手動認証

この認証はoperator本人が通常のEdgeまたはCodex browserで行う。code、password、tokenを
chatへ貼らない。

```powershell
gcloud auth login
gcloud auth list --filter=status:ACTIVE
```

表示されたbrowserで、対象Google Cloud projectに権限を持つ個人accountへloginする。
`gcloud auth list`のaccountが意図したoperatorであることを画面上で確認する。出力を
証跡へcopyしない。helperは`gcloud auth login`を代行せず、secret payloadも読み取らない。

## 4. 本番folder fingerprintの承認

folder IDをcommand line引数、shell history、clipboard、text fileへ置かない。repository rootで
review modeを起動し、Drive URLを見ながらfolder IDを**手入力**する。入力は非表示である。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase7b-production-drive-bootstrap.ps1 -FingerprintReview
```

出力される`approved_folder_sha256`（64桁）と`approved_folder_sha256_16`だけをreview記録へ
転記する。生folder IDは記録しない。reviewerはDriveのfolder名、用途、owner、Share画面を
別途目視し、64桁fingerprintを承認する。

## 5. bootstrap起動

repository rootで次を実行する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase7b-production-drive-bootstrap.ps1
```

terminal promptへ順に入力する。

1. 専用Google Cloud project ID（非表示）。
2. 本番Web OAuth Client ID（非表示）。
3. 本番Web OAuth Client Secret（非表示）。
4. restriction済みGoogle Picker API key（非表示）。
5. Google Cloud project number / Picker App ID（非表示）。
6. 人間承認済みfolder SHA-256（64桁。fingerprintなので表示される）。

wrapperは値をProcess環境だけへ設定し、終了時に元の値へ戻す。User/Machine環境変数、
`.env`、DB、証跡fileへ保存しない。`gcloud`がPATHにない場合、認証されていない場合、
4つのcontainerの一つでも存在確認できない場合は、OAuth browserを開く前にBLOCKEDとなる。

## 6. browser操作と最終phrase

1. `http://localhost:8769/`を開く。LAN IPや別portで公開しない。
2. **所有者Google認証を開始**を押す。
3. 本番folderを所有するGoogle accountを選び、`drive.file`へ同意する。
4. **Google Pickerを開く**を押す。
5. 人間review済みの本番folderだけを選択する。
6. helperがDrive APIで`ownedByMe=true`、folder MIME、`trashed=false`、
   `canShare=true`、64桁fingerprint完全一致を確認する。
7. 表示された16桁fingerprintが承認記録の短縮値と一致することを人が再確認する。
8. Secret Manager targetが上記4 containerだけであることを確認する。
9. 次のphraseを完全一致で入力する。

```text
I_APPROVED_PRODUCTION_DRIVE_CREDENTIAL_BOOTSTRAP_V1
```

10. **既存Secret Managerへ直接streamする**を押す。
11. `PASS`と、4件それぞれのsecret ID、numeric version、value fingerprintだけが
    表示されたことを確認する。

このphraseはcredential bootstrapの承認であり、worker side effect activationの承認
`I_APPROVED_PRODUCTION_DRIVE_SIDE_EFFECTS_V1`とは別物である。bootstrap完了だけを根拠に
Terraformの`worker_drive_activation.enabled`を`true`へ変更しない。

## 7. 実行後の引渡し

表示されたsecret ID、numeric version、value fingerprintだけをProduction Gate記録へ
転記する。token、client secret、client ID、folder ID、OAuth code、Google account情報、
browser screenshotを転記しない。

次の外部変更は別のreviewと明示承認が必要である。

1. `terraform.tfvars`の4つの`secret_versions`を新numeric versionへ更新する。
2. `terraform plan`でworker以外へDrive secret IAM bindingが出ないことを確認する。
3. owner交代、revocation、secret rotation、kill switchの手順を人間E2Eする。
4. `worker_drive_activation`を承認phrase付きで有効化する。
5. 本番folderに対する1件のgrant / idempotency / revokeを人間が確認する。

## 8. BLOCKED・中断・部分成功

- OAuth callback失敗またはrefresh token欠落: Google Accountのthird-party accessを確認し、
  期限・publishing status・既存grantをreviewしてから再実行する。credentialを手動copyしない。
- Picker拒否: owner、folder種別、Trash、Share能力、64桁fingerprintを確認する。別folderへ
  変更するなら新しい人間approvalが必要である。
- confirmation phrase不一致: secret versionは1件も追加されない。
- Secret Manager write途中失敗: 既に作成されたsecret IDとversionだけが`BLOCKED`結果へ
  表示される。Terraformは旧versionをpinしているためworkerへ反映されない。secret payloadを
  読み戻さず、IAM/quota/networkを修正して再実行し、新たに揃った4 versionをreviewする。
- browserやPCの強制終了: process memoryは失われるが、Google側OAuth grantが残る可能性がある。
  Secret Manager結果が4件揃ったと確認できない場合はworkerをstandbyのままにし、Google
  Accountのthird-party accessとSecret Manager version metadataを人間が確認する。

secret versionのdisable/destroy、OAuth grantのrevocation、container削除はこのhelperのscope外で
あり、明示承認なしに行わない。

## 9. local verification

実ネットワーク、Google OAuth、Drive、gcloudを使わず、fake sinkだけでfocused testを実行する。

```powershell
cd .\services\library-api
.\.venv\Scripts\python.exe -m pytest `
  tests\test_phase7_production_drive_bootstrap.py
```

testはloopback/offline/`drive.file` contract、folder gate、承認fingerprint、exact phrase、
`--data-file=-` stdin streaming、既存container preflight、sanitized result、Drive permission
mutation endpoint不在を検証する。fake sink以外へversionを作成しない。

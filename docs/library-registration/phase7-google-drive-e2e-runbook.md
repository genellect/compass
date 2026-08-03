# Phase 7 実Google Drive E2E 手動手順

> **現行補足:** Drive E2E手順自体は利用できるが、第二管理者の準備・承認を前提とする記述はADR-0003と`phase-roadmap-v3.md`で廃止済みであり、現行Gateには適用しない。

対象: 所有者OAuth、Google Picker、空のMy Driveテストフォルダ  
redirect URI: `http://localhost:8767/oauth2/callback`  
ローカル開始URL: `http://localhost:8767/`

## 1. この試験で行うこと

実装済みPhase 7 workerを使い、テスト受信者へ`reader` permissionを1件作成する。
Google Drive標準招待通知、別アカウントからの閲覧、編集不可を人が確認した後、
同じworkerで作成permissionを削除する。最後にOAuth grantも失効する。

本番フォルダ、実利用者、合成データ専用Neon、本番登録導線は使用しない。

## 2. Google Cloud（英語UI）

`compass-auth` projectを選択して次を行う。

1. **APIs & Services > Library** を開く。
2. **Google Drive API** を検索し、**Enable**。Enabledなら変更不要。
3. **Google Picker API** を検索し、**Enable**。
4. **Google Auth Platform > Data Access** を開く。
5. **Add or remove scopes** から
   `https://www.googleapis.com/auth/drive.file` を追加し、保存する。
6. **Google Auth Platform > Clients** で既存Web clientを開く。
7. **Authorized redirect URIs** に
   `http://localhost:8767/oauth2/callback` を完全一致で追加する。
8. **Audience** がExternal/Testingなら、Drive所有者Googleアカウントを
   **Test users**へ追加する。
9. **APIs & Services > Credentials > Create credentials > API key** を選ぶ。
10. 作成したkeyの**Application restrictions**を**Websites**にし、
    Website restrictionへ`http://localhost:8767/*`を追加する。
11. **API restrictions**を**Restrict key**にし、**Google Picker API**だけを選ぶ。
12. Project dashboardまたは**IAM & Admin > Settings**でProject numberを確認する。

Client Secret、API keyはチャット、Git、Markdown、スクリーンショットへ貼らない。
API keyはOAuth secretと同じ資格情報ではないが、必ずreferrer/API制限を設定する。

## 3. Drive側の準備

1. Drive所有者アカウントのMy Drive直下に、新しい空フォルダを1つ作る。
2. 中にファイル、ショートカット、サブフォルダを置かない。
3. テスト受信者へ事前共有しない。
4. Secret Managerで管理する本番フォルダは選択しない。
5. 所有者と異なるGoogleアカウントをテスト受信者にする。

helperはPickerで選択されたfolderについて、Drive APIから返るIDの一致、folder MIME、
未削除、`ownedByMe=true`、共有可能、作成から24時間以内、子要素0件を再検証する。
所有者OAuthのメールとテスト受信者メールが同じ場合も拒否する。これらは画面上の
注意だけではなく、外部permission作成前の強制条件である。

## 4. ローカル起動

repository rootで次を実行する。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\start-phase7-drive-e2e.ps1
```

端末のpromptへ、次を順に入力する。

1. Web OAuth Client ID。
2. Web OAuth Client Secret。画面には表示されない。
3. 制限済みGoogle Picker API key。画面には表示されない。
4. Project number。
5. テスト受信者メール。

値はprocess memoryだけで使用する。wrapperは`.env`、Windows User環境変数、DB、
Gitへ保存しない。次にEdgeで`http://localhost:8767/`を開く。

helperは`127.0.0.1`だけでlistenし、`localhost:8767`または`127.0.0.1:8767`以外の
Hostを拒否する。HTML応答にはCSP、frame拒否、no-storeを設定し、POST bodyは20,000
bytesまで、各変更stageは1回だけ実行できる。別ポートやLANアドレスへ公開しない。

## 5. 画面操作

1. **所有者Google認証を開始**を押す。
2. テストフォルダの所有者アカウントを選び、`drive.file`へ同意する。
3. **Google Pickerを開く**を押す。
4. 新規の空テストフォルダだけを選ぶ。
5. 画面が「実reader付与の最終確認」になったら一度停止する。
6. 対象が本番フォルダでないこと、テスト受信者が正しいことを再確認する。
7. **テスト権限を作成する**を押す。ここで初めて外部permissionが変わる。
8. 別ブラウザまたはEdge InPrivateでテスト受信者へログインする。
9. Google Drive標準招待通知が届いたことを確認する。
10. テストフォルダを閲覧でき、編集・追加・削除できないことを確認する。
11. 元画面で「通知受信」「閲覧可能」「編集等不可」の3つのcheckboxをONにする。
12. **テスト権限を削除する**を押す。
13. テスト受信者側を再読み込みし、今度はフォルダを閲覧できないことを確認する。
14. 元画面の削除後確認checkboxをONにし、**OAuth grantを失効し証跡を保存する**を押す。
15. `Phase 7 Drive E2E: PASS`を確認する。

sanitized evidenceは`outputs/phase7-drive-e2e/`へ保存され、Git ignore対象である。
メール全文、Google `sub`、folder ID、permission ID、token、認可codeは保存しない。
証跡は各ID/emailの16桁SHA-256 fingerprintまたはdomainと、実際に通過した個別gate
だけを記録する。OAuthはrevocation endpointの200に加え、同じrefresh tokenでの
refreshが`invalid_grant`になることを確認できた場合だけ失効PASSとする。

## 6. 失敗時

- `redirect_uri_mismatch`: Web clientのURIを文字単位で確認する。`localhost`を
  `127.0.0.1`へ変更しない。
- Pickerが開かない: Google Picker API有効化、Project number、API keyの
  Website/API restrictionsを確認する。
- folder確認で戻る: 所有者が選択した新規空フォルダか、テスト受信者に既存権限が
  ないか確認し、最初から再認証する。
- grantがBLOCKED: helperはDBに`managed_by_system=true`かつ作成応答のpermission IDを
  記録できた場合に限り、その同一permissionを削除してOAuthを失効する。
  それでも警告が出た場合、Driveの**Share**画面でテスト受信者が残っていないか
  手動確認し、残っていれば所有者が削除する。
- cleanupがBLOCKED: 同じくShare画面でテスト受信者を削除する。証跡はPASSにしない。
- 通常の`Ctrl+C`中断: Pythonの`finally`で上記の安全条件によるpermission cleanupと
  OAuth失効を試みる。Task Manager、PC電源断、process強制終了ではfinallyを保証できない。
  その場合は所有者がテストfolderの**Share**とGoogle Accountのthird-party accessを
  手動確認し、残存permission/grantを削除する。
- OAuth失効がBLOCKED: 証跡は`blocked`になる。Google Accountのthird-party accessで
  `compass-auth`のaccessを削除し、refreshが使えない状態にするまでPASSへ変更しない。

External/TestingのOAuth refresh tokenは長期本番資格情報として扱わない。この試験は
正常完了または通常中断の同一runで失効を試みる。本番用refresh tokenはPhase 6Bでpublishing status、
Secret Manager、失効・再認可、第二管理者引継ぎを承認した後に別途取得する。

## 7. 仕様根拠

- Google Drive `drive.file` scopeは、アプリで開いた/作成したファイル、または
  Google Pickerで利用者がアプリへ共有したファイルに限定される。
- `drive.file`はnon-sensitiveで、既存フォルダにはGoogle Pickerとの併用が推奨される。
- `permissions.create`の同一fileへの並行操作は避ける必要があるため、workerは
  resource leaseで直列化する。

参考:

- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/picker/guides/web-picker
- https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/create

# 未来戦略ライブラリ MailApp通知ゲートウェイ

Status: implemented locally; manual Apps Script deployment and production E2E pending
Scope: Drive権限付与完了後の申請者メール1通と、個人情報を含まない管理者通知1通

## 1. 境界

`google-apps-script/library-registration-notifications/` は、旧GASの送信元を維持するための
通知専用Web Appである。使用するGoogleサービスは`MailApp`だけで、Drive、Forms、Sheets、
Gmail APIを呼ばない。Driveの標準共有案内は既存workerの
`sendNotificationEmail=true`で別に送信される。

バックエンドは次の両方を確認した後だけ、このWeb Appを呼ぶ。

1. server側で有効な申請が最終承認されている。
2. 対象メールへのDrive閲覧権限が`granted`または`already_granted`になった。

通知失敗を理由にDrive権限を再作成しない。GASはDrive権限を作成、削除、確認できない。

## 2. 署名契約

Request bodyは次の5項目だけを持つ。未知の項目は拒否される。

```json
{
  "version": "fsl-notification-v1",
  "issuedAt": "2026-08-04T10:00:00.000Z",
  "messageId": "8ab3959a-7184-40ca-8208-b4cb481ede35",
  "payload": {
    "registrationId": "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141",
    "fullName": "北里 花子",
    "email": "controlled-user@st.kitasato-u.ac.jp",
    "eligibilityStatus": "approved",
    "driveAccessStatus": "granted",
    "processedAt": "2026-08-04T09:59:30.000Z"
  },
  "signature": "lowercase-hex-hmac-sha256"
}
```

- `messageId`と`registrationId`はlowercase UUID。
- `issuedAt`と`processedAt`はUTCのISO 8601。副作用を伴う初回・部分再送は`issuedAt`の前後5分以内だけ。
- `fullName`は前後空白なし、制御文字なし、200文字以内。
- `email`はlowercaseの`@st.kitasato-u.ac.jp`完全一致だけ。
- `eligibilityStatus`は`approved`だけ。
- `driveAccessStatus`は`granted`または`already_granted`だけ。
- 学籍番号、学年、在籍区分、質問、規約回答、Drive resource ID、permission IDは送らない。

署名対象は次の4要素をLFで連結する。

```text
fsl-notification-v1
<issuedAt>
<messageId>
<canonical JSON of payload>
```

canonical JSONはUTF-8、余分な空白なし、全object keyを再帰的にUnicode code point順で
並べる。signatureはHMAC-SHA256のlowercase hexである。
異なるruntime間の一致確認には
`contracts/library-registration/mailapp-notification-v1-test-vector.json`の合成test vectorを使う。
このfixtureのzero keyはtest専用で、本番設定に使用してはならない。

### 派生鍵

新しいroot secretやSecret Manager containerは作らない。既存のDrive operation attestation
rootから用途分離して32-byte鍵を派生する。

```text
derived_key = HMAC-SHA256(
  key = UTF-8 bytes of existing Drive attestation root,
  message = UTF-8 bytes of "fsl-mailapp-notification-v1"
)
```

Apps ScriptのScript Propertyには`derived_key.hex()`のlowercase 64文字だけを保存する。
root自体をApps Script、Git、チャット、ログへ保存しない。通知署名はhex文字列ではなく、
hexをdecodeした上記32-byte `derived_key`をHMAC keyとして行う。

## 3. Script Properties

Apps Script editorの`Project Settings` → `Script Properties`へ、次の3件を手入力する。

| Key | Value |
|---|---|
| `FSL_NOTIFICATION_HMAC_KEY` | 前節のlowercase 64文字の派生鍵 |
| `FSL_NOTIFICATION_ADMIN_EMAIL` | 通知を受ける管理者メール1件 |
| `FSL_NOTIFICATION_DRIVE_URL` | 人が確認した本番Drive folderのHTTPS URL |

値はGit、issue、CI artifact、スクリーンショットへ残さない。管理者メールは単一アドレスだけ、
Drive URLは`https://drive.google.com/drive/folders/...`形式だけが許可される。

## 4. 旧GASからの安全な切替手順

1. 旧Apps Script projectとデプロイURLを運用記録へ控える。コードや回答データを公開repoへ移さない。
2. 同じ大学Workspace所有者の下に、通知専用の新しいApps Script projectを作る。旧projectのコード、manifest、triggerはこの時点では変更しない。
3. 新projectの`Code.gs`へ通知専用版を反映する。manifest表示を有効にし、同folderの`appsscript.json`を反映する。
4. 前節のScript Properties 3件を手入力する。
5. `Deploy` → `New deployment` → `Web app`を選ぶ。
6. `Execute as`は旧メール送信元と同じ大学Workspace所有者、`Who has access`はbackendからPOSTできる設定にする。
   公開到達可能な場合も、正しいHMACと時刻窓がなければ送信されない。
7. 発行された`/exec` URLをbackendの管理されたruntime設定へ登録する。URLや鍵をsourceへ直書きしない。
8. editorから`doPost`を直接実行しない。eventがないため意図どおり拒否される。
9. 通知専用projectのcanaryと本番相当E2Eが成功した後に限り、旧Google Formの`handleFormSubmit`インストール型triggerを無効化する。旧projectはrollback証跡として保存し、Drive/Form/Sheet処理を通知projectへコピーしない。

通知専用projectにDrive/Form/Sheet処理やtriggerを追加してはならない。送信元を維持できない場合は
新規デプロイを進めず、所有者accountを確認する。旧triggerの停止前に旧Google Formの受付停止と
新しい登録導線への切替を確認し、新旧双方から同一人物へ送信されないことを確認する。

## 5. 再送・障害時の動作

- Script Lockで同時送信を直列化する。
- Script Propertiesにはmessage ID、payloadの用途分離HMAC tag、申請者/管理者それぞれの送信済みflag、更新時刻だけを保存する。
  氏名、メール、本文、Drive URL、HMAC key以外の秘密をledgerへ保存しない。
- 同じmessage ID・同じpayloadの完了済み再送は、fresh `issuedAt`でsignatureが変わっても
  `duplicate: true`で成功し、メールを再送しない。
- 片方だけ成功した場合、同じmessage ID・payloadをfresh `issuedAt`で再署名すると未送信側だけを送る。
- 同じmessage IDに異なるpayloadを使うと`conflict`で拒否する。
- 初回はMailApp残quotaが2未満なら何も送らない。部分再送は残り1通分を確認する。
- ledgerは8日超または250件超を削除する。期限切れrequestは新しいmessage IDとissuedAtで作り直す。

MailApp送信成功とledger書込の間で実行環境が強制終了した場合だけ、重複の狭い可能性が残る。
通知をDB outboxとして記録するbackend側では、同じmessage IDを維持し、GASの結果を監査状態として
保存する。`email`、`quota`、`busy`はDrive操作とは分離して再試行する。

## 6. 応答

成功は`{"ok":true,"messageId":"..."}`、完了済み再送は`duplicate:true`を追加する。
失敗は個人情報を含まないcodeだけを返す。主なcodeは`validation`、`unauthorized`、`stale`、
`conflict`、`busy`、`quota`、`email`、`configuration`である。request body、メールアドレス、
署名、鍵、本文をconsoleへ出力しない。

## 7. Production E2E

1. backend/GAS双方の時計が同期していることを確認する。
2. 管理者本人が管理する`@st.kitasato-u.ac.jp` canary 1件で、登録からDrive付与まで完了させる。
3. Google標準Drive共有案内、申請者向け受付メール、管理者向け完了通知の計3通を区別して確認する。
4. 申請者メールのDrive URLで閲覧でき、編集できないことを確認する。
5. 管理者メール本文に氏名、メール、学籍番号、質問、Drive identifierがないことを確認する。
6. 同じmessage IDを再送し、追加メール0通と`duplicate:true`を確認する。
7. signature改変、個人Gmail、5分超のrequestでメール0通を確認する。

この人間E2Eが完了するまでは`Implemented, verification pending`であり、本番通知PASSとはしない。

## 8. 停止・rollback

異常時はまずbackendからGASを呼ぶ通知flag/Schedulerを停止し、Drive workerを不用意に再実行しない。
次にApps Script deploymentを無効化する。通知停止は既に付与済みのDrive権限を変更しない。
再開時はScript Properties、デプロイversion、backend endpoint、同一message IDのledger状態を確認し、
管理者向けcanary、申請者向けcanaryの順に行う。

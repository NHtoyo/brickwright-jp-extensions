# SPIKE Prime Hub OS 1.6.62：プローブ00起動ログの分析

## 結論

今回のログだけでは、Pythonがロード前に失敗したのか、実行後にすぐ終了したのか、stop通知が別の実行に由来するのかを確定できません。確認できたのは、スロット1へのファイル転送要求と起動要求が応答コード0で受理され、その後、スロット番号を持たないstop通知が1件届いたことです。Pythonの開始・終了を示すログはありません。

原因を確定できない主因は、以前のプローブ00が`print()`を含まない無期限待機プログラムだったことと、`ProgramFlowNotification (0x20)`にスロット番号・要求ID・終了理由がないことです。旧判定は、このstop通知をスロット1のプログラムに由来するとみなし`failure`にしていました。これは証拠以上に断定していました。今回の修正では、通知単独で帰属できない停止を`indeterminate`にし、次回はPythonの段階マーカーと通知を別々に記録します。

実機操作、スロット操作、ファームウェア操作は行っていません。スロット19にも触れていません。

## 今回の実測ログ

時刻は添付JSONのUnixミリ秒をUTCで表示しています。受信した生バイト列は添付ログに保存されていないため、下表の「形式」はJSONに記録されたフィールドからの復元です。

| UTC時刻 | イベント | 記録された結果 |
| --- | --- | --- |
| 04:58:58.165 | InfoResponse | Firmware `1.6.62`、RPC `1.0.14` |
| 04:58:58.165 | DeviceNotificationRequest | 100 ms間隔で要求 |
| 04:58:58.194 | DeviceNotificationResponse | status `0`、通知要求を承認 |
| 05:00:21.863 | 起動プローブ診断開始 | Probe `00`、slot `1`、`brickwright-probe-00.py`、sourceBytes `321` |
| 05:00:21.864 | ClearSlotRequest `0x46` | slot `1`、response status `0` |
| 05:00:22.000 | StartFileUploadRequest `0x0C` | response status `0` |
| 05:00:22.133 | TransferChunkRequest `0x10` | 1チャンク、321 bytes、response status `0` |
| 05:00:22.183 | ProgramFlowRequest `0x1E` | start要求のBLE書き込み完了は .184、response status `0`は .869 |
| 05:00:22.872 | ProgramFlowNotification `0x20` | action `stop` (`0x01`)、start通知なし。応答から約3 ms後 |
| 05:00:22.872 | プローブ結果 | `failure`、`executionStartedAt=null`、コンソール出力なし |

接続は維持され、IMU通知はその後も継続しています。COBS解析失敗・不正メッセージ・未対応レコードはいずれも0です。`programFlowStop`要求は記録されていません。このため、診断側がstopを送って停止させた結果ではありません。

`runtimeMs=1009`は診断開始から結果確定までの合計です。情報応答待ち、slot消去、転送、起動応答待ちを含み、Pythonの実行時間ではありません。stop通知はProgramFlowRequestの約686 ms後で、ProgramFlowResponseの約3 ms後です。

旧JSONでは`executionFinishedAt`がstop通知と同じ`1794459622872`になっていますが、`executionStartedAt`は`null`です。これは旧コードがプログラムフローのstop通知をPython実行終了時刻として代入していたためで、Python完了の証拠ではありません。今回の修正では開始・終了時刻をPythonの固有段階マーカーからだけ記録し、stop通知だけでは`executionFinishedAt`を埋めません。

## 実際に転送対象だった旧プローブ00

コミット時点のfixtureと拡張内ソースは同一で、次のPythonです。

```python
"""No-hardware SPIKE startup probe: runloop only.

Do not transfer or start this program without the user's explicit approval.
It does not import hub APIs, access module_tunnel, print, or control hardware.
"""

import runloop


async def main():
    while True:
        await runloop.sleep_ms(1000)


runloop.run(main())
```

このfixtureはUTF-8、321 bytes、LF改行、末尾改行ありです。旧コードは`TextEncoder().encode(probe.source)`で得たバイト列をそのままStartFileUploadRequestのCRC計算とTransferChunkRequestに使い、間に改行変換やコード生成を挟みません。診断の`sourceBytes=321`と`transferredBytes=321`は一致しています。ただし、今回のJSONにはソース本文、CRC、TransferChunkの内容がないため、実機へ送られた全バイトがfixtureと一致したことを後からバイト単位で証明する情報はありません。実装経路とサイズは一致しています。

旧ソースと更新fixtureは、ホストのCPython 3.13.11で`ast.parse` / `compile()`を通過しました。`mpy-cross`とMicroPython実行環境はこの開発環境にありません。CPythonの構文検査はLEGO MicroPythonのロード・import・実行を証明しません。LEGOの公開例にも`import runloop`、`async def main()`、`runloop.run(main())`の形式と`runloop.sleep_ms()`の使用例があります。ただし、公開例はHub OS 1.6.62を明示した互換性保証ではなく、同ファームウェアでの実行を証明しません。

## 次回用に更新したプローブ00のコード

次回用fixtureは次のとおりです。実行時に`__RUN_ID__`だけを現在のUnixミリ秒文字列へ置換し、生成後のソースをJSONに保存してから、その同じUTF-8バイト列でCRCと転送チャンクを作ります。

```python
"""No-hardware SPIKE startup probe: runloop only.

This probe prints unique stage markers but does not import hub APIs, access
module_tunnel, or control hardware. The uploader embeds a per-run marker ID.
"""

print("BWPROBE00:__RUN_ID__:TOP_LEVEL")
import runloop
print("BWPROBE00:__RUN_ID__:RUNLOOP_IMPORTED")


async def main():
    print("BWPROBE00:__RUN_ID__:MAIN_STARTED")
    await runloop.sleep_ms(2000)
    print("BWPROBE00:__RUN_ID__:SLEEP_COMPLETED")
    print("BWPROBE00:__RUN_ID__:MAIN_COMPLETED")


runloop.run(main())
```

13桁の実行IDなら生成ソースは547 bytesです。CRC32はIDに依存します（例のID `1794459621863` では、4-byte境界にNUL paddingした値は`0x2e25d232`）。トップレベル出力は構文解析が終わってPythonが最初のprintを実行した証拠になります。各段階の出力が受信できた場合だけ、その段階まで進んだと扱います。コンソール通知が欠ける可能性があるので、後段マーカーの不在だけから前段の実行失敗を断定しません。

## 通信仕様との照合

- 公式仕様では`ProgramFlowRequest (0x1E)`はmessage type、action、slotの3バイトです。現行コードのstart要求は`[0x1E, 0x00, slot]`で、公式サンプルの`ProgramFlowRequest(stop=False, slot)`と一致します。
- `ProgramFlowResponse (0x1F)`はmessage typeとResponse Statusです。公式enumは`0x00`をAcknowledged、`0x01`をNot Acknowledgedとしています。今回のstatus `0`は起動要求が受理された証拠で、Pythonの実行成功を示しません。
- `ProgramFlowNotification (0x20)`はmessage typeとProgram Actionだけです。公式enumは`0x00`をStart、`0x01`をStopと定義します。スロット、要求ID、Python例外、終了理由は含みません。したがって今回のstopをslot 1へ確実に対応づけることはできません。
- `ConsoleNotification (0x21)`は最大256バイトのコンソール文字列です。LEGOの公開BLEサンプルはアップロードするPython例に`print()`を含み、hubから届くmessageを受信して出力します。しかし、今回の旧probe 00には`print()`がないため、通知0件は想定どおりで、コンソール経路が壊れている根拠にはなりません。
- LEGOの公開BLEサンプルも、InfoRequest、通知購読、ClearSlot、StartFileUpload、TransferChunk、ProgramFlow startの順で処理し、ProgramFlowResponseを待ちます。これは現在の転送順序と整合します。公開サンプルは`0x20`を使ったslot単位の実行結果判定や、Python例外の終了コードを示していません。

参照： [LEGO SPIKE Primeメッセージ仕様](https://lego.github.io/spike-prime-docs/messages.html)、[enum定義](https://lego.github.io/spike-prime-docs/enums.html)、[BLE接続と転送例](https://lego.github.io/spike-prime-docs/connect.html)、[LEGO公式Pythonシリアライザー](https://github.com/LEGO/spike-prime-docs/blob/main/examples/python/messages.py)、[LEGO公式BLEアプリ例](https://github.com/LEGO/spike-prime-docs/blob/main/examples/python/app.py)、[SPIKE Prime Pythonプログラム例](https://assets.education.lego.com/v3/assets/blt293eea581807678a/blt02bcbffa2bf460b5/65df44a50f1d35dffdca4995/EN-US-SPIKE-Prime-Python-Programs_Feb-2024.pdf?locale=en-us)。

公式公開資料で確認できるのは通信形式と一般的なPython APIの例までです。Hub OS 1.6.62におけるPythonランタイムの厳密な互換表や、例外時の0x20通知条件は確認できていません。公式SPIKEアプリ内部の非公開実装も、この調査では比較していません。

## 原因候補

| 候補 | 今回のログとの整合性 | 現時点の判定 |
| --- | --- | --- |
| Pythonの構文解析・ロードに失敗 | start通知なし、短時間後にstopと整合。ただし転送完了応答は構文解析を検査しない | 未確定。旧ソースはホストCPythonで構文解析可能でも、Hub上の解析成功は未証明 |
| `runloop` importまたはHub OS上のAPI初期化に失敗 | 起動要求受理後すぐ停止する現象と整合 | 未確定。旧probeには例外記録も実行マーカーもない |
| Pythonが動いたがコンソール記録がない | 旧probeは`print()`を一度も呼ばない | 今回のログからはコンソール経路を評価できない |
| stop通知が前回実行など別イベントに由来 | `0x20`にslot/request IDがなく、添付ログにも受信message bytesや直前履歴がない | 排除できない |
| start/stop通知処理の非同期競合 | 現行コードはstart要求時刻以降の通知をrunへ保存し、待機開始前に届いたstartも後から検索する | start通知の取りこぼしはコード上の主要原因とは見えない。ただし過去通知との厳密な相関はプロトコル上できない |
| プログラムが正常終了した | 旧sourceは無限ループなので、同じsourceが通常実行されての自然終了とは整合しにくい | slot 1のプログラム由来と確定できず、終了理由も仕様にない |

現段階で確定した根本原因はありません。特に「stop通知が3 ms後に来たからPythonが例外終了した」とは断定できません。

## 診断コードの変更

プローブ00を、無期限待機から、実行段階を出力して2秒後に終了するハードウェア非操作プローブへ更新しました。各実行には時刻ベースの一意なIDを埋め込み、過去の遅延コンソール通知との混同を減らします。マーカーは次の順です。

1. `TOP_LEVEL` — Pythonトップレベルで最初のprintまで実行
2. `RUNLOOP_IMPORTED` — `runloop` import後
3. `MAIN_STARTED` — async `main()`開始
4. `SLEEP_COMPLETED` — 2秒のsleepから復帰
5. `MAIN_COMPLETED` — mainの最後のprintまで到達

`executionStartedAt` / `executionFinishedAt`はこのPythonマーカーからのみ設定し、両方ある場合だけ`executionDurationMs`を計算します。`runtimeMs`の意味をJSON内で明記しました。ProgramFlowの通知はPythonマーカーと別の証拠として残し、0x20のdecoded message bytesと「slotを含まない」相関制約を記録します。転送要求・応答もprotocol message bytes（16進）とCOBS wire frame（16進）、送信BLEパケット長、ソース本文、UTF-8サイズ、改行形式、CRC32を保存します。

旧判定の「start通知なしでstop通知を受信」を`failure`とした点を修正し、`indeterminate`にしました。通知だけではslotと終了理由を特定できないためです。転送拒否・起動要求拒否は引き続き`failure`、start要求後の通信エラーやPythonマーカー欠落は`indeterminate`です。停止要求の安全処理は削除していません。

今回受け取った過去のJSONには、実BLEのCOBSフレームや個々のGATT書き込み断片は保存されていません。そのため、過去の転送・通知のwire bytesは遡って復元できません。更新後の診断では、次回の単回試験について、要求・応答のSPIKE message本文に加え、COBSフレーム全体の16進データを保存します。送信要求ごとにBLEパケット分割後の各パケット長も記録します。受信フレームは0x02 delimiterを含む再構成後のフレームです。個々のGATTイベント時刻までは記録しません。

## 次の単回実機試験

この作業では転送も起動もしていません。次回、明示的に実機試験を進める場合はプローブ00だけを1回実行します。プローブ01・02へは進みません。

1. SPIKEアプリで現在のslot 1が前回の321-byte probe 00であることを確認します。Brickwrightは既存内容を読んだり復元したりできません。slot 19は保護し、選択しません。
2. Brickwrightの開発者向けブロックからプローブ00をslot 1で1回だけ実行します。確認画面には消去・置換が表示されます。実行されるのは新しいソースで、ファイル名は`brickwright-probe-00.py`です。
3. 完了後、診断JSONを保存します。再接続や再転送を繰り返さず、そのJSONを解析します。
4. 判定：
   - `TOP_LEVEL`なし：Python実行前の失敗とは断定せず、コンソール経路も含め判定不能。
   - `TOP_LEVEL`あり、`RUNLOOP_IMPORTED`なし：Pythonトップレベル到達は確認。import位置以降は未確認。
   - `MAIN_STARTED`あり、`SLEEP_COMPLETED`なし：async main開始は確認。sleep完了前に終了したか、コンソール通知欠落かは追加情報が必要。
   - 全マーカーとstart/stop通知あり：このプログラムがトップレベルからmain終端マーカーまで到達した証拠。Hub OSの他API、通常のSPIKE制御、モーター/LED/音は証明しない。
   - マーカーは揃うがstart通知なし：Pythonは動いた証拠がある一方、ProgramFlow通知系列は不完全。全体判定は`indeterminate`。
   - 予期しないstop、Hub停止、接続異常：そこで終了し、01/02や通常制御命令を試さない。

ログの証拠だけで構文解析失敗とコンソール配送失敗を完全に区別できない場合は、その限界を維持します。ファームウェア変更・プログラム書き換え・モーター・LED・音操作は、この試験に含めません。

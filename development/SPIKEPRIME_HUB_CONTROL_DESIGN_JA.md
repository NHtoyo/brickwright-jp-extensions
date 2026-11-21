# SPIKE Prime Hub OS 1.6.62 制御経路の設計と検証状況

更新日: 2026-11-03
対象: `work/spikeprime-hub-control-runtime`（PR #3 の開発ブランチを基点とする）

## 根本原因

前段のSPIKE 3.x送信処理は、`sendCommand()`からJSONをTunnelMessage (`0x32`) に入れていました。たとえばモーター命令を送っても、LEGO仕様が定めるのはメッセージ種別、ペイロード長、任意のペイロードだけです。JSONをモーター命令として解釈するHub OS側プログラムが存在しなかったため、BLEへのwrite成功は制御命令の実行を意味しませんでした。

`sendPythonCommand()`もPython文字列をペイロードに格納していましたが、`0x32`はPython REPLではありません。ハブ側の実行器、要求ID、応答待ち、実行失敗応答もなかったため、実行されたと誤認し得る設計でした。SPIKE 2.x向けのPython断片をSPIKE 3.xへ送る経路も同じ問題を持っていました。

## 仕様と採用した方式

LEGOの公式プロトコル文書では、`0x32`は任意のトンネルペイロードを搬送します。メッセージ意味論やSPIKE命令セットは規定されていません。公式Pythonサンプルは、利用者の確認後に指定プログラムスロットをクリアし、CRC付きでファイルを転送し、各応答を確認してから`ProgramFlowRequest`で起動します。

この変更では、公式手順に沿ったファイル転送・起動を用い、その上で**独自の制御プログラム**が`module_tunnel`経由の小さな許可済みコマンドだけを実行する設計にしました。`module_tunnel`の受信コールバック／送信APIは第三者実装のコードを根拠にしています。LEGO公式の公開プロトコルには記載がなく、Hub OS 1.6.62で利用できるという公式保証も見つかっていません。接続直後に独自応答`bw-spike-1`を待ち、応答しない場合は準備未完了として出力命令を拒否します。

任意Pythonを`eval`/`exec`する機能はありません。コマンドIDと応答を照合し、コマンドを順番に処理します。応答タイムアウトで成功扱いにせず、接続喪失時はハブ側ウォッチドッグがモーターと音を停止する構成です。BLE write途中で失敗した場合、部分COBSフレームへ後続命令が連結されないよう接続を閉じます。公式接続例に合わせ、COBSフレームはInfoResponseの最大パケット長で分割して送信します。トンネルペイロードは最大メッセージ長を超えないよう拒否します。

プログラムスロットは既存ファイルを読み出してバックアップできません。インストールブロックは指定したスロットを消去・置換することを先に確認し、拒否された場合は送信を行いません。利用者が事前に選択したスロットの中身を確認・保存し、上書きに同意した時だけ実行してください。

## 実装したハブ側の許可コマンド

- `motor.run`、`motor.stop`、`motor.set_duty_cycle`、`motor.run_degrees`、`motor.run_time`、`motor.run_to_position`
- 5×5 LEDの1ピクセル、パターン、全消灯
- 周波数・時間・音量を制限したビープ、音停止、全停止
- ポート名、座標、輝度、速度、角度、時間、周波数などの範囲検証
- 3秒のハートビート喪失後にモーターと音を停止

使用API名と引数は公式LEGO Education教材にある`motor.run`、`motor.run_for_degrees`、`motor.run_for_time`、`motor.run_to_absolute_position`、`motor.stop`、`motor.relative_position`、`light_matrix.set_pixel`、`sound.beep`等を参考にしています。公式教材では`await`を外したモーター命令を並行動作させる例があり、制御プログラムは命令呼び出し後に完了を待たず`started`応答を返します。この応答はAPI呼び出しが例外なく戻ったことを示す設計で、モーターが指定角度に到達したことや実機出力を証明しません。SPIKE Primeの位置通知は別経路です。文字表示は長時間処理が通信監視を遅らせる可能性を排除できないため、今回の許可コマンドに含めず、SPIKE 3.xでは未対応として明示的なエラーを返します。

SPIKE 3.xでは、停止方法のうち標準の`brake`以外（`coast`/`hold`）、MotorPair駆動、3×3カラーライトマトリクス、旧版のREPL依存機能はこの制御器で未実装です。停止方法の未対応値は命令送信前にエラーにします。その他の未対応ブロックもTunnelMessageへ任意Pythonを送らず失敗します。

## fake環境で実施した検証

- ホスト側: BLE COBS分割writeの再構成、InfoRequest、デバイス通知要求、切断、書き込み失敗、応答タイムアウト
- プログラム転送: スロット確認キャンセル、ClearSlot/StartFileUpload/TransferChunk/ProgramFlowの応答、CRC、転送失敗時に起動しないこと、起動後のバージョン応答
- ハブ側: Python構文、トンネル初期化、許可コマンド、引数範囲、API例外の応答、任意Python拒否、順序付きキュー、切断ウォッチドッグ
- 実際のハードウェアAPIはstubで置換しています。fakeの成功はハブ実機での成功を意味しません。

## Hub OS 1.6.62で未確認の事項

1. `hub.config["module_tunnel"]`とその`callback()`、`send()`が当該ファームウェアで公開されているか。
2. 転送後に独自Pythonプログラムを起動できるか、プログラムがトンネルを受け付ける状態で継続するか。
3. `motor.run_for_time`、`light_matrix.set_pixel`、`sound.beep`の実機結果と、通信応答のタイミング。
4. BLE切断後にハブ側runloopが継続し、3秒ウォッチドッグが停止処理を行うか。
5. スロット選択・保存・起動時の既存ユーザープログラムとの実機上の挙動。
6. USB経路。この変更のインストールと制御はWeb Bluetooth GATTのみを対象とします。
7. `motor.run_*`系の非同期APIをawaitせず開始する動作、および制御プログラム内の停止・ウォッチドッグとの同時実行。
8. `started`応答はAPI呼び出しの受付を示すだけで、物理動作の完了や角度到達は保証しないこと。角度は既存のBLEモーター通知で別途確認する必要があります。

## 実機を後日検証するときの手順

**この手順は現時点で実行しません。ユーザーが別途実機試験を明示的に許可するまで、接続中でも命令・転送を送らないでください。** 以前「命令送信でハブ停止」の報告があるため、停止・無応答が起きた場合は以降を行いません。

1. 作業を保存し、車体を持ち上げ、モーターを無負荷にし、周囲に人や障害物がない状態にする。ハブOSが1.6.62であることを確認し、更新・書換えはしない。
2. SPIKE Prime拡張を開発版として読み込み、通信診断でWeb Bluetooth接続とFirmware 1.6.62を確認する。診断用InfoRequestとセンサー通知は出力命令・プログラム転送と別の受信購読である。
3. 転送前にユーザーが使用可能なスロットを選ぶ。既存プログラムがあるスロットは使わず、保存できない既存内容を失わないようにする。インストール確認画面で対象スロット番号を照合し、異なる番号ならキャンセルする。
4. インストール／起動は一度だけ行い、`bw-spike-1`応答が診断で確認できるかを見る。タイムアウト、停止、切断が発生した場合はLED・音・モーター試験へ進まず、その場で終了する。繰り返し転送しない。
5. 応答が確認できた場合だけ、5×5表示の1ピクセル点灯・消灯を行う。各命令の応答を確認し、問題があれば終了する。
6. 次に短い低音量ビープを1回行う。応答しない、予期しない停止が起きる場合は終了する。
7. モーター試験は機構から外すか無負荷で行い、速度を5%程度に抑えた短い回転要求を一度だけ送る。次に停止命令を一度送る。停止応答が得られなければ再試行せず、ハブへの命令を止める。
8. 低速の指定角度回転を一度だけ試し、停止後に診断の角度通知で角度変化を確認する。角度が更新されない場合に追加駆動しない。
9. 異常時は時刻、実行直前のブロック、通信診断JSONを保存する。再接続や電源操作を繰り返さず、以後の試験を中止する。

実機試験は、ハブの挙動に詳しい利用者が安全に監視できる状態で、段階ごとに行ってください。今回の変更・テスト実行中、実機への接続、転送、モーター駆動、LED、音、ファームウェア操作はしていません。

## 仕様・APIの根拠

- [LEGO SPIKE Prime BLEメッセージ仕様](https://lego.github.io/spike-prime-docs/messages.html)：`0x32`の構造、InfoResponse、ファイル転送、起動、通知メッセージ。
- [LEGO SPIKE Prime接続手順](https://lego.github.io/spike-prime-docs/connect.html)：最大パケット長でのGATT write分割、最大チャンク長、CRC付きチャンク応答。
- [LEGO公式Pythonアップロード例](https://github.com/LEGO/spike-prime-docs/blob/main/examples/python/app.py)：ClearSlot、StartFileUpload、TransferChunk、ProgramFlowの順序と応答確認。
- [LEGO Educationモーター教材](https://education.lego.com/en-us/lessons/get-moving-with-motors/making-moves-with-motors/)および[音教材](https://education.lego.com/en-us/lessons/prime-python-communicating-ideas/communicating-with-sound/)：SPIKE 3 Python API名・使用例。モーター教材では`await`を外した2台の命令を同時に開始する例も説明しています。
- [LEGO Education SPIKE Prime Python programs (Feb. 2024)](https://assets.education.lego.com/v3/assets/blt293eea581807678a/blt02bcbffa2bf460b5/65df44a50f1d35dffdca4995/EN-US-SPIKE-Prime-Python-Programs_Feb-2024.pdf?locale=en-us)：`motor.set_duty_cycle`を含む教材コード。
- `hub.config["module_tunnel"]`は[第三者の実装例](https://raw.githubusercontent.com/edcheng1010/solaria-appinventor-spike-prime/main/src/resources/hub_controller.py)だけを根拠とし、LEGO公式APIやHub OS 1.6.62対応の証拠として扱っていません。

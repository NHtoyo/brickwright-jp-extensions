# SPIKE Prime 起動停止の再調査

## 今回の実測から分かる範囲

- 9,396バイトは現在の`SPIKE3_CONTROLLER_SOURCE`をUTF-8で符号化したサイズと一致する。
- チャンク応答と成功ステータスの`ProgramFlowResponse`は転送・起動要求の受理を示す。Pythonのロードや継続実行の成功は示さない。
- 起動要求の16ms後にstop通知のみ、BLE切断なしという記録は、要求後にプログラムが停止状態になったことを示す。停止理由やPythonのどの行まで実行したかは含まれない。
- 現在の埋め込みソースはCPython 3.13の`ast.parse`で構文解析できた。これはHub OS内のPythonパーサーやAPIの実行互換性を証明しない。
- 現行ソースのimport一覧は`legospike_turbowarp_transpile.js`の1709–1735行、Tunnelの取得と初期化は1736–1741行・1930–1950行、runloopエントリーポイントは1953–1964行。

## 起動停止との因果関係

現行ソースは`hub.config["module_tunnel"]`取得失敗や`callback`登録失敗を`_main`内で捕捉し、1秒ごとの待機を続ける構造である（1930–1950行）。そのため、Tunnelキーの欠落だけでは、観測された即時stopを説明できない。実機でrunloopが継続する前提が成立しているか、起動前の構文・モジュールロード・トップレベルimportで停止したかが先に切り分け対象となる。

公式のBLE仕様では`ProgramFlowResponse`は応答ステータス、`ProgramFlowNotification`はStart/Stopの通知であり、Python例外の理由は含まれない。したがって、stop通知だけから「構文エラー」「import失敗」「正常終了」のいずれかに決め打ちできない。

LEGO公式Python例は、ハブ側プログラムから`print()`を呼び、BLEクライアント側は`0x21 ConsoleNotification`を受け取る実装になっている。これはConsoleNotificationが使える根拠だが、今回のHub OS 1.6.62で、どの実行経路でも`print()`が必ず通知される保証までは公開仕様で確認できない。0件という結果はエラーがなかった証拠ではなく、現時点では「実行前に止まった」と「実行したがstdout通知を取得できなかった」を区別しない。

LEGO Educationの公開Python例は`import motor`、`import runloop`、`from hub import port, light_matrix, sound`および`runloop.run(main())`の使用例を示す。`hub`と`time`の個別import、`json`/`ujson`、特定ファームウェアでの`hub.config["module_tunnel"]`登録条件は、その資料だけでは確定できない。Tunnel APIはLEGO公式BLE仕様に定義されたPython APIではない。第三者実装には同じ`module_tunnel`/`callback`方式があるが、それはHub OS 1.6.62に対する公式保証や今回のプログラムの実行証明ではない。

## 後日、明示許可を得て行う最小切り分け

次の3つはすべて無限待機するプログラムで、LED、モーター、音、`print()`、Tunnelデータ送信を行わない。各段階は前段が成功した場合だけ行う。既存スロットを消去する必要がある場合は中止し、空きスロットをユーザーが確認して明示許可するまでは転送しない。スロット19は再使用しない。

1. `fixtures/spikeprime-startup-00-runloop.py` — `runloop`だけをimportし、公式のrunloop形式で待機する。ここで即時stopなら、現在の制御ロジックやTunnel処理より前の実行基盤が原因候補となる。
2. `fixtures/spikeprime-startup-01-public-imports.py` — 現行ソースの標準Hub API import、JSON fallback、port参照を加える。1が継続し2がstopなら、API import/解決を原因範囲として個々のimportに分解できる。
3. `fixtures/spikeprime-startup-02-tunnel-registration.py` — `hub.config`からの取得と`callback`登録だけを加える。2が継続し3がstopなら、Tunnelの設定または登録APIが原因範囲となる。

判定はstop通知と一定時間stopがないことを使い、ConsoleNotificationを前提にしない。各プログラムを実行した証明には実機のStart/Stop通知が必要であり、今回これらの転送・実行はしていない。

## 今回未確定の点

- Hub OS 1.6.62の実行環境でのMicroPythonパーサーによる9,396バイト全体のコンパイル結果。
- 起動前後どこでstopしたか。今回のログにはPython tracebackや段階ログがない。
- Hub OS 1.6.62での`hub.config["module_tunnel"]`の存在条件、`callback`の初期化条件、およびstdoutと`0x21`通知の厳密な対応。
- 上記最小プローブの実機結果。転送・起動にはユーザーの後日の明示許可が必要。

## 今回実施していないこと

ハブへの接続、スロット19の参照・消去・転送・起動、モーター・LED・音の操作、ファームウェア操作は行っていない。実機上で確認していない事項を成功扱いしていない。

## 参照資料

- [LEGO公式Python BLE転送・起動例](https://github.com/LEGO/spike-prime-docs/blob/main/examples/python/app.py)
- [LEGO公式SPIKE Primeメッセージ定義](https://lego.github.io/spike-prime-docs/messages.html)
- [LEGO公式SPIKE Prime Python教材](https://assets.education.lego.com/v3/assets/blt293eea581807678a/blt02bcbffa2bf460b5/65df44a50f1d35dffdca4995/EN-US-SPIKE-Prime-Python-Programs_Feb-2024.pdf?locale=en-us)
- [第三者のSPIKE Prime Web Bluetooth実装](https://github.com/edcheng1010/solaria-scratch-spike-prime/blob/main/extension.js)（同実装は`module_tunnel`と同期的な常駐ループを使う。公式資料ではなく、当該ファームウェアの独立検証ではない）
- [第三者のHubOS 3 BLE SDK](https://github.com/dixonSolutions/SpikePrimePythonSDK)（公開READMEはHubOS 3でテストしたと記載。Hub OS 1.6.62の保証ではない）

# SPIKE Prime 109 opcode 日本語表示・用語照合監査

基準コミット: `e29421a`

## 集計

- 対象 opcode: 109
- 英語ラベルあり: 109
- 日本語ラベルあり: 109
- 今回の訳語変更: 10
- Brickwright固有の管理・開発連携として分類: 37
- 公式UIにカテゴリはあるが、個別機能・値・動作は未照合: 72
- ユーザー提供の用語・表示例と照合した opcode: 7
- ユーザー提供例の文言をそのまま採用: 6
- 動作差を明示するため意味を保って調整: 1
- 7件の表示例について、対応opcodeと実装上の動作を確認: 7
- LEGO Education SPIKE 3.6.1の個別ブロック文言を画面で照合した件数: 0 / 109
- 個別の公式文言との一致を未確認として記録: 109

SPIKE 3.6.1 はこのPCのインストール済みアプリ情報と起動ウィンドウのタイトルで確認した。UIのアクセシビリティ表示ではカテゴリ名「モーター」「移動」「ライト」「音」「イベント」「制御」「センサー」「演算」「変数」「マイブロック」を確認したが、個々のブロック文言の全件照合はしていない。そのため、以下の各行を公式訳と一致すると主張しない。機能差があるブロックは公式アプリに一対一対応するという前提を置かず、未照合に分類する。

ユーザーから提示された7件の日本語表示例は書き起こしとして照合した。6件は対応ブロックの動作と入力が一致するため同じ文言を採用し、「[PORT] 位置」だけは、Essentialの値がmode 2 POS（累積相対角度）でAPOSではないことを明確にするため「[PORT] の回転位置（度）」に調整した。この7件をLEGO公式SPIKEアプリの実画面で個別確認したという意味ではない。公式API・プロトコル資料は動作・値の意味の確認に用い、UI文言の根拠とは分ける。

## 参照元の区別

- ユーザー提供の表示例: 下表に「ユーザー提供の書き起こし」と明示。画面上の完全一致は独立確認していない。
- LEGO一次資料: [SPIKE Prime Hub API](https://lego.github.io/MINDSTORMS-Robot-Inventor-hub-API/) と [LEGO Wireless Protocol](https://lego.github.io/lego-ble-wireless-protocol-docs/) を該当するハードウェア機能・値の意味の参考にした。109 opcodeの全機能を個別に一次資料で確認したという主張ではなく、これらの資料は日本語ブロック文字列の根拠でもない。
- 公式アプリ個別UI照合: 現在0/109。未確認の文言を公式訳として扱わない。

## opcode別ラベル

| Opcode | 英語ラベル | 変更前の日本語 | 現在の日本語 | 今回の変更 | 機能比較 | ユーザー提供例との対応 | LEGO公式アプリ3.6.1個別UI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| connectHub | connect to hub | ハブに接続 | ハブに接続 | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| connectHubAt | connect to bridge at [URL] | ブリッジに接続 [URL] | ブリッジに接続 [URL] | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| disconnectHub | disconnect | 切断 | 切断 | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| isConnected | connected? | 接続中？ | 接続中？ | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| getHubType | hub type | ハブの種類 | ハブの種類 | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| getFirmwareVersion | hub firmware version | ハブのファームウェアバージョン | ハブのファームウェアバージョン | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| getConnectionMode | connection mode | 接続モード | 接続モード | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| getCommunicationDiagnostics | communication diagnostics (JSON) | 通信診断（JSON） | 通信診断（JSON） | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| getCommunicationDiagnosticsSummary | communication diagnostics (text) | 通信診断（表示用） | 通信診断（表示用） | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| openCommunicationDiagnosticsLog | open communication diagnostics log | 通信診断ログを開く | 通信診断ログを開く | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| runStartupProbe | run SPIKE startup probe [PROBE] in slot [SLOT] | SPIKE起動プローブ[PROBE]をスロット[SLOT]で実行 | SPIKE起動プローブ[PROBE]をスロット[SLOT]で実行 | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| installHubController | install / start Brickwright controller in slot [SLOT] | スロット [SLOT] にBrickwright制御プログラムを転送して起動 | スロット [SLOT] にBrickwright制御プログラムを転送して起動 | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| checkHubController | check Brickwright controller response | Brickwright制御プログラムの応答を確認 | Brickwright制御プログラムの応答を確認 | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| setConnectionMode | set connection mode to [MODE] | 接続モードを [MODE] にする | 接続モードを [MODE] にする | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| enableStreamingMode | enable streaming mode | センサー通知を有効にする | センサー通知を有効にする | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| disableStreamingMode | disable streaming mode | センサー通知を無効にする | センサー通知を無効にする | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| transpileProject | transpile project to SPIKE Python | プロジェクトをSPIKE Pythonコードに変換する | プロジェクトをSPIKE Pythonコードに変換する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| showCode | show generated code | 生成したコードを表示する | 生成したコードを表示する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| downloadCode | download as .py file | Pythonファイル（.py）としてダウンロードする | Pythonファイル（.py）としてダウンロードする | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| getTranspiledCode | transpiled code | 変換後のコード | 変換後のコード | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| uploadScriptToHub | upload script [NAME] to slot [SLOT] | スクリプト [NAME] をスロット [SLOT] に転送する | スクリプト [NAME] をスロット [SLOT] に転送する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| runScriptOnHub | run script [NAME] on hub | ハブ上のスクリプト [NAME] を実行する | ハブ上のスクリプト [NAME] を実行する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| renameScriptOnHub | rename Brickwright program [OLD] to [NEW] | Brickwrightのプログラム名 [OLD] を [NEW] に変更する | Brickwrightのプログラム名 [OLD] を [NEW] に変更する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| deleteScriptOnHub | delete script [NAME] from hub | Brickwrightのプログラム [NAME] をハブから削除する | Brickwrightのプログラム [NAME] をハブから削除する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| listScriptsOnHub | list Brickwright-managed programs | Brickwrightが管理するプログラムの一覧 | Brickwrightが管理するプログラムの一覧 | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| stopRunningScript | stop currently running script | 実行中のスクリプトを停止する | 実行中のスクリプトを停止する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| setMovementMotors | set movement motors [PORT_A] and [PORT_B], wheel circumference [WHEEL_CIRCUMFERENCE_CM] cm | 移動用モーターを [PORT_A] と [PORT_B]、車輪の周長を [WHEEL_CIRCUMFERENCE_CM] cm に設定する | 移動用モーターを [PORT_A] と [PORT_B]、車輪の周長を [WHEEL_CIRCUMFERENCE_CM] cm に設定する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| moveForward | move [DIRECTION] for [VALUE] [UNIT] | [DIRECTION] に [VALUE] [UNIT] 進む | [DIRECTION] に [VALUE] [UNIT] 進む | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| steer | start steering [STEERING] | ステアリング [STEERING] で動かす | ステアリング [STEERING] で動かす | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| motorPairMove | start steering [STEERING] speed [SPEED]% | ステアリング [STEERING]、速さ [SPEED]% で動かす | ステアリング [STEERING]、速さ [SPEED]% で動かす | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| startTank | start tank drive left [LEFT_SPEED] right [RIGHT_SPEED] | 左 [LEFT_SPEED]%、右 [RIGHT_SPEED]% の速さで動かす | 左 [LEFT_SPEED]%、右 [RIGHT_SPEED]% の速さで動かす | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| setMovementSpeed | set movement speed to [SPEED]% | 移動速度を [SPEED]% に設定する | 移動速度を [SPEED]% に設定する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| stopMovement | stop movement | 移動を停止する | 移動を停止する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| motorRunFor | [PORT] run [DIRECTION] for [VALUE] [UNIT] | [PORT] のモーターを [DIRECTION] に [VALUE] [UNIT] 動かす | [PORT] のモーターを [DIRECTION] に [VALUE] [UNIT] 動かす | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| motorRunToPosition | [PORT] run to position [POSITION] degrees | [PORT] のモーターを位置 [POSITION] 度まで動かす | [PORT] のモーターを位置 [POSITION] 度まで動かす | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| motorStart | [PORT] start motor [DIRECTION] | [PORT] のモーターを [DIRECTION] に回転させる | [PORT] のモーターを [DIRECTION] に回転させる | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| motorStop | [PORT] stop motor | [PORT] のモーターを止める | [PORT] のモーターを停止する | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | ユーザー提供の書き起こし「[PORT] のモーターを停止する」; ユーザー提供例と同じ文言を採用。scratch.motor_stopを呼び、選択ポートのモーターを現在の停止設定で止める。stopMotorのように停止方法を引数で選ぶブロックとは区別する。 | 個別画面・表示文言の照合なし |
| startMotor | start motor [PORT] at [SPEED]% | モーター [PORT] を [SPEED]% の回転速度で動かす | モーター [PORT] を [SPEED]% の回転速度で動かす | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| stopMotor | stop motor [PORT] with [ACTION] | モーター [PORT] を [ACTION] で止める | モーター [PORT] を [ACTION] で止める | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| motorSetSpeed | [PORT] set speed to [SPEED] % | [PORT] モーターの回転速度を [SPEED]% に設定する | [PORT] のスピードを [SPEED] % にする | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | ユーザー提供の書き起こし「[PORT] のスピードを [SPEED] % にする」; ユーザー提供例と同じ文言を採用。選択ポートの次回以降のモーター動作に使う速度設定を更新する。このブロック単独ではモーターを起動しない。 | 個別画面・表示文言の照合なし |
| motorStartPower | [PORT] start motor at [POWER] % power | [PORT] のモーターを出力 [POWER]% で回転させる | [PORT] のモーターを出力 [POWER]% で回転させる | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| motorSetStopAction | [PORT] set stop action to [ACTION] | [PORT] モーターの停止方法を [ACTION] にする | [PORT] モーターの停止方法を [ACTION] にする | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getPosition | [PORT] position | [PORT] モーターの位置（度） | [PORT] の回転位置（度） | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | ユーザー提供の書き起こし「[PORT] 位置」; 回転角度と単位を明確にするため意味を保って言い換え。Primeは既存実装のposition値、Essentialはmode 2 POSの累積相対角度を返す。EssentialではAPOS（絶対角度）を返すわけではないため、『[PORT] の回転位置（度）』とした。 | 個別画面・表示文言の照合なし |
| getRelativePosition | [PORT] relative position | [PORT] モーターの相対位置（度） | [PORT] モーターの相対角度（度） | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getAbsolutePosition | [PORT] absolute position | [PORT] モーターの絶対位置（度） | [PORT] モーターの絶対角度（度） | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getSpeed | [PORT] speed (deg/s) | [PORT] モーターの回転速度（度/秒） | [PORT] モーターの回転速度（度/秒） | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| resetMotorPosition | reset [PORT] motor position to [POSITION] | [PORT] モーターの位置を [POSITION] 度に設定する | [PORT] モーターの角度を [POSITION] 度に設定する | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| displayText | write [TEXT] | ハブに [TEXT] と表示する | ハブに [TEXT] と表示する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| displayImage | turn on [MATRIX] | ハブのLEDライトマトリクスに [MATRIX] を表示する | ハブのLEDライトマトリクスに [MATRIX] を表示する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| displayPattern | display pattern [PATTERN] | ハブのLEDライトマトリクスにパターン [PATTERN] を表示する | ハブのLEDライトマトリクスにパターン [PATTERN] を表示する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| displayClear | turn off pixels | ハブのLEDライトマトリクスを消灯する | ハブのLEDライトマトリクスを消灯する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| displayShowImage | show built-in image [IMAGE] | ハブのLEDライトマトリクスに画像 [IMAGE] を表示する | ハブのLEDライトマトリクスに画像 [IMAGE] を表示する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| setPixel | set pixel [X] [Y] to [BRIGHTNESS] % | ハブのLEDライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする | ハブのLEDライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| rotateDisplay | rotate display [ANGLE] degrees | ハブのLEDライトマトリクスを [ANGLE] 度回転する | ハブのLEDライトマトリクスを [ANGLE] 度回転する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| setCenterButtonColor | set center button to [COLOR] | ハブ中央のボタンを [COLOR] に光らせる | ハブ中央のボタンを [COLOR] に光らせる | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getAngle | [AXIS] angle | [AXIS] の角度 | [AXIS] の角度 | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getGyroRate | gyro rate [AXIS] (deg/s) | [AXIS] のジャイロ角速度（度/秒） | [AXIS] のジャイロ角速度（度/秒） | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getFilteredGyroRate | filtered gyro rate [AXIS] (deg/s) | [AXIS] のフィルター済みジャイロ角速度（度/秒） | [AXIS] のフィルター済みジャイロ角速度（度/秒） | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getAcceleration | acceleration [AXIS] (milli-g) | [AXIS] の加速度（ミリg） | [AXIS] の加速度（ミリg） | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getFilteredAcceleration | filtered acceleration [AXIS] (milli-g) | [AXIS] のフィルター済み加速度（ミリg） | [AXIS] のフィルター済み加速度（ミリg） | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| resetYaw | reset yaw angle | Yaw角を0にする | ヨー角を0に設定 | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | ユーザー提供の書き起こし「ヨー角を0に設定」; ユーザー提供例と同じ文言を採用。Primeのyawを0に設定する。SPIKE Essentialはyaw機能に非対応。 | 個別画面・表示文言の照合なし |
| presetYaw | preset yaw to [ANGLE] degrees | Yaw角を [ANGLE] 度に設定する | Yaw角を [ANGLE] 度に設定する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| setMatrix3x3ColorGrid | set [PORT] 3x3 colors: [P1][P2][P3] [P4][P5][P6] [P7][P8][P9] | [PORT] のカラー・ライトマトリクスを色設定する：[P1][P2][P3] [P4][P5][P6] [P7][P8][P9] | [PORT] のカラー・ライトマトリクスを色設定する：[P1][P2][P3] [P4][P5][P6] [P7][P8][P9] | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| setMatrix3x3Custom | set [PORT] 3x3 custom pattern [PATTERN] | [PORT] のカラー・ライトマトリクスにパターン [PATTERN] を表示する | [PORT] のカラー・ライトマトリクスにパターン [PATTERN] を表示する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| setMatrix3x3SolidColor | set [PORT] 3x3 matrix all [COLOR] brightness [BRIGHTNESS] | [PORT] のカラー・ライトマトリクスを [COLOR]、明るさ [BRIGHTNESS] にする | [PORT] のカラー・ライトマトリクスを [COLOR]、明るさ [BRIGHTNESS] にする | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| clearMatrix3x3 | clear [PORT] 3x3 matrix | [PORT] のカラー・ライトマトリクスを消灯する | [PORT] のカラー・ライトマトリクスを消灯する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| setLightMatrixPixel | set 3x3 light [PORT] pixel x:[X] y:[Y] brightness [BRIGHTNESS]% | [PORT] のカラー・ライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする | [PORT] のカラー・ライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| whenGesture | when hub [GESTURE] | ハブが [GESTURE] したとき | ハブが [GESTURE] したとき | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| isGesture | hub [GESTURE]? | ハブは [GESTURE] していますか？ | ハブは [GESTURE] していますか？ | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getOrientation | orientation | ハブの向き | ハブの向き | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getFaceUp | hub face up | ハブの上向き面 | ハブの上向き面 | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| playHubSound | play hub sound [SOUND] | ハブのサウンド [SOUND] を再生する | ハブのサウンド [SOUND] を再生する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| playBeep | beep [FREQUENCY] Hz for [DURATION] ms | [FREQUENCY] Hz の音を [DURATION] ms 鳴らす | [FREQUENCY] Hz の音を [DURATION] ms 鳴らす | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| playNote | play note [NOTE] for [SECS] seconds | 音符 [NOTE] を [SECS] 秒鳴らす | 音符 [NOTE] を [SECS] 秒鳴らす | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| playWaveBeep | beep [WAVEFORM] [FREQUENCY] Hz for [DURATION] ms | [WAVEFORM] 波形の [FREQUENCY] Hz の音を [DURATION] ms 鳴らす | [WAVEFORM] 波形の [FREQUENCY] Hz の音を [DURATION] ms 鳴らす | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| setVolume | set volume to [VOLUME]% | 音量を [VOLUME]% に設定する | 音量を [VOLUME] % にする | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | ユーザー提供の書き起こし「音量を [VOLUME] % にする」; ユーザー提供例と同じ文言を採用。ハブ音量設定を更新する。SPIKE Essentialでは音機能が非対応で、エラーに分類される。 | 個別画面・表示文言の照合なし |
| stopSound | stop all sounds | すべての音を止める | すべての音を止める | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getBatteryLevel | battery level % | バッテリー残量（%） | バッテリー残量（%） | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getBatteryTemperature | battery temperature | バッテリーの温度 | バッテリーの温度 | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getHubTemperature | hub temperature | ハブの温度 | ハブの温度 | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getHubCurrent | hub current (mA) | ハブの電流（mA） | ハブの電流（mA） | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getHubVoltage | hub voltage (mV) | ハブの電圧（mV） | ハブの電圧（mV） | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getTimer | timer | タイマーの値 | タイマー | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | ユーザー提供の書き起こし「タイマー」; ユーザー提供例と同じ文言を採用。拡張側で計測するリセット後の経過時間（秒）を返す。 | 個別画面・表示文言の照合なし |
| resetTimer | reset timer | タイマーをリセットする | タイマーリセット | 訳語改善 | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | ユーザー提供の書き起こし「タイマーリセット」; ユーザー提供例と同じ文言を採用。拡張側のタイマー開始時刻と経過値をリセットする。 | 個別画面・表示文言の照合なし |
| getDistance | [PORT] distance | [PORT] の距離 | [PORT] の距離 | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getDistanceIn | [PORT] distance in [UNIT] | [PORT] の距離（[UNIT]） | [PORT] の距離（[UNIT]） | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| setDistanceLights | set [PORT] distance lights [TL] [TR] [BL] [BR] | [PORT] の距離センサーのライトを [TL] [TR] [BL] [BR] に設定する | [PORT] の距離センサーのライトを [TL] [TR] [BL] [BR] に設定する | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getColor | [PORT] color | [PORT] の色 | [PORT] の色 | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getReflection | [PORT] reflection | [PORT] の反射光 | [PORT] の反射光 | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getAmbientLight | [PORT] ambient light | [PORT] の周囲の明るさ | [PORT] の周囲の明るさ | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getColorRGB | [PORT] raw [CHANNEL] | [PORT] の生の [CHANNEL] 値 | [PORT] の生の [CHANNEL] 値 | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| getForce | [PORT] force | [PORT] のフォースセンサーの値 | [PORT] のフォースセンサーの値 | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| isForceSensorPressed | [PORT] force sensor pressed? | [PORT] のフォースセンサーは押されていますか？ | [PORT] のフォースセンサーは押されていますか？ | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| whenColor | when [PORT] sees [COLOR] | [PORT] が [COLOR] を検出したとき | [PORT] が [COLOR] を検出したとき | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| isColor | [PORT] sees [COLOR]? | [PORT] は [COLOR] を検出していますか？ | [PORT] は [COLOR] を検出していますか？ | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| whenForceSensor | when [PORT] is [STATE] | [PORT] が [STATE] のとき | [PORT] が [STATE] のとき | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| isButtonPressed | [BUTTON] button pressed? | [BUTTON] ボタンは押されていますか？ | [BUTTON] ボタンは押されていますか？ | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| whenButtonPressed | when [BUTTON] button pressed | [BUTTON] ボタンが押されたとき | [BUTTON] ボタンが押されたとき | 変更なし | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合 | 該当例なし | 個別画面・表示文言の照合なし |
| writeLogFile | append [TEXT] to log file [FILENAME] | [TEXT] をログファイル [FILENAME] に追加する | [TEXT] をログファイル [FILENAME] に追加する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| readLogFile | read log file [FILENAME] | ログファイル [FILENAME] を読み込む | ログファイル [FILENAME] を読み込む | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| deleteLogFile | delete file [FILENAME] | ファイル [FILENAME] を削除する | ファイル [FILENAME] を削除する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| listFiles | list files | ファイル一覧を表示する | ファイル一覧を表示する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| runReplCommand | run Python REPL: [CODE] | Python REPLで実行：[CODE] | Python REPLで実行：[CODE] | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| getReplOutput | REPL output | REPLの出力 | REPLの出力 | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| clearReplOutput | clear REPL output | REPLの出力を消去する | REPLの出力を消去する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| getReplHistory | REPL command [INDEX] | REPLの [INDEX] 番目のコマンド | REPLの [INDEX] 番目のコマンド | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| runPythonCommand | run Python: [CODE] | Pythonを実行：[CODE] | Pythonを実行：[CODE] | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| runHubCommand | run hub command: [CODE] | ハブのコマンドを実行：[CODE] | ハブのコマンドを実行：[CODE] | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |
| exitScript | exit Python script | Pythonスクリプトを終了する | Pythonスクリプトを終了する | 変更なし | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない | 該当例なし | 個別画面・表示文言の照合なし |

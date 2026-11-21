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
- LEGO Education SPIKE 3.6.1アプリ資産の個別照合: exact 4, partial 2, help-only 1
- アプリ資産のopcode別照合が未完了: 102 / 109
- 公式アプリ全109ブロックとの一括照合は未実施

SPIKE 3.6.1はインストール済みアプリのファイル版で確認した。日本語UIの根拠にはC:\Program Files\SPIKE\LEGO Education SPIKE.dll に埋め込まれた ja-jp のヘルプページと描画済みBlockly SVGを読み取り専用で確認した。これは特定バージョンの内部データであり、公開された安定API・翻訳カタログではない。全109件を照合できる正規のローカライズ資産があるとは確認できていない。

ユーザーから提示された7件の日本語表示例は書き起こしとして照合した。6件は同じ文言を採用し、「[PORT] 位置」だけは、Essentialの値がmode 2 POS（累積相対角度）でAPOSではないことを明確にするため「[PORT] の回転位置（度）」に調整した。公式アプリ資産で直接表示を確認できた例とヘルプページだけ確認できた例を、下表で分けた。ユーザー提供の書き起こしとアプリに描画されたラベルは別の根拠として記録し、標準アプリのブロックとBrickwrightのハブ向け命令で対象や挙動が違う場合は機能差を記載する。

## 参照元の区別

- ユーザー提供の表示例: 下表に「ユーザー提供の書き起こし」と明示。画面上の完全一致は独立確認していない。
- LEGO一次資料: [SPIKE Prime Hub API](https://lego.github.io/MINDSTORMS-Robot-Inventor-hub-API/) と [LEGO Wireless Protocol](https://lego.github.io/lego-ble-wireless-protocol-docs/) を該当するハードウェア機能・値の意味の参考にした。109 opcodeの全機能を個別に一次資料で確認したという主張ではなく、これらの資料は日本語ブロック文字列の根拠でもない。
- 内部ヘルプID: 調査時にflipper...形式の項目を89件検出したが、109 opcodeとの全件クロスウォークは未実施。この件数を照合数として扱わない。
- SPIKE 3.6.1アプリ資産: 7件を個別に確認（exact 4, partial 2, help-only 1）。他の102 opcodeは今回の資産との対応が未照合で、公式訳とは扱わない。

## opcode別ラベル

| Opcode | 英語ラベル | 変更前の日本語 | 現在の日本語 | 今回の変更 | ユーザー提供例との対応 | 公式3.6.1資産ID・証拠 | 動作の一致・差異 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| connectHub | connect to hub | ハブに接続 | ハブに接続 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| connectHubAt | connect to bridge at [URL] | ブリッジに接続 [URL] | ブリッジに接続 [URL] | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| disconnectHub | disconnect | 切断 | 切断 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| isConnected | connected? | 接続中？ | 接続中？ | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| getHubType | hub type | ハブの種類 | ハブの種類 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| getFirmwareVersion | hub firmware version | ハブのファームウェアバージョン | ハブのファームウェアバージョン | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| getConnectionMode | connection mode | 接続モード | 接続モード | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| getCommunicationDiagnostics | communication diagnostics (JSON) | 通信診断（JSON） | 通信診断（JSON） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| getCommunicationDiagnosticsSummary | communication diagnostics (text) | 通信診断（表示用） | 通信診断（表示用） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| openCommunicationDiagnosticsLog | open communication diagnostics log | 通信診断ログを開く | 通信診断ログを開く | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| runStartupProbe | run SPIKE startup probe [PROBE] in slot [SLOT] | SPIKE起動プローブ[PROBE]をスロット[SLOT]で実行 | SPIKE起動プローブ[PROBE]をスロット[SLOT]で実行 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| installHubController | install / start Brickwright controller in slot [SLOT] | スロット [SLOT] にBrickwright制御プログラムを転送して起動 | スロット [SLOT] にBrickwright制御プログラムを転送して起動 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| checkHubController | check Brickwright controller response | Brickwright制御プログラムの応答を確認 | Brickwright制御プログラムの応答を確認 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| setConnectionMode | set connection mode to [MODE] | 接続モードを [MODE] にする | 接続モードを [MODE] にする | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| enableStreamingMode | enable streaming mode | センサー通知を有効にする | センサー通知を有効にする | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| disableStreamingMode | disable streaming mode | センサー通知を無効にする | センサー通知を無効にする | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| transpileProject | transpile project to SPIKE Python | プロジェクトをSPIKE Pythonコードに変換する | プロジェクトをSPIKE Pythonコードに変換する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| showCode | show generated code | 生成したコードを表示する | 生成したコードを表示する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| downloadCode | download as .py file | Pythonファイル（.py）としてダウンロードする | Pythonファイル（.py）としてダウンロードする | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| getTranspiledCode | transpiled code | 変換後のコード | 変換後のコード | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| uploadScriptToHub | upload script [NAME] to slot [SLOT] | スクリプト [NAME] をスロット [SLOT] に転送する | スクリプト [NAME] をスロット [SLOT] に転送する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| runScriptOnHub | run script [NAME] on hub | ハブ上のスクリプト [NAME] を実行する | ハブ上のスクリプト [NAME] を実行する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| renameScriptOnHub | rename Brickwright program [OLD] to [NEW] | Brickwrightのプログラム名 [OLD] を [NEW] に変更する | Brickwrightのプログラム名 [OLD] を [NEW] に変更する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| deleteScriptOnHub | delete script [NAME] from hub | Brickwrightのプログラム [NAME] をハブから削除する | Brickwrightのプログラム [NAME] をハブから削除する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| listScriptsOnHub | list Brickwright-managed programs | Brickwrightが管理するプログラムの一覧 | Brickwrightが管理するプログラムの一覧 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| stopRunningScript | stop currently running script | 実行中のスクリプトを停止する | 実行中のスクリプトを停止する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| setMovementMotors | set movement motors [PORT_A] and [PORT_B], wheel circumference [WHEEL_CIRCUMFERENCE_CM] cm | 移動用モーターを [PORT_A] と [PORT_B]、車輪の周長を [WHEEL_CIRCUMFERENCE_CM] cm に設定する | 移動用モーターを [PORT_A] と [PORT_B]、車輪の周長を [WHEEL_CIRCUMFERENCE_CM] cm に設定する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| moveForward | move [DIRECTION] for [VALUE] [UNIT] | [DIRECTION] に [VALUE] [UNIT] 進む | [DIRECTION] に [VALUE] [UNIT] 進む | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| steer | start steering [STEERING] | ステアリング [STEERING] で動かす | ステアリング [STEERING] で動かす | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| motorPairMove | start steering [STEERING] speed [SPEED]% | ステアリング [STEERING]、速さ [SPEED]% で動かす | ステアリング [STEERING]、速さ [SPEED]% で動かす | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| startTank | start tank drive left [LEFT_SPEED] right [RIGHT_SPEED] | 左 [LEFT_SPEED]%、右 [RIGHT_SPEED]% の速さで動かす | 左 [LEFT_SPEED]%、右 [RIGHT_SPEED]% の速さで動かす | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| setMovementSpeed | set movement speed to [SPEED]% | 移動速度を [SPEED]% に設定する | 移動速度を [SPEED]% に設定する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| stopMovement | stop movement | 移動を停止する | 移動を停止する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| motorRunFor | [PORT] run [DIRECTION] for [VALUE] [UNIT] | [PORT] のモーターを [DIRECTION] に [VALUE] [UNIT] 動かす | [PORT] のモーターを [DIRECTION] に [VALUE] [UNIT] 動かす | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| motorRunToPosition | [PORT] run to position [POSITION] degrees | [PORT] のモーターを位置 [POSITION] 度まで動かす | [PORT] のモーターを位置 [POSITION] 度まで動かす | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| motorStart | [PORT] start motor [DIRECTION] | [PORT] のモーターを [DIRECTION] に回転させる | [PORT] のモーターを [DIRECTION] に回転させる | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| motorStop | [PORT] stop motor | [PORT] のモーターを止める | [PORT] のモーターを停止する | 訳語改善 | ユーザー提供の書き起こし「[PORT] のモーターを停止する」; ユーザー提供例と同じ文言を採用。scratch.motor_stopを呼び、選択ポートのモーターを現在の停止設定で止める。stopMotorのように停止方法を引数で選ぶブロックとは区別する。 | flippermotor_motorStop (ja-jp app_page); exact: port dropdown plus rendered Blockly suffix ‘のモーターを停止する’ | Official help describes immediate braking without holding. Brickwright uses the configured stop action (default brake), so behavior differs when configured as coast or hold. |
| startMotor | start motor [PORT] at [SPEED]% | モーター [PORT] を [SPEED]% の回転速度で動かす | モーター [PORT] を [SPEED]% の回転速度で動かす | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| stopMotor | stop motor [PORT] with [ACTION] | モーター [PORT] を [ACTION] で止める | モーター [PORT] を [ACTION] で止める | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| motorSetSpeed | [PORT] set speed to [SPEED] % | [PORT] モーターの回転速度を [SPEED]% に設定する | [PORT] のスピードを [SPEED] % にする | 訳語改善 | ユーザー提供の書き起こし「[PORT] のスピードを [SPEED] % にする」; ユーザー提供例と同じ文言を採用。選択ポートの次回以降のモーター動作に使う速度設定を更新する。このブロック単独ではモーターを起動しない。 | flippermotor_motorSetSpeed (ja-jp app_page); partial: rendered ‘のスピードを’ + ‘％にする’; percentage glyph/spacing differs from the user example; help title ‘モータースピードを＿％にする’ | Both set speed for subsequent motor actions rather than starting the motor in this block. Official help specifies -100..100 and 75% default; Brickwright stores a setting for later motor commands. |
| motorStartPower | [PORT] start motor at [POWER] % power | [PORT] のモーターを出力 [POWER]% で回転させる | [PORT] のモーターを出力 [POWER]% で回転させる | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| motorSetStopAction | [PORT] set stop action to [ACTION] | [PORT] モーターの停止方法を [ACTION] にする | [PORT] モーターの停止方法を [ACTION] にする | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getPosition | [PORT] position | [PORT] モーターの位置（度） | [PORT] の回転位置（度） | 訳語改善 | ユーザー提供の書き起こし「[PORT] 位置」; 回転角度と単位を明確にするため意味を保って言い換え。Primeは既存実装のposition値、Essentialはmode 2 POSの累積相対角度を返す。EssentialではAPOS（絶対角度）を返すわけではないため、『[PORT] の回転位置（度）』とした。 | flippermotor_absolutePosition (ja-jp app_page); help-only: page title ‘モーター位置’; exact rendered block label not established | Official help describes absolute position in 0..359 degrees. Brickwright Prime uses normalized position, but Essential returns cumulative mode-2 POS and has no APOS. The adapted label intentionally does not promise absolute position. |
| getRelativePosition | [PORT] relative position | [PORT] モーターの相対位置（度） | [PORT] モーターの相対角度（度） | 訳語改善 | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getAbsolutePosition | [PORT] absolute position | [PORT] モーターの絶対位置（度） | [PORT] モーターの絶対角度（度） | 訳語改善 | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getSpeed | [PORT] speed (deg/s) | [PORT] モーターの回転速度（度/秒） | [PORT] モーターの回転速度（度/秒） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| resetMotorPosition | reset [PORT] motor position to [POSITION] | [PORT] モーターの位置を [POSITION] 度に設定する | [PORT] モーターの角度を [POSITION] 度に設定する | 訳語改善 | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| displayText | write [TEXT] | ハブに [TEXT] と表示する | ハブに [TEXT] と表示する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| displayImage | turn on [MATRIX] | ハブのLEDライトマトリクスに [MATRIX] を表示する | ハブのLEDライトマトリクスに [MATRIX] を表示する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| displayPattern | display pattern [PATTERN] | ハブのLEDライトマトリクスにパターン [PATTERN] を表示する | ハブのLEDライトマトリクスにパターン [PATTERN] を表示する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| displayClear | turn off pixels | ハブのLEDライトマトリクスを消灯する | ハブのLEDライトマトリクスを消灯する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| displayShowImage | show built-in image [IMAGE] | ハブのLEDライトマトリクスに画像 [IMAGE] を表示する | ハブのLEDライトマトリクスに画像 [IMAGE] を表示する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| setPixel | set pixel [X] [Y] to [BRIGHTNESS] % | ハブのLEDライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする | ハブのLEDライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| rotateDisplay | rotate display [ANGLE] degrees | ハブのLEDライトマトリクスを [ANGLE] 度回転する | ハブのLEDライトマトリクスを [ANGLE] 度回転する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| setCenterButtonColor | set center button to [COLOR] | ハブ中央のボタンを [COLOR] に光らせる | ハブ中央のボタンを [COLOR] に光らせる | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getAngle | [AXIS] angle | [AXIS] の角度 | [AXIS] の角度 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getGyroRate | gyro rate [AXIS] (deg/s) | [AXIS] のジャイロ角速度（度/秒） | [AXIS] のジャイロ角速度（度/秒） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getFilteredGyroRate | filtered gyro rate [AXIS] (deg/s) | [AXIS] のフィルター済みジャイロ角速度（度/秒） | [AXIS] のフィルター済みジャイロ角速度（度/秒） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getAcceleration | acceleration [AXIS] (milli-g) | [AXIS] の加速度（ミリg） | [AXIS] の加速度（ミリg） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getFilteredAcceleration | filtered acceleration [AXIS] (milli-g) | [AXIS] のフィルター済み加速度（ミリg） | [AXIS] のフィルター済み加速度（ミリg） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| resetYaw | reset yaw angle | Yaw角を0にする | ヨー角を0に設定 | 訳語改善 | ユーザー提供の書き起こし「ヨー角を0に設定」; ユーザー提供例と同じ文言を採用。Primeのyawを0に設定する。SPIKE Essentialはyaw機能に非対応。 | flippersensors_resetYaw (ja-jp app_page); exact: rendered Blockly label ‘ヨー角を0に設定’; help title adds ‘ハブの’ | Both set Prime hub yaw to zero; Essential does not implement this capability. |
| presetYaw | preset yaw to [ANGLE] degrees | Yaw角を [ANGLE] 度に設定する | Yaw角を [ANGLE] 度に設定する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| setMatrix3x3ColorGrid | set [PORT] 3x3 colors: [P1][P2][P3] [P4][P5][P6] [P7][P8][P9] | [PORT] のカラー・ライトマトリクスを色設定する：[P1][P2][P3] [P4][P5][P6] [P7][P8][P9] | [PORT] のカラー・ライトマトリクスを色設定する：[P1][P2][P3] [P4][P5][P6] [P7][P8][P9] | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| setMatrix3x3Custom | set [PORT] 3x3 custom pattern [PATTERN] | [PORT] のカラー・ライトマトリクスにパターン [PATTERN] を表示する | [PORT] のカラー・ライトマトリクスにパターン [PATTERN] を表示する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| setMatrix3x3SolidColor | set [PORT] 3x3 matrix all [COLOR] brightness [BRIGHTNESS] | [PORT] のカラー・ライトマトリクスを [COLOR]、明るさ [BRIGHTNESS] にする | [PORT] のカラー・ライトマトリクスを [COLOR]、明るさ [BRIGHTNESS] にする | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| clearMatrix3x3 | clear [PORT] 3x3 matrix | [PORT] のカラー・ライトマトリクスを消灯する | [PORT] のカラー・ライトマトリクスを消灯する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| setLightMatrixPixel | set 3x3 light [PORT] pixel x:[X] y:[Y] brightness [BRIGHTNESS]% | [PORT] のカラー・ライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする | [PORT] のカラー・ライトマトリクスの x:[X] y:[Y] を明るさ [BRIGHTNESS]% にする | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| whenGesture | when hub [GESTURE] | ハブが [GESTURE] したとき | ハブが [GESTURE] したとき | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| isGesture | hub [GESTURE]? | ハブは [GESTURE] していますか？ | ハブは [GESTURE] していますか？ | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getOrientation | orientation | ハブの向き | ハブの向き | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getFaceUp | hub face up | ハブの上向き面 | ハブの上向き面 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| playHubSound | play hub sound [SOUND] | ハブのサウンド [SOUND] を再生する | ハブのサウンド [SOUND] を再生する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| playBeep | beep [FREQUENCY] Hz for [DURATION] ms | [FREQUENCY] Hz の音を [DURATION] ms 鳴らす | [FREQUENCY] Hz の音を [DURATION] ms 鳴らす | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| playNote | play note [NOTE] for [SECS] seconds | 音符 [NOTE] を [SECS] 秒鳴らす | 音符 [NOTE] を [SECS] 秒鳴らす | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| playWaveBeep | beep [WAVEFORM] [FREQUENCY] Hz for [DURATION] ms | [WAVEFORM] 波形の [FREQUENCY] Hz の音を [DURATION] ms 鳴らす | [WAVEFORM] 波形の [FREQUENCY] Hz の音を [DURATION] ms 鳴らす | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| setVolume | set volume to [VOLUME]% | 音量を [VOLUME]% に設定する | 音量を [VOLUME] % にする | 訳語改善 | ユーザー提供の書き起こし「音量を [VOLUME] % にする」; ユーザー提供例と同じ文言を採用。ハブ音量設定を更新する。SPIKE Essentialでは音機能が非対応で、エラーに分類される。 | sound_volume (ja-jp app asset; not a Brickwright SPIKE opcode); partial/help-only: rendered label has ‘音量を’ and ‘％にする’; no direct SPIKE extension opcode match | The source is the app's sound_volume block; its output target/sound-engine scope is not established as equal to Brickwright's hub volume command. Functional equivalence remains unknown. |
| stopSound | stop all sounds | すべての音を止める | すべての音を止める | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getBatteryLevel | battery level % | バッテリー残量（%） | バッテリー残量（%） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getBatteryTemperature | battery temperature | バッテリーの温度 | バッテリーの温度 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getHubTemperature | hub temperature | ハブの温度 | ハブの温度 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getHubCurrent | hub current (mA) | ハブの電流（mA） | ハブの電流（mA） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getHubVoltage | hub voltage (mV) | ハブの電圧（mV） | ハブの電圧（mV） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getTimer | timer | タイマーの値 | タイマー | 訳語改善 | ユーザー提供の書き起こし「タイマー」; ユーザー提供例と同じ文言を採用。拡張側で計測するリセット後の経過時間（秒）を返す。 | flippersensors_timer (ja-jp app_page); exact: rendered Blockly label ‘タイマー’ | Official help describes elapsed program time in seconds. Brickwright reports elapsed seconds from timer state; reporter behavior aligns. |
| resetTimer | reset timer | タイマーをリセットする | タイマーリセット | 訳語改善 | ユーザー提供の書き起こし「タイマーリセット」; ユーザー提供例と同じ文言を採用。拡張側のタイマー開始時刻と経過値をリセットする。 | flippersensors_resetTimer (ja-jp app_page); exact: rendered label and page title ‘タイマーリセット’ | Both reset the elapsed timer used by the corresponding timer reporter. |
| getDistance | [PORT] distance | [PORT] の距離 | [PORT] の距離 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getDistanceIn | [PORT] distance in [UNIT] | [PORT] の距離（[UNIT]） | [PORT] の距離（[UNIT]） | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| setDistanceLights | set [PORT] distance lights [TL] [TR] [BL] [BR] | [PORT] の距離センサーのライトを [TL] [TR] [BL] [BR] に設定する | [PORT] の距離センサーのライトを [TL] [TR] [BL] [BR] に設定する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getColor | [PORT] color | [PORT] の色 | [PORT] の色 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getReflection | [PORT] reflection | [PORT] の反射光 | [PORT] の反射光 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getAmbientLight | [PORT] ambient light | [PORT] の周囲の明るさ | [PORT] の周囲の明るさ | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getColorRGB | [PORT] raw [CHANNEL] | [PORT] の生の [CHANNEL] 値 | [PORT] の生の [CHANNEL] 値 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| getForce | [PORT] force | [PORT] のフォースセンサーの値 | [PORT] のフォースセンサーの値 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| isForceSensorPressed | [PORT] force sensor pressed? | [PORT] のフォースセンサーは押されていますか？ | [PORT] のフォースセンサーは押されていますか？ | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| whenColor | when [PORT] sees [COLOR] | [PORT] が [COLOR] を検出したとき | [PORT] が [COLOR] を検出したとき | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| isColor | [PORT] sees [COLOR]? | [PORT] は [COLOR] を検出していますか？ | [PORT] は [COLOR] を検出していますか？ | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| whenForceSensor | when [PORT] is [STATE] | [PORT] が [STATE] のとき | [PORT] が [STATE] のとき | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| isButtonPressed | [BUTTON] button pressed? | [BUTTON] ボタンは押されていますか？ | [BUTTON] ボタンは押されていますか？ | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| whenButtonPressed | when [BUTTON] button pressed | [BUTTON] ボタンが押されたとき | [BUTTON] ボタンが押されたとき | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合。個別の公式機能比較は未実施。 |
| writeLogFile | append [TEXT] to log file [FILENAME] | [TEXT] をログファイル [FILENAME] に追加する | [TEXT] をログファイル [FILENAME] に追加する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| readLogFile | read log file [FILENAME] | ログファイル [FILENAME] を読み込む | ログファイル [FILENAME] を読み込む | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| deleteLogFile | delete file [FILENAME] | ファイル [FILENAME] を削除する | ファイル [FILENAME] を削除する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| listFiles | list files | ファイル一覧を表示する | ファイル一覧を表示する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| runReplCommand | run Python REPL: [CODE] | Python REPLで実行：[CODE] | Python REPLで実行：[CODE] | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| getReplOutput | REPL output | REPLの出力 | REPLの出力 | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| clearReplOutput | clear REPL output | REPLの出力を消去する | REPLの出力を消去する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| getReplHistory | REPL command [INDEX] | REPLの [INDEX] 番目のコマンド | REPLの [INDEX] 番目のコマンド | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| runPythonCommand | run Python: [CODE] | Pythonを実行：[CODE] | Pythonを実行：[CODE] | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| runHubCommand | run hub command: [CODE] | ハブのコマンドを実行：[CODE] | ハブのコマンドを実行：[CODE] | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |
| exitScript | exit Python script | Pythonスクリプトを終了する | Pythonスクリプトを終了する | 変更なし | 該当例なし | 未照合（このopcodeの個別UI資産を未確認） | Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない。個別の公式機能比較は未実施。 |

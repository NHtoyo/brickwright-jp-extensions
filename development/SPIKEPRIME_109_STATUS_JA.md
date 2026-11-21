# SPIKE Prime 109ブロック実装状況

対象はSPIKE Prime拡張の `work/spikeprime-hub-control-runtime`（Draft PR #4）です。実装の根拠と検証範囲を分けて記録します。

## 自動検査で確認した範囲

- 開発者診断ブロックを含む109 opcodeすべてにScratchハンドラーが存在します。
- 全opcodeを既存のScratch→Python変換器へ個別に通し、生成されたPythonの構文をCPythonで解析します。
- JavaScriptのコマンドIDとフィールドIDを実際のエンコーダーから読み、埋め込みPythonの受信許可リスト・実行分岐との一致を検査します。
- 停止イベント、非モーダルな成功処理、コマンド待ち・失敗伝播、BLEフレーム解析はfake-deviceテストで確認しています。
- 埋め込み中の実コントローラーをCPythonのfake Hub API上で実行し、モーター、モーターペア、表示、音、センサーsnapshot、制限付きログファイルの命令解釈と応答を検査します。

これらは構文・ソフトウェア経路・fake API契約の検査です。SPIKE Prime実機で109ブロックの動作を確認した意味ではありません。

## 機能群の実装

| 機能群 | SPIKE 3経路 | 自動検査 | 実機確認 |
|---|---|---|---|
| 接続・診断・コントローラー | Web BLE、program.pyスロット起動、hello応答、診断履歴 | transport fakeで転送・応答・タイムアウト・再試行を検査 | 今回は未実施 |
| Scratch赤い停止 | VM `PROJECT_STOP_ALL` → 優先 `controller.stop_all` → 実行中スロットのProgramFlow stop。通常キュー取消し・世代管理・再起動経路を維持 | 停止、複数回停止、保留命令、通信失敗、古い接続への誤送信を検査 | 今回は未実施 |
| 単体モーター | `motor.run`、`set_duty_cycle`、`run_for_degrees/time`、`run_to_absolute_position`、`stop`、位置リセット。完了待ち命令は完了応答を待つ | fake controllerでAPI呼び出し・完了/失敗応答を検査 | 今回は未実施。過去のユーザー報告では正しいポートへの接続後にモーターが動作 |
| モーターペア | `motor_pair.pair/move/move_for_degrees/move_for_time/move_tank/stop`。cm・inch移動には実測した車輪周長を要求 | fake APIで設定、連続運転、時間・角度移動、停止を検査 | 今回は未実施 |
| 5×5表示・ハブライト | `light_matrix`、画像ID範囲検査、ピクセル0–100、文字表示worker、`light.color` | fake APIでpixel、pattern、clear、文字完了応答を検査 | 今回は未実施 |
| 3×3カラー行列・距離ライト | `color_matrix`と`distance_sensor.show` | fake APIで画素配列、色・強度、クリアを検査 | 今回は未実施。対応アクセサリーが必要 |
| 音 | `sound.beep/volume/stop`と利用可能なwaveform定数 | fake APIでビープ・wave・停止・エラー応答を検査 | 今回は未実施 |
| IMU・モーター・ポートセンサー | BLE通知の姿勢・角度・位置・速度・色・距離・力。未受信と0を分離。SPIKE Python snapshotで真のfiltered値、ボタン、ジェスチャー、反射、温度を取得 | BLE parser、単位変換、snapshotの受信・デコードを検査 | 今回は未実施 |
| プログラム・ログファイル | プログラムはBLE slot転送・起動、論理名はブラウザー側slot対応表。ログファイルは専用RPC、ファイル名制限、UTF-8チャンク | 転送とログRPCをfake APIで検査 | 今回は未実施 |
| Python/REPL | 任意Python文字列をTunnelMessageで実行しない。SPIKE 3では専用の制御コマンドと明示したプログラム転送を使用 | 任意コード拒否と生成コード構文を検査 | 今回は未実施 |

## 制約・未検証

- `playHubSound`の旧Hub OSサウンドファイル再生と、SPIKE 3の `app.sound` は意味が異なります。ハブのビープへ置き換えて成功を装わず、SPIKE 3では未対応エラーにします。
- SPIKE 3公開Python APIに確認できない周囲光、バッテリー温度、電流、電圧は数値を捏造しません。取得は未対応です。
- 中央電源ボタンの押下状態は通常の公開button APIで確認できると判断できていません。ブロックは未取得を真偽値で偽装しません。
- 実行中スロットのPythonを停止して任意コードへ切り替えるBLE REPLはありません。Python/REPLブロックをTunnelMessage経由の無制限 `exec` に変換しません。
- SPIKE 3 BLEの公開仕様にはハブ内の全任意ファイル・プログラムスロットを列挙するAPIがありません。Brickwrightのスクリプト名一覧は、そのブラウザーで記録した対応表です。
- BLE通知の生IMU値とPython API値の厳密な実機比較、モーター種別ごとの速度上限、3×3マトリクス・色/力センサー・音・ハブライトはHub OS 1.8.149で未検証です。
- `module_tunnel`はLEGO BLE規格そのものの機能保証ではなく、実機でhello成功した既存のSPIKE 3コントローラー経路です。fakeテストはHub OS互換性を証明しません。

## 実施した検査

- `node development/test-spikeprime-transport.js`
- `node development/test-spikeprime-movement.js`
- `python development/test-spikeprime-hub-controller.py`
- `node development/test-spikeprime-codegen.js`
- `npm run lint`
- `npm run validate`
- `npm run build`
- `npm run check-format`

実機での接続・転送・起動・モーター駆動・LED・音・ファームウェア操作は行っていません。

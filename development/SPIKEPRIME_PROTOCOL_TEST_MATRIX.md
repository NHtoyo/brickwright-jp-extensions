# SPIKE Prime 通信仕様と fake-device テスト対応表

この表は `test-spikeprime-transport.js` が確認する通信仕様と、確認できない範囲を記録する。テストは fake Web Bluetooth characteristic 上で動き、SPIKE Prime 実機や Hub OS 1.6.62 への接続・送信は行わない。

参照する LEGO 公開仕様:

- [接続と GATT](https://lego.github.io/spike-prime-docs/connect.html)
- [protocol messages](https://lego.github.io/spike-prime-docs/messages.html)
- [COBS encoding](https://lego.github.io/spike-prime-docs/encoding.html)

## 現時点の機能ステータス

| 機能 | 状態 | 根拠・制約 |
|---|---|---|
| Web Bluetooth 接続開始、InfoRequest、InfoResponse からの Hub OS 表示 | fake で確認済み | fixture が `1.6.62` を返す。実機接続は未確認。 |
| 0x28 センサー通知要求、0x29 応答・拒否・タイムアウト・送信エラー | fake で確認済み | 応答状態と呼び出し元へのエラー伝達を検証。Hub OS 1.6.62 が受理するかは未確認。 |
| IMU の Pitch / Roll / Yaw 受信と Scratch reporter | fake で確認済み | 正負値、0値、未受信状態を区別。実機で傾けた際の変化と値の単位は未確認。 |
| モーターの位置・相対位置・絶対位置・速度値 | fake で確認済み（今回 parser 修正） | LEGO の12バイト record を用い各値と Scratch reporter を照合。実モーターの手回し、ポート検出、速度換算は未確認。 |
| COBS 分割受信・連結 frame、破損 frame、切断・再接続 | fake で確認済み | 独立 fixture の byte stream で検証。Chrome と実機間の通知分割は未確認。 |
| 5×5 表示 record の受信、診断 reporter の日本語表示 | fake で一部確認済み | record 値と診断文字列を検証。ハブ表示の実動作は未確認。 |
| Battery、Color、Distance、Force、3×3 matrix record | parser 実装あり、fake の個別確認なし | 受信値の形式と各 reporter を実機または専用 fixture で照合していない。 |
| モーター駆動・ステアリング、LED/Matrix 出力、センサーライト、音、Python 実行・転送、ファイル操作 | 未確認 | コード生成・送信経路があるものも、Hub OS 1.6.62 上の互換性と安全性を確認していない。今回ハブへ送信しない。 |
| 文字表示 | SPIKE 3.x では明示的に未対応 | native command に対応しない場合、日本語エラーを返し未検証 Python fallback を送らない。 |
| 反射光・周囲光、バッテリー/ハブ温度、電流・電圧 | 現行 SPIKE 3.x 通知では未対応 | 対応 record がなく、reporter は測定値らしい0を返さず空欄にする。 |
| ボタン・ジェスチャー・ハブの向き名 | 実装上の受信経路なし | SPIKE 3.x notification record/parser に入力がなく、実機動作は未確認。 |
| Hub OS 1.6.62 の互換性全般 | 実機未確認 | fixture のファームウェア文字列だけでは互換性の証明にならない。 |

| 仕様・message | 実装上の扱い | fake-device テスト | テストが示すこと / 示さないこと |
|---|---|---|---|
| FD02 service、RX write、TX notification | Web Bluetooth characteristic の取得、TX notification 開始、RX への書き込み | `Web Bluetooth requests notifications...` | fake characteristic の lifecycle と要求順序を確認する。実機 GATT 接続は確認しない。 |
| `InfoRequest` (`0x00`) / `InfoResponse` (`0x01`) | 接続時に要求し、firmware、最大 packet size、最大 chunk size を読む。最大 message size は現在の拡張では使用しない | 全テストの `connect()` fixture | wire bytes と fixture 上の `1.6.62` の解析を確認する。実機が同じ応答を返す証明ではない。 |
| `DeviceNotificationRequest` (`0x28`) / response (`0x29`) | 100 ms の通知要求を送り、成功応答まで呼び出し元 Promise を保留する。拒否応答・timeout・write error を診断状態と呼び出し元に伝える | `Web Bluetooth requests notifications...`、`a missing notification acknowledgement...`、`a fake-device write failure...` | 要求 bytes、fake 応答状態、reject propagation を確認する。Hub OS 1.6.62 が要求を受理するかは未確認。 |
| `DeviceNotification` (`0x3C`) | 2-byte little-endian payload length の後に device records を解析 | `IMU values decode...`、`motor position and 5x5 matrix...` | 通知 envelope と record parser の組み合わせを確認する。実機からの通知到着は未確認。 |
| COBS frame、`0x03` XOR、`0x02` delimiter | BLE event 間の部分 frame を保持し、delimiter で復号する | `split COBS frames and multiple frames...`、`broken frames...` | 独立 fixture encoder が作る split/concatenated frame、壊れた frame の扱いを確認する。LEGO の実機 capture との照合は未実施。 |
| IMU record (`0x01`, 21 bytes) | face-up、yaw/pitch/roll、accelerometer、gyroscope を little-endian signed 16-bit として解析。未受信状態は時刻 `null`、受信済みの 0 は件数と時刻で区別 | `IMU values decode signed angles and distinguish received zero from no data` | 初期未受信、正常な 0、正負の角度、Scratch reporter への角度受け渡しを確認する。値のスケーリング・Hub OS 固有差は実機未確認。 |
| Motor record (`0x0A`, 12 bytes) | LEGO仕様の port、motor type、signed absolute position (`int16 @3`)、power (`int16 @5`)、speed (`int8 @7`)、counted relative position (`int32 @8`) を読む。旧 position reporter は絶対位置を0–359度に正規化し、相対位置 reporter は累積位置、絶対位置 reporter は -180–179度を返す | `motor position and 5x5 matrix records...`、`truncated motor records...` | 符号付き値、各 Scratch reporter への割り当て、切り詰め通知で前値を保持することを fake record で確認する。物理回転、速度換算の実機妥当性は未確認。 |
| 5×5 matrix record (`0x02`, 25 cell bytes) | 25 bytes を保存し、通知数と最新値を診断に公開 | `motor position and 5x5 matrix records...` | parser が record を読み落とさないことを確認する。LED 表示の実機動作は確認しない。 |
| 不正 frame、サイズ不一致、未知 record | malformed/unsupported counters と最終エラーを更新し、後続 frame の解析を続ける | `broken frames, malformed sizes, and unknown records...` | 指定 fixture と次の独立 frame で回復することを確認する。未知 record の幅が不明な場合、その通知内の後続 byte を安全に再同期できるとは主張しない。 |
| disconnect / reconnect | 接続状態・部分 frame・診断セッションをリセットする | `disconnect clears the partial frame and reconnect...` | fake event lifecycle で reset と新しい通知解析を確認する。OS/ブラウザーの再接続挙動は未確認。 |
| `TunnelMessage` (`0x32`) | 16-bit little-endian payload length と Python source bytes を frame 化する。fake-device のみで未対応 native method の fallback/transport failure 経路を検証し、表示テキストは自動 fallback しない | `SPIKE 3.x native unsupported commands reject; Python tunnel encoding...`、`SPIKE 3.x transport write errors propagate...`、`SPIKE 3.x display text does not auto-send...` | generic tunnel の wire encoding、fake での分岐、transport error propagation のみを確認する。Python source が Hub OS 1.6.62 上で実行されることや安全性は証明しない。実機へは送信しない。 |
| 診断テキスト reporter | 日本語の接続・通知状態・IMU件数/時刻/角度・モーター位置・解析エラーを返す。未受信は0と別に表示 | `localized diagnostic summary distinguishes missing IMU data...`、`communication diagnostics block is localized...` | fake notification を含む診断値とローカライズを確認する。表示時の BLE 通信増加はなく、実機表示確認は別手順。 |
| unsupported native `displayText` | SPIKE 3.x で native command が拒否された際、未確認の Python fallback を自動送信しない | `SPIKE 3.x display text does not auto-send...` | この display-text 経路で fake device write が増えないことを確認する。他の既存 Python fallback 経路の firmware 互換性は未検証。 |

## 実機検証の境界

Fake-device テストの成功は、LEGO の公開 wire layout に合わせたコード経路の回帰確認であり、Hub OS 1.6.62 の実機検証ではない。実機での通知受信、値の更新、モーター・LED 動作、Python tunnel 実行、切断・再接続は未確認である。ファームウェア更新・書き換え、および実機へのコマンド送信は今回行わない。

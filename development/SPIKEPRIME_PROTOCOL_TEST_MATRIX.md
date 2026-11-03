# SPIKE Prime 通信仕様と fake-device テスト対応表

この表は `test-spikeprime-transport.js` が確認する通信仕様と、確認できない範囲を記録する。テストは fake Web Bluetooth characteristic 上で動き、SPIKE Prime 実機や Hub OS 1.6.62 への接続・送信は行わない。

参照する LEGO 公開仕様:

- [接続と GATT](https://lego.github.io/spike-prime-docs/connect.html)
- [protocol messages](https://lego.github.io/spike-prime-docs/messages.html)
- [COBS encoding](https://lego.github.io/spike-prime-docs/encoding.html)

| 仕様・message | 実装上の扱い | fake-device テスト | テストが示すこと / 示さないこと |
|---|---|---|---|
| FD02 service、RX write、TX notification | Web Bluetooth characteristic の取得、TX notification 開始、RX への書き込み | `Web Bluetooth requests notifications...` | fake characteristic の lifecycle と要求順序を確認する。実機 GATT 接続は確認しない。 |
| `InfoRequest` (`0x00`) / `InfoResponse` (`0x01`) | 接続時に要求し、firmware と packet/message/chunk size を読む | 全テストの `connect()` fixture | wire bytes と `1.6.62` の解析を確認する。実機が同じ応答を返す証明ではない。 |
| `DeviceNotificationRequest` (`0x28`) / response (`0x29`) | 100 ms の通知要求を送り、応答コード・timeout・write error を診断状態に記録 | `Web Bluetooth requests notifications...`、`a missing notification acknowledgement...`、`a fake-device write failure...` | 要求 bytes と fake 応答状態を確認する。Hub OS 1.6.62 が要求を受理するかは未確認。 |
| `DeviceNotification` (`0x3C`) | 2-byte little-endian payload length の後に device records を解析 | `IMU values decode...`、`motor position and 5x5 matrix...` | 通知 envelope と record parser の組み合わせを確認する。実機からの通知到着は未確認。 |
| COBS frame、`0x03` XOR、`0x02` delimiter | BLE event 間の部分 frame を保持し、delimiter で復号する | `split COBS frames and multiple frames...`、`broken frames...` | 独立 fixture encoder が作る split/concatenated frame、壊れた frame の扱いを確認する。LEGO の実機 capture との照合は未実施。 |
| IMU record (`0x01`, 21 bytes) | yaw/pitch/roll を little-endian signed 16-bit として解析。未受信状態は時刻 `null`、受信済みの 0 は件数と時刻で区別 | `IMU values decode signed angles and distinguish received zero from no data` | 初期未受信、正常な 0、正負の値を確認する。値のスケーリング・Hub OS 固有差は実機未確認。 |
| Motor record (`0x0A`, 12 bytes) | port、type、speed、relative position を既存 motor state に反映 | `motor position and 5x5 matrix records...` | fixture の position と speed の解析を確認する。モーター回転・速度の実機動作は確認しない。 |
| 5×5 matrix record (`0x02`, 25 cell bytes) | 25 bytes を保存し、通知数と最新値を診断に公開 | `motor position and 5x5 matrix records...` | parser が record を読み落とさないことを確認する。LED 表示の実機動作は確認しない。 |
| 不正 frame、サイズ不一致、未知 record | malformed/unsupported counters と最終エラーを更新し、後続 frame の解析を続ける | `broken frames, malformed sizes, and unknown records...` | 指定 fixture と次の独立 frame で回復することを確認する。未知 record の幅が不明な場合、その通知内の後続 byte を安全に再同期できるとは主張しない。 |
| disconnect / reconnect | 接続状態・部分 frame・診断セッションをリセットする | `disconnect clears the partial frame and reconnect...` | fake event lifecycle で reset と新しい通知解析を確認する。OS/ブラウザーの再接続挙動は未確認。 |
| `TunnelMessage` (`0x32`) | 16-bit little-endian payload length と Python source bytes を frame 化する | `SPIKE 3.x native unsupported commands reject; Python tunnel encoding...` | generic tunnel の wire encoding のみを確認する。Python source が Hub OS 1.6.62 上で実行されることや安全性は証明しない。 |
| unsupported native `displayText` | SPIKE 3.x で native command が拒否された際、未確認の Python fallback を自動送信しない | `SPIKE 3.x display text does not auto-send...` | この display-text 経路で fake device write が増えないことを確認する。他の既存 Python fallback 経路の firmware 互換性は未検証。 |

## 実機検証の境界

Fake-device テストの成功は、LEGO の公開 wire layout に合わせたコード経路の回帰確認であり、Hub OS 1.6.62 の実機検証ではない。実機での通知受信、値の更新、モーター・LED 動作、Python tunnel 実行、切断・再接続は未確認である。ファームウェア更新・書き換え、および実機へのコマンド送信は今回行わない。

# SPIKE Essential のLWP3モーター値に関する監査

## 今回の判断

- DeviceType `0x0030` はMedium Angular Motor、`0x0031` はLarge Angular Motor、`0x0041` はSmall Angular Motorとして、1つの共有定義表で分類する。
- モーターの接続通知だけで機器名を表示する。角度・速度は実際のPort Value `0x45` を受信するまで未取得とする。
- 角度はモーターのmode 2 `POS`だけを使う。LEGOのMotor APIはこれを起動時の位置からの角度（度）と説明している。0〜359度に折り返したり、絶対角度として推測したりしない。
- 接続した既知の角度モーターにはmode 2 `POS`の`0x41`購読を要求する。並行して`0x22 / VALUE FORMAT (0x80)`を問い合わせるが、`0x44`の応答待ちを購読開始の必須条件にはしない。既知のモーターIDで形式情報がない場合は、符号付き32-bit POSとして扱うことを明示したフォールバックを使う。`0x44`が別形式を明示した場合は、その値を位置としてデコードしない。
- この経路ではAPOS mode 3を購読しない。SPIKE Essentialのモーターについてデータ幅・値の意味がこの処理で実測確認できていないため、`absolutePosition`は`null`、`absolutePositionAvailable`は`false`とする。
- 速度は2つの実測POS値と受信時刻から計算する推定値であり、モーターが通知する独立の速度測定値ではない。APIでは`speedDerived: true`と由来を付ける。
- 角度リセットはPort Output `0x81`の`WriteDirectModeData (0x51)`、mode 2、符号付き32-bit little-endian値で送る。書き込み成功だけでは値を0にしない。新しい`0x45`を受けるまでは角度を未取得にする。

## バイト列の照合

以下はLWP3 Common Message Headerの長さ、Hub ID `0x00`、メッセージ種別、フィールド配置を表示している。`0x44`の返答はテスト用の代表値であり、実機から今回採取したログではない。

| 内容 | バイト列（16進） | 意味 |
| --- | --- | --- |
| AへMedium Angular Motor接続 | `07 00 04 00 01 30 00` | 長さ7、HubAttachedIO、ポートA、接続、DeviceType `0x0030` |
| Aのmode 2の値形式要求 | `06 00 22 00 02 80` | Port Mode Information Request、A、mode 2、VALUE FORMAT |
| 形式応答例 | `0A 00 44 00 02 80 01 02 04 00` | Port Mode Information、A、mode 2、1 dataset、32-bit、4桁、小数0桁 |
| mode 2通知要求 | `0A 00 41 00 02 01 00 00 00 01` | Port Input Format Setup Single、A、mode 2、delta 1、通知有効 |
| 通知要求への応答 | `0A 00 47 00 02 01 00 00 00 01` | A、mode 2、delta 1、通知有効 |
| POS値 `+400` の例 | `08 00 45 00 90 01 00 00` | Port Value Single、A、符号付きint32 LE `400` |
| POS値 `-25` の例 | `08 00 45 00 E7 FF FF FF` | Port Value Single、A、符号付きint32 LE `-25` |
| 一度だけ初期値を読む要求 | `05 00 21 00 00` | Port Information Request、A、Port Value。継続ポーリングではない |
| mode 2を`10`に設定する例 | `0B 00 81 00 11 51 02 0A 00 00 00` | Port Output Command、A、feedback、WriteDirectModeData、mode 2、int32 LE `10` |

LWP3仕様は`0x41`の応答として`0x47`を規定し、delta `1`は値が1単位変わるごとの通知、delta `0`は可能な限り高速な通知となりBLE帯域を圧迫するため使用しないよう記載している。`0x45`のデータ幅はmode formatで検証する。既知の角度モーターについてはmode 2のPOS形式を利用する既存経路を維持し、`0x44`が明確に異なるデータ型を返したときだけ、未検証の値を角度として採用しない。初回値は`0x47`確認後に一度だけ問い合わせ、その後はdelta `1`の通知を使う。

## 根拠資料と適用限界

- [LEGO Wireless Protocol 3.0.00](https://lego.github.io/lego-ble-wireless-protocol-docs/) §§3.16, 3.17, 3.20, 3.21, 3.23, 3.26：`0x22` mode情報要求、`0x41`入力形式設定、`0x44`のValue Format、`0x45`通知、`0x47`応答、`0x21`値要求、`0x51`出力データのプロトコル形式。
- [LEGO MINDSTORMS Robot Inventor Hub API: Motor.mode](https://lego.github.io/MINDSTORMS-Robot-Inventor-hub-API/class_motor.html)：mode 2は起動時の位置に対する角度、mode 3は`-180..+179`の絶対位置と説明する。
- [LEGO MINDSTORMS Robot Inventor Hub API: Port.info](https://lego.github.io/MINDSTORMS-Robot-Inventor-hub-API/class_port.html)：Medium Angular MotorのAPOS mode 3の例はint16、SI範囲`-180..179`。これはSPIKE Essential全モーターや本実装のmode 2への無条件の適用根拠ではないため、APOSは公開しない。
- 既知のモーターIDについて、`0x44`の欠落時にint32 POSを使う実装は、モーターIDと既存のmode 2経路に限定した互換フォールバックであり、各Essentialモーターの全ファームウェアでの形式を実機確認したという意味ではない。実機Hub OS上でのこの実装の動作、各Essentialモーターの返す`0x44`値、リセット後の挙動は未検証。Fake LWP3でのテストは実機互換性の証明ではない。

## Fake-device検証範囲

自動テストは添付されたAポート`0x30`接続通知、Small `0x41`とLarge `0x31`の分類、mode情報要求・形式確認、`0x41/0x47`ハンドシェイク、`0x45`の正逆転・360度超・符号付き値、format mismatchの拒否、`0x21`単発読出し、`0x51`リセット書き込み後に実値を待つ動作、デタッチ・再接続後の古い値消去を確認する。これらはバイト列とソフトウェア状態遷移のテストであり、実機モーターを回した結果ではない。

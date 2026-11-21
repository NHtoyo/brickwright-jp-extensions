# SPIKE Prime 制御プログラム起動停止の調査

## 実機ログから確定できること

- Hub OS 1.6.62 / RPC 1.0.14で、BLE接続、IMU・モーター・LED通知、スロット19への転送チャンク、`ProgramFlowResponse (0x1F)`は成功した。
- 起動要求の2 ms後に`ProgramFlowNotification (0x20)`のstopが届き、start通知とコントローラー応答は届かなかった。
- この試行ではBLE切断が起きていない。したがって、今回のログからBLE切断を原因とする根拠はない。
- 0x1Fの成功はハブが起動要求を受理したことを示し、Pythonコードの初期化・継続実行までは証明しない。stop通知はプログラムが停止状態になったことを示すが、Python例外が起きたことまでは証明しない。

## コード上で確認できた問題

旧fakeテストは`__name__ = "brickwright_controller_test"`でソースを評価し、`runloop.run`をコルーチンを返すだけのlambdaにしていた。このためエントリーポイントを通らず、初期化後の待機も実行していなかった。以前の「ハブ側テスト成功」は起動・継続動作を検証していなかった。

制御プログラムの末尾にあった`if __name__ == "__main__":`は実行環境の名前付けに依存していた。LEGO公式のアップロード例は、ハブ側プログラムの末尾でガードなしに`runloop.run(main())`を実行している。そこで今回、転送ファイルがプログラムとして起動される前提でrunloopを無条件に開始する形へ変更した。これにより`__name__`の値が原因でループが実行されない経路を除去した。

ただし、LEGOの公開仕様はHub OS 1.6.62における`__name__`値を明記していない。独立したSolaria Scratch実装は同じ形式のガードを使い、MicroPythonでは`__main__`になるとコメントしている。したがって、今回のログが旧ガードによるものだったとは確定できず、今回の修正は実行環境差に依存しない堅牢化である。

## API・初期化の照合

| 項目 | 根拠と判定 |
| --- | --- |
| `runloop.run(main())` | LEGO公式の転送用Python例が使用。今回のasync mainと継続待機はfakeイベントループで実行確認。 |
| `import motor`, `import runloop`, `from hub import port, light_matrix, sound` | LEGO Education SPIKE Prime Python例で使用例を確認。Hub OS 1.6.62上での実機importは未確認。 |
| `import hub`, `import json`, `import time` | 公式転送例だけでは個別の互換性を確認できない。`json`は`ujson`へのfallbackを維持。fakeではimport経路を確認。対象ファームウェアでの実機importは未確認。 |
| `hub.config["module_tunnel"]`, `tunnel.callback(...)`, `tunnel.send(...)` | LEGO公式のBLE仕様ではPython Tunnel APIを保証していない。独立したSolaria実装のハブ側コードにも同じconfig/callback APIがあるが、第三者実装であり、Hub OS 1.6.62の保証にはならない。 |
| ProgramFlow / Console通知 | LEGO公式メッセージ定義に0x20のProgramFlowNotificationと0x21のConsoleNotificationがある。実機のコンソール通知が0件でも、例外がなかったとは判断できない。 |

## 今回の変更

- 起動時に`entered`、import完了、runloop開始、Tunnel callback登録の段階をConsoleNotification向けに記録する。
- import例外、Tunnel取得・callback登録例外、runloop例外を型と詳細付きで出力する。
- Tunnel初期化に失敗した場合は、例外で即時終了させず、診断を残してハードウェア命令を実行せず待機する。
- entrypointを無条件に`runloop.run(_main())`とし、正常に継続していることをfake runloopで検証する。
- `development/fixtures/spikeprime-startup-smoke.py`を追加した。このプログラムはimport、Tunnel取得、callback登録、待機だけを段階確認し、Tunnel送信やモーター・LED・音の操作を含まない。今回ハブへは転送・起動していない。既存スロットを上書きせず実機へ持ち込むには、空きスロット確認とユーザーの明示許可が必要。

## テストの範囲と限界

`development/test-spikeprime-hub-controller.py`はCPython上のfake Hub APIを使い、実際のPython `asyncio`で`runloop.run`からコントローラーのmain coroutineを実行する。`__main__`と別の`__name__`、複数回のwait、module_tunnel欠落、callback登録例外、API import、既存のコマンド・キュー・安全停止を確認する。これらはソースの制御フローとfake契約を検証するもので、LEGO Hub OS 1.6.62の実装を再現または証明しない。

今回の作業ではハブへの接続、既存プログラムの消去・転送・起動、ハードウェア命令、ファームウェア操作をしていない。実機で原因を一度で切り分けるには、許可後にスロット上書きのない空き枠を確保し、まず上記smokeプログラムでConsoleNotificationの段階ログとstart/stop通知を採取する。その結果により、Python entrypoint、import、`module_tunnel`取得、callback登録のどこまで進んだかを判定する。

## 参照資料

- [LEGO公式 SPIKE Prime BLE接続・転送例](https://github.com/LEGO/spike-prime-docs/blob/main/examples/python/app.py) — 公式例はプログラム本文に`runloop.run(main())`を記述。
- [LEGO公式メッセージ定義](https://github.com/LEGO/spike-prime-docs/blob/main/examples/python/messages.py) — ProgramFlowNotificationとConsoleNotificationのID・形式。
- [LEGO Education SPIKE Prime Python Programs](https://assets.education.lego.com/v3/assets/blt293eea581807678a/blt02bcbffa2bf460b5/65df44a50f1d35dffdca4995/EN-US-SPIKE-Prime-Python-Programs_Feb-2024.pdf?locale=en-us) — `motor`、`runloop`、`hub`のport/light_matrix/soundの使用例。
- [独立したSolaria Scratch SPIKE Prime実装](https://github.com/edcheng1010/solaria-scratch-spike-prime/blob/main/extension.js) — 同種のTunnel APIとハブ側entrypointを使用する第三者コード。公式仕様ではなく、本プロジェクト側でHub OS 1.6.62上の動作を再確認したものでもない。

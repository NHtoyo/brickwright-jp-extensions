# SPIKE Prime スロット起動ファイル名の実機比較

Hub OS 1.8.149 / RPC 1.0.47、Web Bluetoothでスロット1を使用した。既存プローブの547バイトをUSBで読み出し、CRC32 `0x3791e95a`とSHA-256 `1cbfc8fb0bed87793826c513a76cda8c7568ec009a9910bf547c7c0664b2ddae`を確認してPCにバックアップした。比較時はソースとCRCを維持し、転送名を`brickwright-probe-00.py`から`program.py`へ変えた。両試験のTransferChunkRequestに含まれる547バイトはバックアップと一致する。

| 項目 | 旧名 | `program.py` |
| --- | --- | --- |
| ClearSlotResponse | status 1 | status 0 |
| StartFileUploadResponse | status 0 | status 0 |
| TransferChunkResponse | status 0 | status 0 |
| ProgramFlowRequest / Response | `1e0001` / status 0 | `1e0001` / status 0 |
| Start / Stop通知 | ともに未受信 | `2000` / `2001`を受信 |
| Python段階マーカー | 0 / 5 | 5 / 5 |
| 結果 | 判定不能 | 実行開始からmain末尾まで確認 |

新しい試験ではStart通知が`1794465120949`、最初のPythonマーカーが`1794465120950`、main完了マーカーが`1794465122961`、Stop通知が`1794465122962`だった。実行期間はマーカー受信時刻間で2011 ms。試験後にUSBでスロット1を読み取り、`program.py`（547バイト）だけが存在することを確認した。旧ファイルはClearSlotで消去され、PC側にバックアップがある。

同一のPythonとCRCで新しい名前の試験が成功したため、旧ファイル名は起動失敗の強い原因候補である。ただし2回の試験の間にはUSB REPL使用とソフト再起動があり、ClearSlotResponseも異なっていた。ファイル名だけが必須条件とまではこの比較だけで断定できない。スロット0は読み取りのみで、`app.mpy`（4076バイト）と`program.mpy`（141バイト）を確認した。コンパイル済みファイルの内容が特定のHiプログラムであることは未確認。スロット19にはアクセスしていない。

修正ではプローブと常駐コントローラーのアップロード名を`program.py`へ変更した。常駐コントローラーの転送・hello応答、モーターやLED制御は今回の比較では試験していない。PythonとBLE通信処理は変更していない。

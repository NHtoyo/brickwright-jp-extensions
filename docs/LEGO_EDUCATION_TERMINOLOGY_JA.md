# SPIKE Prime 日本語用語指針

SPIKE Prime拡張の表示文言は、LEGO Educationが日本語で使っているハードウェア名・プログラミング用語に合わせる。文の形はScratchのブロックとして読みやすく整えるが、LEGOの概念や値の意味を変えない。

## 用語

| 英語・概念 | 日本語表記 |
|---|---|
| hub | ハブ |
| Hub OS version | Hub OS バージョン |
| motor | モーター |
| relative position | モーターの相対位置（度） |
| absolute position | モーターの絶対位置（度） |
| motor speed (degrees per second) | モーターの回転速度（度/秒） |
| color sensor | カラーセンサー |
| distance sensor | 距離センサー |
| force sensor | フォースセンサー |
| light matrix | ライトマトリックス |
| movement motor | 移動用モーター |
| steering | ステアリング |
| Pitch / Roll / Yaw | Pitch / Roll / Yaw |

「相対位置」「絶対位置」は、モーターの位置値であることをブロック文に含める。度単位の回転量である値を、距離や速度として表現しない。角速度の値には「回転速度（度/秒）」を使う。

## プロジェクト互換性

翻訳してよいのはブロックに表示する文章とメニューラベル。opcode、引数ID、メニューの保存値、Python識別子、プロジェクトに保存される値は変更しない。メニュー項目は表示文字列と内部値を分ける形式を使い、既存プロジェクトの保存値を保つ。

日本語の選択肢は短くし、ブロック上の語順は「対象 → 動作 → 値」を基本にする。Bluetooth、Python、Pitch、Roll、Yaw、Hub OSなど、画面内で必要な専門語はそのまま使う。

## 参照

- [LEGO Education SPIKE アプリ（日本語）](https://education.lego.com/ja-jp/downloads/spike-app/software/) — SPIKE アプリ、ワードブロックなどの用語。
- [LEGO Education SPIKE Prime サポート（日本語）](https://education.lego.com/ja-jp/product-resources/spike-prime/先生向けリソース/ヒントと豆知識/) — ハブ、カラーセンサー、距離センサー、フォースセンサー、ライトマトリックスなどの表記。
- [LEGO Education Sアンギュラーモーター（日本語）](https://education.lego.com/ja-jp/products/lego-technic-small-angular-motor/45607/) — 絶対位置検出機能、絶対ポジショニング機能の表記。

LEGO Educationの公開日本語資料を用語の根拠とする。SPIKEアプリ内部の翻訳カタログを直接参照していない文字列について、アプリ画面と一字一句同一であるとは主張しない。

// Rebuild the 109-opcode Japanese label audit against a selectable baseline.
// The generated audit intentionally records official block-text comparisons as
// unverified unless an exact visible label has been checked in the installed
// LEGO Education SPIKE application.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const relativeSourcePath =
  "extensions/CrispStrobe/legospike_turbowarp_transpile.js";
const sourcePath = path.join(repositoryRoot, relativeSourcePath);
const auditPath = path.join(
  repositoryRoot,
  "development/SPIKEPRIME_109_JA_AUDIT.md"
);
const baselineRef = process.argv[2] || "e29421a";
const baselineSource = execFileSync(
  "git",
  ["show", `${baselineRef}:${relativeSourcePath}`],
  { cwd: repositoryRoot, encoding: "utf8" }
);

const loadExtension = (source, language) => {
  let extension;
  const context = vm.createContext({
    Scratch: {
      extensions: {
        unsandboxed: true,
        register: (registered) => {
          extension = registered;
        },
      },
      ArgumentType: new Proxy({}, { get: (_target, key) => String(key) }),
      BlockType: new Proxy({}, { get: (_target, key) => String(key) }),
      Cast: {
        toString: (value) => String(value),
        toNumber: (value) => Number(value),
        toBoolean: (value) => Boolean(value),
      },
    },
    window: {
      location: { search: "?spikePrimeDiagnostics=1" },
      addEventListener() {},
      removeEventListener() {},
    },
    navigator: { language, languages: [language] },
    console: {
      log() {},
      warn() {},
      error() {},
      info() {},
      debug() {},
    },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    TextEncoder,
    btoa,
    atob,
    Date,
    Promise,
  });
  vm.runInContext(source, context, { filename: relativeSourcePath });
  assert.ok(extension, `extension registers for locale ${language}`);
  return extension;
};

const beforeInfo = loadExtension(baselineSource, "ja-JP").getInfo();
const source = fs.readFileSync(sourcePath, "utf8");
const englishInfo = loadExtension(source, "en-US").getInfo();
const japaneseInfo = loadExtension(source, "ja-JP").getInfo();
const byOpcode = (info) =>
  new Map(
    info.blocks
      .filter((block) => block && typeof block.opcode === "string")
      .map((block) => [block.opcode, block.text])
  );
const before = byOpcode(beforeInfo);
const english = byOpcode(englishInfo);
const japanese = byOpcode(japaneseInfo);
const opcodes = [...english.keys()];
const brickwrightSpecific = new Set([
  "connectHub",
  "connectHubAt",
  "disconnectHub",
  "isConnected",
  "getHubType",
  "getFirmwareVersion",
  "getConnectionMode",
  "getCommunicationDiagnostics",
  "getCommunicationDiagnosticsSummary",
  "openCommunicationDiagnosticsLog",
  "runStartupProbe",
  "installHubController",
  "checkHubController",
  "setConnectionMode",
  "enableStreamingMode",
  "disableStreamingMode",
  "transpileProject",
  "showCode",
  "downloadCode",
  "getTranspiledCode",
  "uploadToHub",
  "uploadScriptToHub",
  "runScriptOnHub",
  "renameScriptOnHub",
  "deleteScriptOnHub",
  "listScriptsOnHub",
  "stopRunningScript",
  "writeLogFile",
  "readLogFile",
  "deleteLogFile",
  "listFiles",
  "runReplCommand",
  "getReplOutput",
  "clearReplOutput",
  "getReplHistory",
  "runPythonCommand",
  "runHubCommand",
  "exitScript",
]);

assert.equal(
  opcodes.length,
  109,
  "the current audit scope remains 109 opcodes"
);
assert.equal(
  japanese.size,
  opcodes.length,
  "each English opcode has a Japanese label"
);

const escapeCell = (value) =>
  String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
const rows = opcodes.map((opcode) => {
  const oldLabel = before.get(opcode) ?? "（ベースラインに未登録）";
  const newLabel = japanese.get(opcode);
  const functionRelation = brickwrightSpecific.has(opcode)
    ? "Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない"
    : "ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合";
  return `| ${escapeCell(opcode)} | ${escapeCell(english.get(opcode))} | ${escapeCell(oldLabel)} | ${escapeCell(newLabel)} | ${oldLabel === newLabel ? "変更なし" : "訳語改善"} | ${functionRelation} | 個別ブロック文言は未照合 |`;
});
const changedCount = rows.filter((row) => row.includes("| 訳語改善 | ")).length;
const distinctCount = opcodes.filter((opcode) =>
  brickwrightSpecific.has(opcode)
).length;
const hardwareConceptCount = opcodes.length - distinctCount;
const userProvidedExamples = new Map([
  [
    "motorStop",
    {
      label: "[PORT] のモーターを停止する",
      status: "ユーザー提供例と同じ文言を採用",
      behavior:
        "scratch.motor_stopを呼び、選択ポートのモーターを現在の停止設定で止める。stopMotorのように停止方法を引数で選ぶブロックとは区別する。",
    },
  ],
  [
    "motorSetSpeed",
    {
      label: "[PORT] のスピードを [SPEED] % にする",
      status: "ユーザー提供例と同じ文言を採用",
      behavior:
        "選択ポートの次回以降のモーター動作に使う速度設定を更新する。このブロック単独ではモーターを起動しない。",
    },
  ],
  [
    "getPosition",
    {
      label: "[PORT] 位置",
      status: "回転角度と単位を明確にするため意味を保って言い換え",
      behavior:
        "Primeは既存実装のposition値、Essentialはmode 2 POSの累積相対角度を返す。EssentialではAPOS（絶対角度）を返すわけではないため、『[PORT] の回転位置（度）』とした。",
    },
  ],
  [
    "setVolume",
    {
      label: "音量を [VOLUME] % にする",
      status: "ユーザー提供例と同じ文言を採用",
      behavior:
        "ハブ音量設定を更新する。SPIKE Essentialでは音機能が非対応で、エラーに分類される。",
    },
  ],
  [
    "getTimer",
    {
      label: "タイマー",
      status: "ユーザー提供例と同じ文言を採用",
      behavior: "拡張側で計測するリセット後の経過時間（秒）を返す。",
    },
  ],
  [
    "resetTimer",
    {
      label: "タイマーリセット",
      status: "ユーザー提供例と同じ文言を採用",
      behavior: "拡張側のタイマー開始時刻と経過値をリセットする。",
    },
  ],
  [
    "resetYaw",
    {
      label: "ヨー角を0に設定",
      status: "ユーザー提供例と同じ文言を採用",
      behavior: "Primeのyawを0に設定する。SPIKE Essentialはyaw機能に非対応。",
    },
  ],
]);

for (const [opcode, example] of userProvidedExamples) {
  const expectedLabel =
    opcode === "getPosition" ? "[PORT] の回転位置（度）" : example.label;
  assert.equal(
    japanese.get(opcode),
    expectedLabel,
    `${opcode} should retain the user-confirmed wording or documented semantic adaptation`
  );
}
const exactUserExampleCount = [...userProvidedExamples].filter(
  ([opcode, example]) => japanese.get(opcode) === example.label
).length;
const adaptedUserExampleCount =
  userProvidedExamples.size - exactUserExampleCount;
const content =
  `# SPIKE Prime 109 opcode 日本語表示・用語照合監査\n\n` +
  `基準コミット: \`${baselineRef}\`\n\n` +
  `## 集計\n\n` +
  `- 対象 opcode: ${opcodes.length}\n` +
  `- 英語ラベルあり: ${english.size}\n` +
  `- 日本語ラベルあり: ${japanese.size}\n` +
  `- 今回の訳語変更: ${changedCount}\n` +
  `- Brickwright固有の管理・開発連携として分類: ${distinctCount}\n` +
  `- 公式UIにカテゴリはあるが、個別機能・値・動作は未照合: ${hardwareConceptCount}\n` +
  `- ユーザー提供の用語・表示例と照合した opcode: ${userProvidedExamples.size}\n` +
  `- ユーザー提供例の文言をそのまま採用: ${exactUserExampleCount}\n` +
  `- 動作差を明示するため意味を保って調整: ${adaptedUserExampleCount}\n` +
  `- 7件の表示例について、対応opcodeと実装上の動作を確認: ${userProvidedExamples.size}\n` +
  `- LEGO Education SPIKE 3.6.1の個別ブロック文言を画面で照合した件数: 0 / 109\n` +
  `- 個別の公式文言との一致を未確認として記録: ${opcodes.length}\n\n` +
  `SPIKE 3.6.1 はこのPCのインストール済みアプリ情報と起動ウィンドウのタイトルで確認した。UIのアクセシビリティ表示ではカテゴリ名「モーター」「移動」「ライト」「音」「イベント」「制御」「センサー」「演算」「変数」「マイブロック」を確認したが、個々のブロック文言の全件照合はしていない。そのため、以下の各行を公式訳と一致すると主張しない。機能差があるブロックは公式アプリに一対一対応するという前提を置かず、未照合に分類する。\n\n` +
  `ユーザーから提示された7件の日本語表示例は書き起こしとして照合した。6件は対応ブロックの動作と入力が一致するため同じ文言を採用し、` +
  `「[PORT] 位置」だけは、Essentialの値がmode 2 POS（累積相対角度）でAPOSではないことを明確にするため「[PORT] の回転位置（度）」に調整した。` +
  `この7件をLEGO公式SPIKEアプリの実画面で個別確認したという意味ではない。公式API・プロトコル資料は動作・値の意味の確認に用い、UI文言の根拠とは分ける。\n\n` +
  `## 参照元の区別\n\n` +
  `- ユーザー提供の表示例: 下表に「ユーザー提供の書き起こし」と明示。画面上の完全一致は独立確認していない。\n` +
  `- LEGO一次資料: [SPIKE Prime Hub API](https://lego.github.io/MINDSTORMS-Robot-Inventor-hub-API/) と [LEGO Wireless Protocol](https://lego.github.io/lego-ble-wireless-protocol-docs/) を該当するハードウェア機能・値の意味の参考にした。109 opcodeの全機能を個別に一次資料で確認したという主張ではなく、これらの資料は日本語ブロック文字列の根拠でもない。\n` +
  `- 公式アプリ個別UI照合: 現在0/109。未確認の文言を公式訳として扱わない。\n\n` +
  `## opcode別ラベル\n\n` +
  `| Opcode | 英語ラベル | 変更前の日本語 | 現在の日本語 | 今回の変更 | 機能比較 | ユーザー提供例との対応 | LEGO公式アプリ3.6.1個別UI |\n` +
  `| --- | --- | --- | --- | --- | --- | --- | --- |\n` +
  opcodes
    .map((opcode) => {
      const oldLabel = before.get(opcode) ?? "（ベースラインに未登録）";
      const newLabel = japanese.get(opcode);
      const functionRelation = brickwrightSpecific.has(opcode)
        ? "Brickwright固有の接続・診断・開発連携。公式ブロックとの1:1対応は主張しない"
        : "ハードウェア概念は公式カテゴリにもあるが、個別ラベル・引数・動作は未照合";
      const example = userProvidedExamples.get(opcode);
      const exampleCell = example
        ? `ユーザー提供の書き起こし「${example.label}」; ${example.status}。${example.behavior}`
        : "該当例なし";
      const officialCell = "個別画面・表示文言の照合なし";
      return `| ${escapeCell(opcode)} | ${escapeCell(english.get(opcode))} | ${escapeCell(oldLabel)} | ${escapeCell(newLabel)} | ${oldLabel === newLabel ? "変更なし" : "訳語改善"} | ${escapeCell(functionRelation)} | ${escapeCell(exampleCell)} | ${officialCell} |`;
    })
    .join("\n") +
  `\n`;

fs.writeFileSync(auditPath, content, "utf8");
console.log(
  `Wrote ${opcodes.length} opcode rows (${changedCount} label changes); official per-block comparisons remain explicitly unverified.`
);

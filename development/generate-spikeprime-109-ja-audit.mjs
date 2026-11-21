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

// Independently observed Japanese app/help evidence from the installed LEGO
// Education SPIKE 3.6.1 assembly. This map intentionally describes only the
// seven user-requested examples. Other bundled help IDs were not crosswalked
// to all 109 Brickwright opcodes.
const officialUiEvidence = new Map([
  [
    "motorStop",
    {
      sourceId: "flippermotor_motorStop (ja-jp app_page)",
      status:
        "exact: port dropdown plus rendered Blockly suffix ‘のモーターを停止する’",
      behavior:
        "Official help describes immediate braking without holding. Brickwright uses the configured stop action (default brake), so behavior differs when configured as coast or hold.",
    },
  ],
  [
    "motorSetSpeed",
    {
      sourceId: "flippermotor_motorSetSpeed (ja-jp app_page)",
      status:
        "partial: rendered ‘のスピードを’ + ‘％にする’; percentage glyph/spacing differs from the user example; help title ‘モータースピードを＿％にする’",
      behavior:
        "Both set speed for subsequent motor actions rather than starting the motor in this block. Official help specifies -100..100 and 75% default; Brickwright stores a setting for later motor commands.",
    },
  ],
  [
    "getPosition",
    {
      sourceId: "flippermotor_absolutePosition (ja-jp app_page)",
      status:
        "help-only: page title ‘モーター位置’; exact rendered block label not established",
      behavior:
        "Official help describes absolute position in 0..359 degrees. Brickwright Prime uses normalized position, but Essential returns cumulative mode-2 POS and has no APOS. The adapted label intentionally does not promise absolute position.",
    },
  ],
  [
    "setVolume",
    {
      sourceId:
        "sound_volume (ja-jp app asset; not a Brickwright SPIKE opcode)",
      status:
        "partial/help-only: rendered label has ‘音量を’ and ‘％にする’; no direct SPIKE extension opcode match",
      behavior:
        "The source is the app's sound_volume block; its output target/sound-engine scope is not established as equal to Brickwright's hub volume command. Functional equivalence remains unknown.",
    },
  ],
  [
    "getTimer",
    {
      sourceId: "flippersensors_timer (ja-jp app_page)",
      status: "exact: rendered Blockly label ‘タイマー’",
      behavior:
        "Official help describes elapsed program time in seconds. Brickwright reports elapsed seconds from timer state; reporter behavior aligns.",
    },
  ],
  [
    "resetTimer",
    {
      sourceId: "flippersensors_resetTimer (ja-jp app_page)",
      status: "exact: rendered label and page title ‘タイマーリセット’",
      behavior:
        "Both reset the elapsed timer used by the corresponding timer reporter.",
    },
  ],
  [
    "resetYaw",
    {
      sourceId: "flippersensors_resetYaw (ja-jp app_page)",
      status:
        "exact: rendered Blockly label ‘ヨー角を0に設定’; help title adds ‘ハブの’",
      behavior:
        "Both set Prime hub yaw to zero; Essential does not implement this capability.",
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
const officialExactCount = [...officialUiEvidence.values()].filter((entry) =>
  entry.status.startsWith("exact:")
).length;
const officialPartialCount = [...officialUiEvidence.values()].filter((entry) =>
  entry.status.startsWith("partial")
).length;
const officialHelpOnlyCount = [...officialUiEvidence.values()].filter((entry) =>
  entry.status.startsWith("help-only:")
).length;
const officialUnverifiedCount = opcodes.length - officialUiEvidence.size;
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
  `- LEGO Education SPIKE 3.6.1アプリ資産の個別照合: exact ${officialExactCount}, partial ${officialPartialCount}, help-only ${officialHelpOnlyCount}\n` +
  `- アプリ資産のopcode別照合が未完了: ${officialUnverifiedCount} / 109\n` +
  `- 公式アプリ全109ブロックとの一括照合は未実施\n\n` +
  `SPIKE 3.6.1はインストール済みアプリのファイル版で確認した。日本語UIの根拠には` +
  `C:\\Program Files\\SPIKE\\LEGO Education SPIKE.dll に埋め込まれた ja-jp のヘルプページと描画済みBlockly SVGを読み取り専用で確認した。` +
  `これは特定バージョンの内部データであり、公開された安定API・翻訳カタログではない。` +
  `全109件を照合できる正規のローカライズ資産があるとは確認できていない。\n\n` +
  `ユーザーから提示された7件の日本語表示例は書き起こしとして照合した。6件は同じ文言を採用し、` +
  `「[PORT] 位置」だけは、Essentialの値がmode 2 POS（累積相対角度）でAPOSではないことを明確にするため「[PORT] の回転位置（度）」に調整した。` +
  `公式アプリ資産で直接表示を確認できた例とヘルプページだけ確認できた例を、下表で分けた。` +
  `ユーザー提供の書き起こしとアプリに描画されたラベルは別の根拠として記録し、` +
  `標準アプリのブロックとBrickwrightのハブ向け命令で対象や挙動が違う場合は機能差を記載する。\n\n` +
  `## 参照元の区別\n\n` +
  `- ユーザー提供の表示例: 下表に「ユーザー提供の書き起こし」と明示。画面上の完全一致は独立確認していない。\n` +
  `- LEGO一次資料: [SPIKE Prime Hub API](https://lego.github.io/MINDSTORMS-Robot-Inventor-hub-API/) と [LEGO Wireless Protocol](https://lego.github.io/lego-ble-wireless-protocol-docs/) を該当するハードウェア機能・値の意味の参考にした。109 opcodeの全機能を個別に一次資料で確認したという主張ではなく、これらの資料は日本語ブロック文字列の根拠でもない。\n` +
  `- 内部ヘルプID: 調査時にflipper...形式の項目を89件検出したが、109 opcodeとの全件クロスウォークは未実施。この件数を照合数として扱わない。\n` +
  `- SPIKE 3.6.1アプリ資産: 7件を個別に確認（exact ${officialExactCount}, partial ${officialPartialCount}, help-only ${officialHelpOnlyCount}）。他の102 opcodeは今回の資産との対応が未照合で、公式訳とは扱わない。\n\n` +
  `## opcode別ラベル\n\n` +
  `| Opcode | 英語ラベル | 変更前の日本語 | 現在の日本語 | 今回の変更 | ユーザー提供例との対応 | 公式3.6.1資産ID・証拠 | 動作の一致・差異 |\n` +
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
      const evidence = officialUiEvidence.get(opcode);
      const officialCell = evidence
        ? `${evidence.sourceId}; ${evidence.status}`
        : "未照合（このopcodeの個別UI資産を未確認）";
      const behaviorCell = evidence
        ? evidence.behavior
        : `${functionRelation}。個別の公式機能比較は未実施。`;
      return `| ${escapeCell(opcode)} | ${escapeCell(english.get(opcode))} | ${escapeCell(oldLabel)} | ${escapeCell(newLabel)} | ${oldLabel === newLabel ? "変更なし" : "訳語改善"} | ${escapeCell(exampleCell)} | ${escapeCell(officialCell)} | ${escapeCell(behaviorCell)} |`;
    })
    .join("\n") +
  `\n`;

fs.writeFileSync(auditPath, content, "utf8");
console.log(
  `Wrote ${opcodes.length} opcode rows (${changedCount} label changes); independently checked app assets: exact ${officialExactCount}, partial ${officialPartialCount}, help-only ${officialHelpOnlyCount}, unverified ${officialUnverifiedCount}.`
);

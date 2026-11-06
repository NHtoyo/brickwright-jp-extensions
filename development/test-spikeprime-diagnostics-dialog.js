// Exercise the SPIKE diagnostics dialog without connecting to a hub.
// Copy and download tests use a long UTF-8 JSON document to catch truncation.

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(
  fileURLToPath(
    new URL(
      "../extensions/CrispStrobe/legospike_turbowarp_transpile.js",
      import.meta.url
    )
  ),
  "utf8"
);

class FakeElement {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase();
    this.document = document;
    this.children = [];
    this.listeners = new Map();
    this.attributes = {};
    this.style = {};
    this.parentNode = null;
    this.textContent = "";
    this.value = "";
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parentNode = null;
    return child;
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  focus() {
    this.document.activeElement = this;
  }

  select() {
    this.selected = true;
  }

  setSelectionRange(start, end) {
    this.selectionRange = [start, end];
  }

  click() {
    this.clicked = true;
    if (this.tagName === "A") this.document.downloads.push(this);
    for (const callback of this.listeners.get("click") || []) {
      callback({ target: this, preventDefault() {} });
    }
  }
}

const findElement = (root, predicate) => {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const result = findElement(child, predicate);
    if (result) return result;
  }
  return null;
};

const createHarness = ({
  language = "ja-JP",
  clipboard,
  execCommand = () => false,
} = {}) => {
  const document = {
    body: null,
    activeElement: null,
    downloads: [],
    createElement(tagName) {
      return new FakeElement(tagName, this);
    },
    execCommand,
  };
  document.body = document.createElement("body");

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
    document,
    navigator: {
      language,
      languages: [language],
      ...(clipboard ? { clipboard } : {}),
    },
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout: (callback) => {
      callback();
      return 0;
    },
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    TextEncoder,
    Blob,
    URL: {
      createObjectURL: (blob) => {
        context.savedBlob = blob;
        return "blob:fake-spike-diagnostics";
      },
      revokeObjectURL: (url) => {
        context.revokedObjectUrl = url;
      },
    },
    btoa,
    atob,
    Date,
    Promise,
  });

  vm.runInContext(source, context);
  assert.ok(extension, "SPIKE extension registers in the fake Scratch runtime");
  return { context, document, extension };
};

const diagnostics = {
  protocol: "spike3",
  connected: false,
  firmwareVersion: "1.6.62",
  controllerStatus: "startup-error",
  recentConsoleOutput: `起動ログ ${"x".repeat(60000)} END_MARKER_日本語`,
  recentEvents: [{ type: "program-stopped", message: "startup failure" }],
};

const copiedValues = [];
const harness = createHarness({
  clipboard: {
    writeText(value) {
      copiedValues.push(value);
      return Promise.resolve();
    },
  },
});
const { context, document, extension } = harness;
let diagnosticsReadCount = 0;
extension._peripheral.getCommunicationDiagnostics = () => {
  diagnosticsReadCount++;
  return diagnostics;
};

const forbiddenCalls = [];
for (const name of [
  "connectHub",
  "disconnectHub",
  "installHubController",
  "sendCommand",
  "sendPythonCommand",
  "sendPythonCommandRaw",
]) {
  if (typeof extension[name] === "function") {
    extension[name] = () => {
      forbiddenCalls.push(name);
      throw new Error(`diagnostics UI must not call ${name}`);
    };
  }
  if (typeof extension._peripheral[name] === "function") {
    extension._peripheral[name] = () => {
      forbiddenCalls.push(`peripheral.${name}`);
      throw new Error(`diagnostics UI must not call peripheral.${name}`);
    };
  }
}

const blocks = extension.getInfo().blocks;
const findBlock = (opcode) => blocks.find((block) => block.opcode === opcode);
assert.equal(findBlock("getCommunicationDiagnostics").blockType, "REPORTER");
assert.equal(
  findBlock("getCommunicationDiagnosticsSummary").blockType,
  "REPORTER"
);
assert.equal(findBlock("openCommunicationDiagnosticsLog").blockType, "COMMAND");
assert.equal(
  findBlock("openCommunicationDiagnosticsLog").text,
  "通信診断ログを開く"
);

extension.openCommunicationDiagnosticsLog();
const dialog = findElement(
  document.body,
  (element) => element.attributes.role === "dialog"
);
assert.ok(dialog, "diagnostic command opens a dedicated dialog");
assert.equal(dialog.attributes["aria-modal"], "true");
assert.equal(dialog.attributes["aria-label"], "SPIKE Prime 通信診断ログ");
const textarea = findElement(
  dialog,
  (element) => element.tagName === "TEXTAREA"
);
assert.ok(textarea.readOnly, "diagnostic JSON can be selected but not edited");
assert.equal(textarea.style.backgroundColor, "#f9fafb");
assert.equal(textarea.style.color, "#111827");
assert.equal(textarea.style.colorScheme, "light");
assert.equal(textarea.style.border, "1px solid #d1d5db");
assert.deepEqual(JSON.parse(textarea.value), diagnostics);
assert.ok(textarea.value.startsWith('{\n  "protocol"'), "JSON is indented");
assert.ok(textarea.value.endsWith("\n}"), "the full JSON value is present");

const copyButton = findElement(
  dialog,
  (element) =>
    element.tagName === "BUTTON" && element.textContent === "JSON全文をコピー"
);
assert.ok(copyButton, "Japanese full JSON copy button is present");
await copyButton.listeners.get("click")[0]({
  target: copyButton,
  preventDefault() {},
});
assert.equal(copiedValues.length, 1);
assert.equal(
  copiedValues[0],
  textarea.value,
  "copy writes the complete JSON without truncation"
);
assert.ok(
  copiedValues[0].includes('END_MARKER_日本語",\n  "recentEvents"'),
  "copy preserves the final characters before the following JSON field"
);

const saveButton = findElement(
  dialog,
  (element) =>
    element.tagName === "BUTTON" && element.textContent === "JSONファイルを保存"
);
assert.ok(saveButton, "Japanese JSON save button is present");
saveButton.click();
assert.ok(context.savedBlob, "save creates a downloadable blob");
assert.equal(context.savedBlob.type, "application/json;charset=utf-8");
const downloadedJson = await context.savedBlob.text();
assert.deepEqual(JSON.parse(downloadedJson), diagnostics);
assert.ok(downloadedJson.includes("END_MARKER_日本語"));
const downloadLink = document.downloads.at(-1);
assert.equal(
  downloadLink.download,
  "spikeprime-communication-diagnostics.json"
);

assert.equal(
  diagnosticsReadCount,
  1,
  "the dialog reads the local diagnostic snapshot once"
);
assert.deepEqual(
  forbiddenCalls,
  [],
  "opening, copying, and saving send no hub commands"
);
assert.equal(context.revokedObjectUrl, "blob:fake-spike-diagnostics");

const manualCopyHarness = createHarness();
manualCopyHarness.extension._peripheral.getCommunicationDiagnostics = () =>
  diagnostics;
manualCopyHarness.extension.openCommunicationDiagnosticsLog();
const manualDialog = findElement(
  manualCopyHarness.document.body,
  (element) => element.attributes.role === "dialog"
);
const manualTextarea = findElement(
  manualDialog,
  (element) => element.tagName === "TEXTAREA"
);
const manualCopyButton = findElement(
  manualDialog,
  (element) =>
    element.tagName === "BUTTON" && element.textContent === "JSON全文をコピー"
);
await manualCopyButton.listeners.get("click")[0]({
  target: manualCopyButton,
  preventDefault() {},
});
assert.equal(
  manualTextarea.selected,
  true,
  "fallback selects the entire textarea for manual copy"
);
assert.deepEqual(manualTextarea.selectionRange, [
  0,
  manualTextarea.value.length,
]);
const manualStatus = findElement(
  manualDialog,
  (element) => element.attributes.role === "status"
);
assert.match(manualStatus.textContent, /Ctrl\+C/);

const englishHarness = createHarness({ language: "en-US" });
const englishBlocks = englishHarness.extension.getInfo().blocks;
assert.equal(
  englishBlocks.find(
    (block) => block.opcode === "openCommunicationDiagnosticsLog"
  ).text,
  "open communication diagnostics log"
);
englishHarness.extension._peripheral.getCommunicationDiagnostics = () =>
  diagnostics;
englishHarness.extension.openCommunicationDiagnosticsLog();
const englishDialog = findElement(
  englishHarness.document.body,
  (element) => element.attributes.role === "dialog"
);
assert.equal(
  englishDialog.attributes["aria-label"],
  "SPIKE Prime communication diagnostics"
);
assert.ok(
  findElement(
    englishDialog,
    (element) =>
      element.tagName === "BUTTON" && element.textContent === "Copy full JSON"
  )
);

const closeButton = findElement(
  dialog,
  (element) => element.tagName === "BUTTON" && element.textContent === "閉じる"
);
closeButton.click();
assert.equal(
  document.body.children.includes(dialog),
  false,
  "close removes the dialog"
);
assert.equal(extension._diagnosticsDialog, null);

console.log(
  "SPIKE diagnostics dialog, complete clipboard copy, UTF-8 JSON download, localization and no-send behavior passed (fake DOM; no hub connection)."
);

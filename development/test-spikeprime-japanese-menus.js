// Verify Japanese SPIKE menu text without opening Bluetooth or connecting to a hub.
// The saved field values are checked separately so localization cannot change projects.

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../extensions/CrispStrobe/legospike_turbowarp_transpile.js", import.meta.url),
  "utf8"
);

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
  navigator: { language: "ja-JP", languages: ["ja-JP"] },
  console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
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

vm.runInContext(source, context);
assert.ok(extension, "SPIKE extension registers in the fake Scratch environment");

const info = extension.getInfo();
const menu = info.menus;
const values = (name) => JSON.parse(JSON.stringify(menu[name].items));

assert.deepEqual(values("MOTOR_UNIT"), [
  { text: "回転", value: "rotations" },
  { text: "度", value: "degrees" },
  { text: "秒", value: "seconds" },
]);
assert.deepEqual(values("COLOR"), [
  { text: "赤", value: "red" },
  { text: "緑", value: "green" },
  { text: "青", value: "blue" },
  { text: "黄", value: "yellow" },
  { text: "シアン", value: "cyan" },
  { text: "マゼンタ", value: "magenta" },
  { text: "白", value: "white" },
  { text: "黒", value: "black" },
]);
assert.deepEqual(values("MOVE_DIRECTION"), [
  { text: "前進", value: "forward" },
  { text: "後退", value: "backward" },
]);
assert.deepEqual(values("BUTTON"), [
  { text: "左", value: "left" },
  { text: "中央", value: "center" },
  { text: "右", value: "right" },
  { text: "接続", value: "connect" },
]);
assert.deepEqual(values("FORCE_STATE"), [
  { text: "押されている", value: "pressed" },
  { text: "強く押されている", value: "hard pressed" },
  { text: "離されている", value: "released" },
]);
assert.deepEqual(values("DISPLAY_PATTERN").map((item) => item.value), [
  "heart", "smile", "sad", "angry", "surprised", "wink", "arrow_up", "arrow_down",
  "arrow_left", "arrow_right", "check", "x", "square", "triangle", "diamond", "plus",
  "minus", "dot", "frame", "spiral",
]);
assert.deepEqual(values("MATRIX_COLOR_EMOJI").map((item) => item.value), [
  "⚫", "🟣", "🟪", "🔵", "🔷", "🟢", "🟩", "🟡", "🟠", "🔴", "⚪",
]);

console.log("SPIKE Japanese menu labels and saved values passed (fake Scratch; no hub connection).");

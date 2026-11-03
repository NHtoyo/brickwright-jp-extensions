// Fake-WebBluetooth coverage for the unified SPIKE extension. This test never
// opens a browser chooser or accesses a physical hub.
//
// Wire layouts below follow LEGO's published SPIKE Prime protocol:
// https://lego.github.io/spike-prime-docs/connect.html
// https://lego.github.io/spike-prime-docs/messages.html
// https://lego.github.io/spike-prime-docs/encoding.html
//
//   node development/test-spikeprime-transport.js

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.join(here, "../extensions/CrispStrobe/legospike_turbowarp_transpile.js"),
  "utf8"
);

class FakeClock {
  constructor() {
    this._next = 1;
    this._now = 1000;
    this._tasks = new Map();
  }

  setTimeout(callback, delay = 0) {
    const id = this._next++;
    this._tasks.set(id, { callback, due: this._now + Number(delay) });
    return id;
  }

  clearTimeout(id) {
    this._tasks.delete(id);
  }

  advance(milliseconds) {
    this._now += milliseconds;
    while (true) {
      const next = [...this._tasks.entries()]
        .filter(([, task]) => task.due <= this._now)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      this._tasks.delete(next[0]);
      next[1].callback();
    }
  }
}

class FakeRuntime {
  static PERIPHERAL_CONNECTED = "peripheral-connected";
  static PERIPHERAL_DISCONNECTED = "peripheral-disconnected";
  static PERIPHERAL_LIST_UPDATE = "peripheral-list-update";
  static USER_PICKED_PERIPHERAL = "user-picked-peripheral";
  static PERIPHERAL_SCAN_TIMEOUT = "peripheral-scan-timeout";
  static PERIPHERAL_REQUEST_ERROR = "peripheral-request-error";
  static PERIPHERAL_CONNECTION_LOST_ERROR = "peripheral-connection-lost-error";

  constructor() {
    this.events = [];
    this.listeners = new Map();
  }

  emit(event, payload) {
    this.events.push({ event, payload });
    for (const callback of this.listeners.get(event) || []) callback(payload);
  }

  on(event, callback) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.push(callback);
    this.listeners.set(event, callbacks);
  }

  registerPeripheralExtension(id, peripheral) {
    this.peripheral = { id, peripheral };
  }
}

class FakeCharacteristic {
  constructor({ writes = null, failNextWrite = false } = {}) {
    this.writes = writes;
    this.failNextWrite = failNextWrite;
    this.listeners = new Map();
  }

  startNotifications() {
    this.notificationsStarted = true;
    return Promise.resolve(this);
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  removeEventListener(name, callback) {
    this.listeners.set(
      name,
      (this.listeners.get(name) || []).filter(
        (listener) => listener !== callback
      )
    );
  }

  writeValueWithoutResponse(bytes) {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error("simulated fake-device write failure");
    }
    this.writes.push(Array.from(bytes));
    return Promise.resolve();
  }

  emit(bytes, byteOffset = 3) {
    const padded = new Uint8Array(byteOffset + bytes.length + 2);
    padded.set(bytes, byteOffset);
    const value = new DataView(padded.buffer, byteOffset, bytes.length);
    const event = { target: { value } };
    for (const callback of this.listeners.get("characteristicvaluechanged") ||
      []) {
      callback(event);
    }
  }
}

class FakeHubDevice {
  constructor() {
    this.listeners = new Map();
    this.writes = [];
    this.rx = new FakeCharacteristic({ writes: this.writes });
    this.tx = new FakeCharacteristic();
    this.gatt = {
      connected: false,
      connect: () => {
        this.gatt.connected = true;
        return Promise.resolve(this.gatt);
      },
      disconnect: () => {
        this.gatt.connected = false;
        this.dispatch("gattserverdisconnected", {});
      },
      getPrimaryService: (uuid) => {
        assert.equal(uuid, "0000fd02-0000-1000-8000-00805f9b34fb");
        return Promise.resolve({
          getCharacteristic: (characteristicUUID) => {
            if (characteristicUUID === "0000fd02-0001-1000-8000-00805f9b34fb") {
              return Promise.resolve(this.rx);
            }
            assert.equal(
              characteristicUUID,
              "0000fd02-0002-1000-8000-00805f9b34fb"
            );
            return Promise.resolve(this.tx);
          },
        });
      },
    };
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  removeEventListener(name, callback) {
    this.listeners.set(
      name,
      (this.listeners.get(name) || []).filter(
        (listener) => listener !== callback
      )
    );
  }

  dispatch(name, event) {
    for (const callback of this.listeners.get(name) || []) callback(event);
  }
}

// Independent fixture encoder, intentionally kept outside the production VM.
// It follows LEGO's extended COBS code_word = block + 2 + delimiter * 84.
function packMessage(message) {
  const output = [0xff];
  let codeIndex = 0;
  let blockSize = 1;
  for (const byte of message) {
    if (byte <= 2) {
      output[codeIndex] = blockSize + 2 + byte * 84;
      codeIndex = output.length;
      output.push(0xff);
      blockSize = 1;
    } else {
      output.push(byte);
      blockSize++;
      if (blockSize > 84) {
        codeIndex = output.length;
        output.push(0xff);
        blockSize = 1;
      }
    }
  }
  output[codeIndex] = blockSize + 2;
  return Uint8Array.from([...output.map((byte) => byte ^ 3), 2]);
}

function unpackMessage(frame) {
  assert.equal(frame.at(-1), 2, "wire message has a 0x02 delimiter");
  const encoded = Array.from(frame.slice(0, -1), (byte) => byte ^ 3);
  const decoded = [];
  let offset = 0;
  while (offset < encoded.length) {
    const code = encoded[offset++];
    assert.ok(code > 2, "COBS code is not reserved");
    const adjusted = code === 0xff ? null : code - 3;
    const delimiter = adjusted === null ? null : Math.floor(adjusted / 84);
    const blockSize = adjusted === null ? 84 : adjusted % 84;
    assert.ok(delimiter === null || delimiter <= 2, "COBS delimiter is valid");
    assert.ok(offset + blockSize <= encoded.length, "COBS block is complete");
    for (let i = 0; i < blockSize; i++) decoded.push(encoded[offset++]);
    if (delimiter !== null && offset < encoded.length) decoded.push(delimiter);
  }
  return decoded;
}

function infoResponse() {
  // InfoResponse fields per messages.html: RPC 2.42, firmware 1.6.62,
  // packet size 64, message size 100, chunk size 50, SPIKE Prime product 0.
  return Uint8Array.from([
    0x01, 2, 0, 42, 0, 1, 6, 62, 0, 64, 0, 100, 0, 50, 0, 0, 0,
  ]);
}

function notification(payload) {
  return Uint8Array.from([
    0x3c,
    payload.length & 0xff,
    payload.length >> 8,
    ...payload,
  ]);
}

function imuRecord({ yaw = 0, pitch = 0, roll = 0 } = {}) {
  const bytes = new Uint8Array(21);
  bytes[0] = 0x01;
  bytes[1] = 0; // Hub face up: top.
  bytes[2] = 0; // Configured yaw face: top.
  const view = new DataView(bytes.buffer);
  view.setInt16(3, yaw, true);
  view.setInt16(5, pitch, true);
  view.setInt16(7, roll, true);
  return bytes;
}

function motorRecord({
  port = 0,
  absolute = -37,
  speed = -12,
  position = -123456,
} = {}) {
  const bytes = new Uint8Array(12);
  bytes[0] = 0x0a;
  bytes[1] = port;
  bytes[2] = 0x31; // Large motor.
  const view = new DataView(bytes.buffer);
  view.setInt16(3, absolute, true);
  view.setInt16(5, -500, true);
  bytes[7] = speed & 0xff;
  view.setInt32(8, position, true);
  return bytes;
}

function bytes(...parts) {
  return Uint8Array.from(parts.flatMap((part) => Array.from(part)));
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup({ failRequestWrite = false, locale = "en" } = {}) {
  const clock = new FakeClock();
  const runtime = new FakeRuntime();
  const device = new FakeHubDevice();
  const bluetooth = {
    requests: [],
    requestDevice: (options) => {
      bluetooth.requests.push(options);
      return Promise.resolve(device);
    },
  };
  const rxWrite = device.rx.writeValueWithoutResponse.bind(device.rx);
  device.rx.writeValueWithoutResponse = async (packet) => {
    const decoded = unpackMessage(packet);
    if (failRequestWrite && decoded[0] === 0x28) device.rx.failNextWrite = true;
    await rxWrite(packet);
  };
  const context = vm.createContext({
    Scratch: {
      vm: { runtime },
      extensions: {
        unsandboxed: true,
        register: (extension) => (context.extension = extension),
      },
      ArgumentType: new Proxy({}, { get: (_target, key) => String(key) }),
      BlockType: new Proxy({}, { get: (_target, key) => String(key) }),
      Cast: {
        toString: (value) => String(value),
        toNumber: (value) =>
          Number.isFinite(Number(value)) ? Number(value) : 0,
        toBoolean: Boolean,
      },
    },
    navigator: { language: locale, languages: [locale], bluetooth },
    window: {
      setTimeout: clock.setTimeout.bind(clock),
      clearTimeout: clock.clearTimeout.bind(clock),
      addEventListener() {},
    },
    document: { documentElement: { lang: locale } },
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    setInterval: () => 0,
    clearInterval: () => {},
    TextEncoder,
    TextDecoder,
    DataView,
    Uint8Array,
    Date,
    Promise,
    btoa,
    atob,
  });
  vm.runInContext(source, context);
  assert.ok(context.extension, "extension registered");
  const ext = context.extension;
  ext._peripheral.setMode("web-ble");
  return { clock, runtime, device, bluetooth, ext, failRequestWrite };
}

async function connect(setupResult) {
  await setupResult.ext._peripheral.scan();
  await tick();
  const { device, ext } = setupResult;
  assert.equal(
    device.tx.notificationsStarted,
    true,
    "TX notifications enabled"
  );
  assert.equal(ext.isConnected(), true, "fake hub connected");
  assert.deepEqual(unpackMessage(Uint8Array.from(device.writes[0])), [0x00]);
  device.tx.emit(packMessage(infoResponse()));
  await tick();
  assert.equal(ext.getFirmwareVersion(), "1.6.62");
  await tick();
  if (!setupResult.failRequestWrite) {
    assert.deepEqual(
      unpackMessage(Uint8Array.from(device.writes[1])),
      [0x28, 100, 0],
      "the hub is asked for 100 ms device notifications"
    );
  }
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("Web Bluetooth requests notifications and records the hub acknowledgement", async () => {
  const state = setup();
  await connect(state);
  assert.equal(state.ext.getConnectionMode(), "web-ble");
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).notificationRequest
      .status,
    "pending"
  );
  state.device.tx.emit(packMessage([0x29, 0x00]));
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.notificationRequest.status, "acknowledged");
  assert.equal(diagnostics.notificationRequest.responseCode, 0);

  await state.ext._peripheral._spike3.setDeviceNotifications(true);
  state.device.tx.emit(packMessage([0x29, 0x01]));
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).notificationRequest
      .status,
    "not-acknowledged"
  );
});

test("IMU values decode signed angles and distinguish received zero from no data", async () => {
  const state = setup();
  await connect(state);
  const hub = state.ext._peripheral._spike3;
  let diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.imuNotificationCount, 0);
  assert.equal(diagnostics.lastImuReceivedAt, null);

  state.device.tx.emit(packMessage(notification(imuRecord())));
  diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.imuNotificationCount, 1);
  assert.ok(diagnostics.lastImuReceivedAt > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(hub.angle)), {
    pitch: 0,
    roll: 0,
    yaw: 0,
  });

  state.device.tx.emit(
    packMessage(notification(imuRecord({ yaw: -123, pitch: 45, roll: -6 })))
  );
  assert.deepEqual(JSON.parse(JSON.stringify(hub.angle)), {
    pitch: 45,
    roll: -6,
    yaw: -123,
  });
});

test("motor position and 5x5 matrix records are parsed from one notification", async () => {
  const state = setup();
  await connect(state);
  const pixels = Uint8Array.from({ length: 25 }, (_, index) => index);
  state.device.tx.emit(
    packMessage(notification(bytes(motorRecord(), [0x02], pixels)))
  );
  const hub = state.ext._peripheral._spike3;
  assert.equal(hub.portValues.A.relativePosition, -123456);
  assert.equal(hub.portValues.A.speed, -12);
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.motorNotificationCount, 1);
  assert.equal(diagnostics.matrix5x5NotificationCount, 1);
  assert.deepEqual(diagnostics.lastMatrix5x5, Array.from(pixels));
});

test("split COBS frames and multiple frames in one BLE notification are reassembled", async () => {
  const state = setup();
  await connect(state);
  const frame = packMessage(
    notification(imuRecord({ yaw: 12, pitch: 34, roll: 56 }))
  );
  state.device.tx.emit(frame.slice(0, 4));
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).imuNotificationCount,
    0
  );
  state.device.tx.emit(frame.slice(4));
  const second = packMessage(
    notification(imuRecord({ yaw: 78, pitch: 90, roll: 12 }))
  );
  const third = packMessage([0x21, 0x4f, 0x4b]);
  state.device.tx.emit(bytes(second, third));
  const hub = state.ext._peripheral._spike3;
  assert.deepEqual(JSON.parse(JSON.stringify(hub.angle)), {
    pitch: 90,
    roll: 12,
    yaw: 78,
  });
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).imuNotificationCount,
    2
  );
  assert.equal(hub.replOutput, "OK");
});

test("broken frames, malformed sizes, and unknown records are diagnosed and recovery continues", async () => {
  const state = setup();
  await connect(state);
  state.device.tx.emit(Uint8Array.from([0x03, 0x02])); // Unescaped control byte.
  state.device.tx.emit(Uint8Array.from([0x00, 0x02])); // Decodes to an empty message.
  state.device.tx.emit(packMessage([0x3c, 0x02, 0x00, 0x01])); // Declares 2 bytes, has 1.
  state.device.tx.emit(
    packMessage(notification(Uint8Array.from([0x7f, 0xaa])))
  );
  state.device.tx.emit(packMessage(notification(imuRecord({ yaw: 8 }))));
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.cobsDecodeFailureCount, 1);
  assert.equal(diagnostics.malformedMessageCount, 1);
  assert.equal(diagnostics.malformedNotificationCount, 1);
  assert.equal(diagnostics.unsupportedRecordCount, 1);
  assert.equal(diagnostics.imuNotificationCount, 1);
  assert.match(
    diagnostics.lastCommunicationError,
    /unsupported device record/i
  );
});

test("a missing notification acknowledgement times out without a hardware write", async () => {
  const state = setup();
  await connect(state);
  state.clock.advance(2001);
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).notificationRequest
      .status,
    "timeout"
  );
  assert.equal(
    state.device.writes.length,
    2,
    "timeout sends no additional command"
  );
});

test("disconnect clears the partial frame and reconnect starts a fresh diagnostic session", async () => {
  const state = setup();
  await connect(state);
  state.device.tx.emit(
    packMessage(notification(imuRecord({ pitch: 10 }))).slice(0, 5)
  );
  state.device.gatt.disconnect();
  assert.equal(state.ext.isConnected(), false);
  await state.ext._peripheral.scan();
  await tick();
  const latest = state.device.tx;
  latest.emit(packMessage(infoResponse()));
  await tick();
  latest.emit(packMessage(notification(imuRecord({ pitch: 20 }))));
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.imuNotificationCount, 1);
  assert.equal(state.ext._peripheral._spike3.angle.pitch, 20);
});

test("a fake-device write failure is surfaced in diagnostics", async () => {
  const state = setup({ failRequestWrite: true });
  await connect(state);
  await tick();
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.notificationRequest.status, "write-error");
  assert.match(
    diagnostics.lastCommunicationError,
    /simulated fake-device write failure/
  );
});

test("SPIKE 3.x native unsupported commands reject; Python tunnel encoding follows the documented frame", async () => {
  const state = setup();
  await connect(state);
  const hub = state.ext._peripheral._spike3;
  await assert.rejects(
    hub.sendCommand("scratch.display_text", { text: "Hello" }),
    /no native/
  );
  const before = state.device.writes.length;
  await hub.sendPythonCommand('import hub; hub.display.show("Hello")');
  await tick();
  const tunnel = unpackMessage(Uint8Array.from(state.device.writes[before]));
  assert.equal(tunnel[0], 0x32);
  const payloadSize = tunnel[1] | (tunnel[2] << 8);
  assert.equal(
    new TextDecoder().decode(Uint8Array.from(tunnel.slice(3))),
    'import hub; hub.display.show("Hello")\r\n'
  );
  assert.equal(payloadSize, tunnel.length - 3);
});

test("SPIKE 3.x display text does not auto-send an unverified Python fallback", async () => {
  const state = setup();
  await connect(state);
  const writesBefore = state.device.writes.length;
  await assert.rejects(
    state.ext.displayText({ TEXT: "Hello" }),
    /has no native/
  );
  await tick();
  assert.equal(
    state.device.writes.length,
    writesBefore,
    "the failed native command and blocked fallback perform no device write"
  );
});

test("REPL display text falls back after native rejection and escapes Python string syntax", async () => {
  const state = setup();
  Object.defineProperty(state.ext._peripheral, "protocol", {
    value: "repl",
  });
  const calls = [];
  state.ext._peripheral.sendCommand = () => Promise.resolve("native");
  state.ext._peripheral.sendPythonCommand = (code) => {
    calls.push(code);
    return Promise.resolve();
  };
  await state.ext.displayText({ TEXT: 'a "quote" and \\ slash\nline' });
  assert.deepEqual(
    calls,
    [],
    "successful native send does not also send Python"
  );

  state.ext._peripheral.sendCommand = () =>
    Promise.reject(new Error("not supported"));
  await state.ext.displayText({ TEXT: 'a "quote" and \\ slash\nline' });
  assert.equal(calls.length, 1);
  const pythonText = 'a "quote" and \\ slash\nline';
  assert.equal(
    calls[0],
    "import hub; hub.display.show(" + JSON.stringify(pythonText) + ")"
  );
});

test("the communication diagnostics block is localized for Japanese", () => {
  const state = setup({ locale: "ja-JP" });
  const block = state.ext
    .getInfo()
    .blocks.find(
      (entry) => entry && entry.opcode === "getCommunicationDiagnostics"
    );
  assert.equal(block.text, "通信診断（JSON）");
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed++;
    console.log(`not ok - ${name}\n  ${error.stack || error}`);
  }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);

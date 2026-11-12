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
import { crc32 } from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const officialTransferVectors = JSON.parse(
  fs.readFileSync(
    path.join(here, "fixtures/spikeprime-official-transfer-vectors.json"),
    "utf8"
  )
);
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
    if (this.failNextWrite || this.writes.length + 1 === this.failWriteNumber) {
      this.failNextWrite = false;
      this.failWriteNumber = null;
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

function unpackWrittenMessages(writes) {
  const messages = [];
  let frame = [];
  for (const packet of writes) {
    for (const byte of packet) {
      frame.push(byte);
      if (byte === 2) {
        messages.push(unpackMessage(Uint8Array.from(frame)));
        frame = [];
      }
    }
  }
  assert.equal(frame.length, 0, "all outbound COBS frames have a delimiter");
  return messages;
}

function bytesFromHex(hex) {
  assert.equal(hex.length % 2, 0, "hex data contains complete bytes");
  return Uint8Array.from(hex.match(/.{2}/g) || [], (byte) =>
    Number.parseInt(byte, 16)
  );
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

async function waitUntil(predicate, message, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(message);
}

function setup({
  failRequestWrite = false,
  failWriteMessageType = null,
  locale = "en",
  developerMode = false,
} = {}) {
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
  let incomingFrame = [];
  device.rx.writeValueWithoutResponse = async (packet) => {
    const completeMessages = [];
    for (const byte of packet) {
      incomingFrame.push(byte);
      if (byte === 2) {
        completeMessages.push(unpackMessage(Uint8Array.from(incomingFrame)));
        incomingFrame = [];
      }
    }
    if (
      failRequestWrite &&
      completeMessages.some((message) => message[0] === 0x28)
    ) {
      device.rx.failNextWrite = true;
    }
    if (
      failWriteMessageType !== null &&
      completeMessages.some((message) => message[0] === failWriteMessageType)
    ) {
      device.rx.failNextWrite = true;
    }
    await rxWrite(packet);
    for (const decoded of completeMessages) {
      if (device.protocolHandler) await device.protocolHandler(decoded);
    }
  };
  const context = vm.createContext({
    Scratch: {
      vm: { runtime },
      extensions: {
        unsandboxed: true,
        register: (extension) => (context.extension = extension),
      },
      BWConfirm: () => true,
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
      location: {
        search: developerMode ? "?spikePrimeDiagnostics=1" : "",
      },
    },
    document: { documentElement: { lang: locale } },
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    setInterval: () => 0,
    clearInterval: () => {},
    alert() {},
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
  return { clock, runtime, device, bluetooth, ext, context, failRequestWrite };
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

test("transfer message builders match byte vectors from the LEGO upstream serializer", () => {
  const hub = setup().ext._peripheral._spike3;
  const messages = officialTransferVectors.messages;
  const asHex = (bytes) => Buffer.from(bytes).toString("hex");

  assert.equal(
    asHex(hub._buildClearSlotRequest(messages.clear_slot_19.slot)),
    messages.clear_slot_19.hex
  );
  assert.equal(
    asHex(
      hub._buildStartFileUploadRequest(
        messages.start_file_upload_brickwright_py.filename,
        messages.start_file_upload_brickwright_py.slot,
        messages.start_file_upload_brickwright_py.crc32
      )
    ),
    messages.start_file_upload_brickwright_py.hex
  );
  assert.equal(
    asHex(
      hub._buildTransferChunkRequest(
        messages.transfer_chunk.running_crc32,
        Uint8Array.from(messages.transfer_chunk.chunk)
      )
    ),
    messages.transfer_chunk.hex
  );
  assert.equal(
    asHex(
      hub._buildProgramFlowRequest(
        messages.program_flow_start_slot_19.stop,
        messages.program_flow_start_slot_19.slot
      )
    ),
    messages.program_flow_start_slot_19.hex
  );

  const crcVectors = officialTransferVectors.crc32;
  const alignedAbc = hub._crc32(Uint8Array.from(crcVectors.aligned_abc.data));
  assert.equal(
    alignedAbc.toString(16).padStart(8, "0"),
    crcVectors.aligned_abc.hex
  );
  const firstChunk = hub._crc32(Uint8Array.from(crcVectors.chunk_1.data));
  assert.equal(
    firstChunk.toString(16).padStart(8, "0"),
    crcVectors.chunk_1.hex
  );
  const secondChunk = hub._crc32(
    Uint8Array.from(crcVectors.chunk_2.data),
    firstChunk
  );
  assert.equal(
    secondChunk.toString(16).padStart(8, "0"),
    crcVectors.chunk_2.hex
  );
});

function crc32Aligned(data, seed = 0) {
  const bytes = Buffer.from(data);
  const padding = (4 - (bytes.length % 4)) % 4;
  return crc32(Buffer.concat([bytes, Buffer.alloc(padding)]), seed);
}

function attachFakeControllerHub(
  state,
  {
    failChunkIndex = -1,
    malformedResponseType = null,
    startNotificationDelayMs = 0,
    suppressStartNotification = false,
    disconnectAfterProgramFlowResponse = false,
    startupConsoleError = null,
    helloResponseDelayMs = 0,
    suppressReadyMarker = false,
    ignoreFirstHellos = 0,
  } = {}
) {
  const { device } = state;
  const slots = new Map([
    [19, Buffer.from("user program, must be confirmed before replacing")],
  ]);
  const controller = {
    slots,
    actions: [],
    currentUpload: null,
    running: false,
    maxChunkSize: 50,
    chunkIndex: 0,
    ignoreCommands: new Set(),
    rejectCommands: new Set(),
    helloCount: 0,
    startNotificationDelayMs,
    helloResponseDelayMs,
  };
  const emit = (message) => device.tx.emit(packMessage(message));
  const status = (type, ok) =>
    emit(
      Uint8Array.from([
        type,
        ok ? 0 : 1,
        ...(type === malformedResponseType ? [0xff] : []),
      ])
    );
  const emitTunnel = (response) => {
    const payload = new TextEncoder().encode(JSON.stringify(response) + "\n");
    emit(
      Uint8Array.from([
        0x32,
        payload.length & 0xff,
        payload.length >> 8,
        ...payload,
      ])
    );
  };

  device.protocolHandler = (message) => {
    const messageBytes = Uint8Array.from(message);
    switch (message[0]) {
      case 0x46: {
        assert.equal(
          message.length,
          2,
          "ClearSlotRequest is exactly two bytes"
        );
        const existed = slots.delete(message[1]);
        status(0x47, existed);
        break;
      }
      case 0x0c: {
        const terminator = message.indexOf(0, 1);
        assert.notEqual(terminator, -1, "filename is NUL-terminated");
        assert.equal(
          message.length,
          terminator + 6,
          "StartFileUploadRequest ends after the NUL name, slot, and CRC"
        );
        const name = Buffer.from(message.slice(1, terminator)).toString("utf8");
        const slot = message[terminator + 1];
        const expectedCrc = new DataView(
          messageBytes.buffer,
          messageBytes.byteOffset
        ).getUint32(terminator + 2, true);
        controller.currentUpload = {
          name,
          slot,
          expectedCrc,
          chunks: [],
          rollingCrc: 0,
        };
        controller.chunkIndex = 0;
        status(0x0d, true);
        break;
      }
      case 0x10: {
        const upload = controller.currentUpload;
        if (!upload) {
          status(0x11, false);
          break;
        }
        const view = new DataView(messageBytes.buffer, messageBytes.byteOffset);
        const runningCrc = view.getUint32(1, true);
        const size = view.getUint16(5, true);
        const chunk = Buffer.from(message.slice(7));
        if (controller.chunkIndex === failChunkIndex) {
          status(0x11, false);
          break;
        }
        if (
          message.length !== 7 + size ||
          size > controller.maxChunkSize ||
          size !== chunk.length
        ) {
          status(0x11, false);
          break;
        }
        const computed = crc32Aligned(chunk, upload.rollingCrc);
        if (computed !== runningCrc) {
          status(0x11, false);
          break;
        }
        upload.rollingCrc = runningCrc;
        upload.chunks.push(chunk);
        controller.chunkIndex++;
        status(0x11, true);
        break;
      }
      case 0x1e: {
        const upload = controller.currentUpload;
        if (
          message.length !== 3 ||
          !upload ||
          message[1] !== 0 ||
          message[2] !== upload.slot
        ) {
          status(0x1f, false);
          break;
        }
        const program = Buffer.concat(upload.chunks);
        if (crc32Aligned(program) !== upload.expectedCrc) {
          status(0x1f, false);
          break;
        }
        const sourceText = program.toString("utf8");
        assert.match(sourceText, /hub\.config\["module_tunnel"\]/);
        assert.match(sourceText, /def _receive\(data\)/);
        assert.match(sourceText, /motor\.run_for_degrees/);
        assert.match(sourceText, /light_matrix\.set_pixel/);
        assert.match(sourceText, /sound\.beep/);
        assert.doesNotMatch(sourceText, /\b(?:eval|exec)\s*\(/);
        slots.set(upload.slot, program);
        controller.running = true;
        status(0x1f, true);
        if (disconnectAfterProgramFlowResponse) {
          device.gatt.disconnect();
          break;
        }
        if (startupConsoleError) {
          const output = new TextEncoder().encode(`${startupConsoleError}\0`);
          emit(Uint8Array.from([0x21, ...output]));
          controller.running = false;
          emit(Uint8Array.from([0x20, 1]));
          break;
        }
        if (!suppressStartNotification) {
          const notifyStarted = () => {
            emit(Uint8Array.from([0x20, 0]));
            if (!suppressReadyMarker) {
              emit(
                Uint8Array.from([
                  0x21,
                  ...new TextEncoder().encode(
                    "BWCTRL:boot:tunnel-callback-registered\n"
                  ),
                ])
              );
            }
          };
          if (startNotificationDelayMs > 0) {
            state.clock.setTimeout(notifyStarted, startNotificationDelayMs);
          } else {
            notifyStarted();
          }
        }
        break;
      }
      case 0x32: {
        const length = message[1] | (message[2] << 8);
        const request = JSON.parse(
          Buffer.from(message.slice(3)).toString("utf8")
        );
        assert.equal(length, Buffer.byteLength(JSON.stringify(request)));
        const names = {
          h: "controller.hello",
          p: "controller.ping",
          x: "controller.stop_all",
          r: "motor.run",
          s: "motor.stop",
          u: "motor.power",
          d: "motor.run_degrees",
          t: "motor.run_time",
          a: "motor.run_to_position",
          l: "matrix.pixel",
          m: "matrix.pattern",
          c: "matrix.clear",
          b: "sound.beep",
          q: "sound.stop",
        };
        const fieldNames = {
          p: "port",
          v: "velocity",
          d: "degrees",
          t: "duration_ms",
          g: "position",
          u: "power",
          x: "x",
          y: "y",
          b: "brightness",
          z: "pixels",
          f: "frequency",
        };
        const action = { cmd: names[request.c] };
        for (const [key, value] of Object.entries(request)) {
          if (key in fieldNames) action[fieldNames[key]] = value;
        }
        if (!controller.running) {
          emitTunnel({
            i: request.i,
            ok: false,
            error: "not_running",
            detail: "controller is not running",
          });
          break;
        }
        if (request.c === "p") {
          emitTunnel({ c: "o", version: 1 });
          break;
        }
        if (request.c === "h") {
          controller.helloCount++;
          if (controller.helloCount <= ignoreFirstHellos) break;
          const acknowledge = () =>
            emitTunnel({ i: request.i, ok: true, result: "bw-spike-1" });
          if (helloResponseDelayMs > 0) {
            state.clock.setTimeout(acknowledge, helloResponseDelayMs);
          } else {
            acknowledge();
          }
          break;
        }
        if (!action.cmd) {
          emitTunnel({
            i: request.i,
            ok: false,
            error: "unsupported",
            detail: "unsupported command",
          });
          break;
        }
        if (controller.ignoreCommands.has(action.cmd)) break;
        if (controller.rejectCommands.has(action.cmd)) {
          emitTunnel({
            i: request.i,
            ok: false,
            error: "execution_failed",
            detail: "simulated motor API failure",
          });
          break;
        }
        controller.actions.push(action);
        emitTunnel({ i: request.i, ok: true });
        break;
      }
      default:
        break;
    }
  };
  return controller;
}

function attachFakeStartupProbeHub(
  state,
  {
    failChunkIndex = -1,
    emitStartNotification = true,
    emitStopNotification = true,
    stopImmediatelyAfterStart = false,
    consoleOutput = "",
    emitProbeMarkers = false,
    naturalCompletion = false,
  } = {}
) {
  const { device } = state;
  const slots = new Map([[7, Buffer.from("existing program in slot 7")]]);
  const fake = {
    slots,
    upload: null,
    running: false,
    programSource: null,
    chunkIndex: 0,
    flowStarts: 0,
    flowStops: 0,
  };
  const emit = (message) => device.tx.emit(packMessage(message));
  const status = (type, ok) => emit(Uint8Array.from([type, ok ? 0 : 1]));
  device.protocolHandler = (message) => {
    const messageBytes = Uint8Array.from(message);
    switch (message[0]) {
      case 0x46:
        status(0x47, slots.delete(message[1]));
        break;
      case 0x0c: {
        const terminator = message.indexOf(0, 1);
        assert.notEqual(terminator, -1);
        const view = new DataView(messageBytes.buffer);
        fake.upload = {
          fileName: Buffer.from(message.slice(1, terminator)).toString("utf8"),
          slot: message[terminator + 1],
          expectedCrc: view.getUint32(terminator + 2, true),
          chunks: [],
          runningCrc: 0,
        };
        fake.chunkIndex = 0;
        status(0x0d, true);
        break;
      }
      case 0x10: {
        const upload = fake.upload;
        const view = new DataView(messageBytes.buffer);
        const runningCrc = view.getUint32(1, true);
        const length = view.getUint16(5, true);
        const chunk = Buffer.from(message.slice(7));
        if (
          !upload ||
          fake.chunkIndex === failChunkIndex ||
          length !== chunk.length ||
          crc32Aligned(chunk, upload.runningCrc) !== runningCrc
        ) {
          status(0x11, false);
          break;
        }
        upload.runningCrc = runningCrc;
        upload.chunks.push(chunk);
        fake.chunkIndex++;
        status(0x11, true);
        break;
      }
      case 0x1e: {
        const isStop = message[1] === 1;
        if (message.length !== 3 || !fake.upload) {
          status(0x1f, false);
          break;
        }
        if (isStop) {
          fake.flowStops++;
          fake.running = false;
          status(0x1f, true);
          if (emitStopNotification) emit(Uint8Array.from([0x20, 1]));
          break;
        }
        fake.flowStarts++;
        const program = Buffer.concat(fake.upload.chunks);
        if (
          message[2] !== fake.upload.slot ||
          crc32Aligned(program) !== fake.upload.expectedCrc
        ) {
          status(0x1f, false);
          break;
        }
        fake.slots.set(fake.upload.slot, program);
        fake.running = true;
        fake.programSource = program.toString("utf8");
        status(0x1f, true);
        const emitConsole = (text) => {
          emit(
            Uint8Array.from([0x21, ...new TextEncoder().encode(`${text}\0`)])
          );
        };
        if (consoleOutput) {
          emitConsole(consoleOutput);
        }
        const runId = fake.programSource.match(
          /BWPROBE00:(\d+):TOP_LEVEL/
        )?.[1];
        const emitProbeStage = (stage) =>
          emitConsole(`BWPROBE00:${runId}:${stage}`);
        if (emitProbeMarkers && runId) {
          emitProbeStage("TOP_LEVEL");
          emitProbeStage("RUNLOOP_IMPORTED");
          emitProbeStage("MAIN_STARTED");
        }
        if (emitStartNotification) emit(Uint8Array.from([0x20, 0]));
        if (naturalCompletion && emitProbeMarkers && runId) {
          state.clock.setTimeout(() => {
            emitProbeStage("SLEEP_COMPLETED");
            emitProbeStage("MAIN_COMPLETED");
            fake.running = false;
            if (emitStopNotification) emit(Uint8Array.from([0x20, 1]));
          }, 2000);
        } else if (stopImmediatelyAfterStart) {
          fake.running = false;
          emit(Uint8Array.from([0x20, 1]));
        }
        break;
      }
      default:
        break;
    }
  };
  // connect() sends the ordinary sensor-notification request before this
  // command interpreter is installed. Complete that pending fake response so
  // the probe tests do not accidentally advance its timeout while observing.
  device.tx.emit(packMessage(Uint8Array.from([0x29, 0])));
  return fake;
}

test("Web Bluetooth requests notifications and records the hub acknowledgement", async () => {
  const state = setup();
  await connect(state);
  assert.equal(state.ext.getConnectionMode(), "web-ble");
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).notificationRequest
      .status,
    "pending"
  );
  const acknowledgedRequest =
    state.ext._peripheral._spike3.setDeviceNotifications(true);
  state.device.tx.emit(packMessage([0x29, 0x00]));
  await assert.doesNotReject(acknowledgedRequest);
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.notificationRequest.status, "acknowledged");
  assert.equal(diagnostics.notificationRequest.responseCode, 0);
  assert.equal(diagnostics.notificationRequest.requestMessageHex, "286400");
  assert.equal(diagnostics.notificationRequest.responseMessageHex, "2900");

  const rejectedRequest =
    state.ext._peripheral._spike3.setDeviceNotifications(true);
  state.device.tx.emit(packMessage([0x29, 0x01]));
  await assert.rejects(rejectedRequest, /did not acknowledge/);
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
  assert.equal(hub.portValues.A.position, 323);
  assert.equal(hub.portValues.A.absolutePosition, -37);
  assert.equal(hub.portValues.A.relativePosition, -123456);
  assert.equal(hub.portValues.A.degreesCounted, -123456);
  assert.equal(hub.portValues.A.power, -500);
  assert.equal(hub.portValues.A.speed, -12);
  assert.equal(state.ext.getPosition({ PORT: "A" }), 323);
  assert.equal(state.ext.getRelativePosition({ PORT: "A" }), -123456);
  assert.equal(state.ext.getAbsolutePosition({ PORT: "A" }), -37);
  assert.equal(state.ext.getSpeed({ PORT: "A" }), -112);
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.motorNotificationCount, 1);
  assert.equal(diagnostics.matrix5x5NotificationCount, 1);
  assert.deepEqual(diagnostics.lastMatrix5x5, Array.from(pixels));
});

test("truncated motor records are rejected without replacing the last angle", async () => {
  const state = setup();
  await connect(state);
  const hub = state.ext._peripheral._spike3;
  state.device.tx.emit(packMessage(notification(motorRecord())));
  const before = { ...hub.portValues.A };
  const truncated = motorRecord().slice(0, 11);
  state.device.tx.emit(packMessage(notification(truncated)));
  assert.deepEqual({ ...hub.portValues.A }, before);
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.malformedNotificationCount, 1);
  assert.match(diagnostics.lastCommunicationError, /truncated motor record/);
});

test("localized diagnostic summary distinguishes missing IMU data and lists motor positions", async () => {
  const state = setup({ locale: "ja" });
  await connect(state);
  const pending = state.ext.getCommunicationDiagnosticsSummary();
  assert.match(pending, /Bluetooth 接続: 接続中/);
  assert.match(pending, /Hub OS バージョン: 1\.6\.62/);
  assert.match(pending, /IMU通知件数: 0/);
  assert.match(pending, /角度: 未受信/);

  state.device.tx.emit(packMessage([0x29, 0x00]));
  state.device.tx.emit(
    packMessage(notification(imuRecord({ yaw: -9, pitch: 12, roll: -3 })))
  );
  state.device.tx.emit(packMessage(notification(motorRecord())));
  const received = state.ext.getCommunicationDiagnosticsSummary();
  assert.match(received, /Pitch 12°/);
  assert.match(received, /Roll -3°/);
  assert.match(received, /Yaw -9°/);
  assert.match(received, /A: 相対位置 -123456°, 絶対位置 -37°/);
  assert.match(received, /速度値 -12/);
});

test("Japanese communication diagnostics summarize errors and retain raw details", async () => {
  const state = setup({ locale: "ja" });
  await connect(state);
  const hub = state.ext._peripheral._spike3;
  const cases = [
    [
      "device notification response timed out",
      /センサー通知要求に対するハブの応答が時間内にありませんでした/,
    ],
    [
      "COBS decode failed: truncated COBS block",
      /Bluetoothフレームを解析できませんでした/,
    ],
    ["unsupported device record: 0x7f", /未対応の通知レコード（0x7f）/],
    [
      "DeviceNotification payload size mismatch: expected 4, received 2",
      /申告値 4 バイト、受信値 2 バイト/,
    ],
  ];
  const summaries = [];
  for (const [rawError, expectedSummary] of cases) {
    hub._recordCommunicationError(rawError);
    const summary = state.ext.getCommunicationDiagnosticsSummary();
    const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
    assert.match(summary, expectedSummary);
    assert.ok(summary.includes(`技術詳細: ${rawError}`));
    assert.equal(diagnostics.lastCommunicationError, rawError);
    summaries.push(summary);
  }
  assert.equal(new Set(summaries).size, cases.length);
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
  const request = state.ext._peripheral._spike3.setDeviceNotifications(true);
  await tick();
  const writesAfterRequest = state.device.writes.length;
  state.clock.advance(2001);
  await assert.rejects(request, /device notification response timed out/);
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).notificationRequest
      .status,
    "timeout"
  );
  assert.equal(
    state.device.writes.length,
    writesAfterRequest,
    "timeout sends no additional command"
  );
});

test("SPIKE 3.x never writes an output command before a controller handshake", async () => {
  const state = setup();
  await connect(state);
  state.device.tx.emit(packMessage([0x29, 0x00]));
  const writesBefore = state.device.writes.length;
  await assert.rejects(
    state.ext.motorStart({ PORT: "A", DIRECTION: 1 }),
    /Install and start the Brickwright SPIKE controller first/
  );
  assert.equal(
    state.device.writes.length,
    writesBefore,
    "without a verified command interpreter the block sends nothing"
  );
});

test("GATT disconnect clears the partial frame but preserves its diagnostic history", async () => {
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
  assert.equal(diagnostics.disconnectCount, 1);
  assert.equal(diagnostics.lastDisconnect.origin, "gattserverdisconnected");
  assert.equal(diagnostics.lastFirmwareVersion, "1.6.62");
  assert.ok(
    diagnostics.recentEvents.some(
      (event) =>
        event.type === "disconnect" && event.origin === "gattserverdisconnected"
    )
  );
  assert.equal(state.ext._peripheral._spike3.angle.pitch, 20);
});

test("a requested local disconnect is recorded separately from a GATT disconnect event", async () => {
  const state = setup();
  await connect(state);
  state.ext._peripheral._spike3.disconnect();

  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.lastDisconnect.origin, "user-requested");
  assert.equal(diagnostics.lastDisconnect.requested, true);
  assert.equal(diagnostics.disconnectCount, 1);
  assert.equal(
    diagnostics.recentEvents.some(
      (event) => event.origin === "gattserverdisconnected"
    ),
    false
  );
});

test("a fake-device write failure is surfaced in diagnostics", async () => {
  const state = setup();
  await connect(state);
  state.device.tx.emit(packMessage([0x29, 0x00]));
  await tick();
  state.device.rx.failNextWrite = true;
  await assert.rejects(
    state.ext._peripheral._spike3.setDeviceNotifications(true),
    /simulated fake-device write failure/
  );
  assert.equal(state.ext.isConnected(), false);
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.notificationRequest.status, "write-error");
  assert.match(
    diagnostics.lastCommunicationError,
    /simulated fake-device write failure/
  );
  assert.equal(diagnostics.lastDisconnect.origin, "ble-write-exception");
  assert.equal(diagnostics.lastTransportError.messageType, 0x28);
  assert.equal(
    diagnostics.lastTransportError.messageName,
    "DeviceNotificationRequest"
  );
  assert.match(
    diagnostics.lastTransportError.stack,
    /simulated fake-device write failure/
  );
});

test("SPIKE 3.x transport write errors propagate without starting Python fallback", async () => {
  const state = setup();
  await connect(state);
  const controller = attachFakeControllerHub(state);
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  await state.ext.installHubController({ SLOT: 19 });
  assert.equal(controller.running, true);
  state.device.tx.emit(packMessage([0x29, 0x00]));
  await tick();
  const successfulWrites = state.device.writes.length;
  state.device.rx.failNextWrite = true;
  await assert.rejects(
    state.ext.motorStart({ PORT: "A", DIRECTION: 1 }),
    /simulated fake-device write failure/
  );
  assert.equal(
    state.device.writes.length,
    successfulWrites,
    "a transport failure must not trigger a second Python write"
  );
});

test("a mid-frame BLE write failure disconnects and blocks later commands", async () => {
  const state = setup();
  await connect(state);
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  const writesBefore = state.device.writes.length;
  state.device.rx.failWriteNumber = writesBefore + 2;
  await assert.rejects(
    state.ext._peripheral._spike3._sendTunnelPayload("x".repeat(90)),
    /simulated fake-device write failure/
  );
  assert.equal(state.device.writes.length, writesBefore + 1);
  assert.equal(state.ext.isConnected(), false);
  await assert.rejects(
    state.ext._peripheral._spike3._sendTunnelPayload("another command"),
    /接続|connected/i
  );
  assert.equal(state.device.writes.length, writesBefore + 1);
});

test("raw Python over TunnelMessage is rejected and sends no bytes", async () => {
  const state = setup();
  await connect(state);
  const hub = state.ext._peripheral._spike3;
  await assert.rejects(
    hub.sendCommand("scratch.display_text", { text: "Hello" }),
    /Text display is unavailable on SPIKE 3.x/
  );
  const before = state.device.writes.length;
  await assert.rejects(
    state.ext.displayText({ TEXT: "Hello" }),
    /Text display is unavailable on SPIKE 3.x/
  );
  await assert.rejects(
    hub.sendPythonCommand('import hub; hub.display.show("Hello")'),
    /Raw Python is not executed by TunnelMessage/
  );
  assert.equal(state.device.writes.length, before);
});

test("controller installation is confirmed, CRC-checked, transferred, started, and version-probed", async () => {
  const state = setup({ locale: "ja" });
  await connect(state);
  const fakeHub = attachFakeControllerHub(state);
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  const original = Buffer.from(fakeHub.slots.get(19));
  const confirmations = [];
  state.context.Scratch.BWConfirm = (message) => {
    confirmations.push(message);
    return false;
  };
  const writesBeforeCancel = state.device.writes.length;
  await state.ext.installHubController({ SLOT: 19 });
  assert.equal(state.device.writes.length, writesBeforeCancel);
  assert.deepEqual(fakeHub.slots.get(19), original);

  state.context.Scratch.BWConfirm = (message) => {
    confirmations.push(message);
    return true;
  };
  const result = await state.ext.installHubController({ SLOT: 19 });
  assert.equal(result.protocol, "brickwright-spike-controller");
  assert.equal(result.version, 1);
  assert.ok(confirmations.some((message) => message.includes("スロット19")));
  assert.equal(fakeHub.running, true);
  assert.equal(fakeHub.currentUpload.name, "program.py");
  assert.ok(state.device.writes.every((packet) => packet.length <= 64));
  const uploadedMessages = unpackWrittenMessages(state.device.writes);
  const clearRequest = uploadedMessages.find((message) => message[0] === 0x46);
  const uploadRequest = uploadedMessages.find((message) => message[0] === 0x0c);
  const chunkRequests = uploadedMessages.filter(
    (message) => message[0] === 0x10
  );
  const programFlowRequest = uploadedMessages.find(
    (message) => message[0] === 0x1e
  );
  assert.equal(
    Buffer.from(clearRequest).toString("hex"),
    officialTransferVectors.messages.clear_slot_19.hex
  );
  assert.equal(uploadRequest.length, 17);
  assert.equal(
    Buffer.from(uploadRequest.slice(1, 12)).toString("utf8"),
    "program.py\0"
  );
  assert.equal(uploadRequest[12], 19);
  assert.equal(
    new DataView(Uint8Array.from(uploadRequest).buffer).getUint32(13, true),
    crc32Aligned(fakeHub.slots.get(19))
  );
  assert.ok(uploadedMessages.some((message) => message[0] === 0x10));
  assert.ok(chunkRequests.length > 1);
  const installedProgram = fakeHub.slots.get(19);
  let uploadedOffset = 0;
  assert.ok(
    chunkRequests.every((message) => {
      const view = new DataView(Uint8Array.from(message).buffer);
      const size = view.getUint16(5, true);
      const expectedSize = Math.min(
        50,
        installedProgram.length - uploadedOffset
      );
      const payload = Buffer.from(message.slice(7));
      const expectedPayload = installedProgram.subarray(
        uploadedOffset,
        uploadedOffset + expectedSize
      );
      uploadedOffset += size;
      return (
        size === expectedSize && size <= 50 && payload.equals(expectedPayload)
      );
    })
  );
  assert.equal(uploadedOffset, installedProgram.length);
  assert.equal(
    Buffer.from(programFlowRequest).toString("hex"),
    officialTransferVectors.messages.program_flow_start_slot_19.hex
  );
  assert.ok(uploadedMessages.some((message) => message[0] === 0x32));
  assert.notDeepEqual(fakeHub.slots.get(19), original);
  assert.equal(
    fakeHub.slots.get(19).toString("utf8").includes("module_tunnel"),
    true
  );
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.controllerStatus, "ready");
  assert.equal(diagnostics.controllerVersion, "brickwright-spike-controller/1");
  assert.equal(diagnostics.controllerInstallAttempt.outcome, "ready");
  assert.equal(
    diagnostics.controllerInstallAttempt.lastSuccessfulStage,
    "controller-hello-acknowledged"
  );
  assert.equal(diagnostics.lastProgramFlowNotification.action, "start");
});

test("startup probe block and menu are hidden unless developer mode is opted in", () => {
  const regularInfo = setup().ext.getInfo();
  assert.equal(
    regularInfo.blocks.some((block) => block.opcode === "runStartupProbe"),
    false
  );
  assert.equal(regularInfo.menus.SPIKE_STARTUP_PROBE, undefined);

  const developerInfo = setup({
    developerMode: true,
    locale: "ja",
  }).ext.getInfo();
  const probeBlock = developerInfo.blocks.find(
    (block) => block.opcode === "runStartupProbe"
  );
  assert.ok(probeBlock);
  assert.match(probeBlock.text, /SPIKE起動プローブ/);
  assert.deepEqual(
    Array.from(
      developerInfo.menus.SPIKE_STARTUP_PROBE.items,
      (item) => item.value
    ),
    ["00", "01", "02"]
  );
  assert.match(
    developerInfo.menus.SPIKE_STARTUP_PROBE.items[0].text,
    /runloop/
  );
});

test("startup probe overwrite confirmation names the slot and cancellation sends nothing", async () => {
  const state = setup({ developerMode: true, locale: "ja" });
  await connect(state);
  attachFakeStartupProbeHub(state);
  const before = state.device.writes.length;
  let confirmation = "";
  state.context.Scratch.BWConfirm = (message) => {
    confirmation = message;
    return false;
  };

  const result = await state.ext.runStartupProbe({ PROBE: "00", SLOT: 7 });
  assert.equal(result, undefined);
  assert.match(confirmation, /プローブ00/);
  assert.match(confirmation, /スロット7/);
  assert.match(confirmation, /program\.py/);
  assert.match(confirmation, /SPIKEアプリで上書きしてよいスロットか確認/);
  assert.equal(state.device.writes.length, before);
  assert.deepEqual(
    JSON.parse(state.ext.getCommunicationDiagnostics()).startupProbeRuns,
    []
  );
});

test("fake-device records probe 00 bytes, Python markers, and a simulated flow lifecycle", async () => {
  const state = setup({ developerMode: true, locale: "ja" });
  await connect(state);
  const fakeHub = attachFakeStartupProbeHub(state, {
    emitProbeMarkers: true,
    naturalCompletion: true,
  });
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  const confirmations = [];
  state.context.Scratch.BWConfirm = (message) => {
    confirmations.push(message);
    return true;
  };

  const resultPromise = state.ext.runStartupProbe({ PROBE: "00", SLOT: 7 });
  await waitUntil(
    () =>
      JSON.parse(state.ext.getCommunicationDiagnostics()).startupProbeRuns[0]
        ?.stage === "observing-running-program",
    "probe 00 reaches the observation window"
  );
  state.clock.advance(2000);
  const result = await resultPromise;

  assert.equal(result.probeId, "00");
  assert.equal(result.slot, 7);
  assert.equal(result.outcome, "success");
  assert.equal(result.notifications.start.action, "start");
  assert.equal(result.notifications.stop.action, "stop");
  assert.equal(result.transferResponses.startFileUpload.ok, true);
  assert.ok(result.transferResponses.transferChunks.length > 0);
  assert.ok(
    result.transferResponses.transferChunks.every((chunk) => chunk.ok === true)
  );
  assert.equal(result.transferResponses.programFlowStart.ok, true);
  assert.equal(result.transferResponses.programFlowStop, null);
  assert.ok(result.runtimeMs >= 0);
  assert.equal(result.pythonExecution.status, "completed");
  assert.equal(result.pythonExecution.allStagesObserved, true);
  assert.equal(result.consoleObservation.status, "probe-markers-observed");
  assert.equal(result.consoleObservation.notificationCount, 5);
  assert.equal(result.consoleObservation.probeMarkerCount, 5);
  assert.equal(result.finalStage, "observing-running-program");
  assert.equal(
    result.executionStartedAt,
    result.pythonExecution.stageMarkers[0].receivedAt
  );
  assert.equal(
    result.executionFinishedAt,
    result.pythonExecution.stageMarkers.at(-1).receivedAt
  );
  assert.equal(
    result.executionDurationMs,
    result.executionFinishedAt - result.executionStartedAt
  );
  assert.deepEqual(
    Array.from(result.pythonExecution.stageMarkers, (stage) => stage.id),
    [
      "top-level",
      "runloop-imported",
      "main-started",
      "sleep-completed",
      "main-completed",
    ]
  );
  assert.equal(result.consoleOutput.length, 5);
  assert.ok(
    result.consoleOutput.every((item) => item.decodedProtocolMessageHex)
  );
  assert.equal(result.flowCorrelation.notificationContainsSlot, false);
  assert.match(
    result.runtimeMsMeaning,
    /includes info wait, slot clear, transfer/i
  );
  assert.equal(result.source.encoding, "UTF-8");
  assert.equal(result.source.hasTrailingNewline, true);
  assert.equal(result.source.lineEndings, "LF");
  assert.equal(result.source.byteLength, result.transferredBytes);
  assert.equal(result.transferResponses.infoRequest.requestMessageHex, "00");
  assert.deepEqual(
    bytesFromHex(result.transferResponses.infoRequest.requestFrameHex),
    packMessage([0x00])
  );
  assert.equal(
    result.transferResponses.infoRequest.responseMessageHex,
    "0102002a0001063e004000640032000000"
  );
  assert.equal(
    result.transferResponses.notificationRequest.status,
    "acknowledged"
  );
  assert.equal(
    result.transferResponses.notificationRequest.requestMessageHex,
    "286400"
  );
  assert.equal(
    result.transferResponses.notificationRequest.responseMessageHex,
    "2900"
  );
  assert.equal(fakeHub.programSource, result.source.text);
  assert.equal(
    Number.parseInt(result.source.crc32.slice(2), 16),
    fakeHub.upload.expectedCrc
  );
  assert.equal(
    result.transferResponses.programFlowStart.protocolMessageHex,
    "1e0007"
  );
  assert.equal(
    result.transferResponses.programFlowStart.responseMessageHex,
    "1f00"
  );
  assert.deepEqual(
    bytesFromHex(result.transferResponses.programFlowStart.requestFrameHex),
    packMessage([0x1e, 0x00, 0x07])
  );
  assert.deepEqual(
    bytesFromHex(result.transferResponses.programFlowStart.responseFrameHex),
    packMessage([0x1f, 0x00])
  );
  assert.equal(
    result.transferResponses.programFlowStart.requestPacketLengths.reduce(
      (sum, length) => sum + length,
      0
    ),
    bytesFromHex(result.transferResponses.programFlowStart.requestFrameHex)
      .length
  );
  assert.equal(result.notifications.start.decodedProtocolMessageHex, "2000");
  assert.equal(result.notifications.stop.decodedProtocolMessageHex, "2001");
  assert.deepEqual(
    bytesFromHex(result.notifications.start.wireFrameHex),
    packMessage([0x20, 0x00])
  );
  assert.deepEqual(
    bytesFromHex(result.notifications.stop.wireFrameHex),
    packMessage([0x20, 0x01])
  );
  assert.ok(
    result.consoleOutput.every(
      (item) =>
        bytesFromHex(item.wireFrameHex).length >
        bytesFromHex(item.decodedProtocolMessageHex).length
    )
  );
  assert.match(confirmations[0], /スロット7/);

  const fixture = fs
    .readFileSync(
      path.join(here, "fixtures/spikeprime-startup-00-runloop.py"),
      "utf8"
    )
    .replace(/\r\n/g, "\n")
    .replaceAll("__RUN_ID__", result.runId);
  assert.equal(fakeHub.upload.fileName, "program.py");
  assert.equal(fakeHub.slots.get(7).toString("utf8"), fixture);
  assert.equal(fakeHub.flowStarts, 1, "only the selected probe is started");
  assert.equal(fakeHub.flowStops, 0, "probe 00 reaches its natural completion");
  const writtenMessages = unpackWrittenMessages(state.device.writes);
  assert.equal(
    writtenMessages.some((message) => message[0] === 0x32),
    false,
    "the diagnostic flow does not send TunnelMessage or Python commands"
  );
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.startupProbeRuns[0].outcome, "success");
});

for (const probeId of ["01", "02"]) {
  test(`selected probe ${probeId} is the exact reviewed fixture`, async () => {
    const state = setup({ developerMode: true });
    await connect(state);
    const fakeHub = attachFakeStartupProbeHub(state);
    const hub = state.ext._peripheral._spike3;
    hub._rateLimiter.reserve = () => 0;
    const runPromise = hub.runStartupProbe(probeId, 7, {
      observationMs: 0,
      startTimeoutMs: 10,
      stopTimeoutMs: 10,
    });
    await waitUntil(
      () =>
        JSON.parse(state.ext.getCommunicationDiagnostics()).startupProbeRuns[0]
          ?.stage === "observing-running-program",
      `probe ${probeId} reaches the observation window`
    );
    state.clock.advance(0);
    const result = await runPromise;
    const fixture = fs
      .readFileSync(
        path.join(
          here,
          `fixtures/spikeprime-startup-${probeId}-${probeId === "01" ? "public-imports" : "tunnel-registration"}.py`
        ),
        "utf8"
      )
      .replace(/\r\n/g, "\n");
    assert.equal(result.outcome, "success");
    assert.equal(fakeHub.upload.fileName, "program.py");
    assert.equal(fakeHub.slots.get(7).toString("utf8"), fixture);
    assert.equal(fakeHub.flowStarts, 1);
    assert.equal(fakeHub.flowStops, 1);
  });
}

test("missing probe start notification is indeterminate even if stop cleanup responds", async () => {
  const state = setup({ developerMode: true });
  await connect(state);
  attachFakeStartupProbeHub(state, { emitStartNotification: false });
  const hub = state.ext._peripheral._spike3;
  hub._rateLimiter.reserve = () => 0;
  const runPromise = hub.runStartupProbe("00", 7, {
    observationMs: 0,
    startTimeoutMs: 20,
    stopTimeoutMs: 20,
  });
  await waitUntil(
    () =>
      JSON.parse(state.ext.getCommunicationDiagnostics()).startupProbeRuns[0]
        ?.stage === "waiting-for-start-notification",
    "probe waits for its start notification"
  );
  state.clock.advance(20);
  const result = await runPromise;
  assert.equal(result.outcome, "indeterminate");
  assert.equal(result.notifications.start, null);
  assert.equal(result.transferResponses.programFlowStart.ok, true);
  assert.equal(result.transferResponses.programFlowStop.ok, true);
  assert.equal(result.notifications.stop.action, "stop");
  assert.equal(result.terminationStatus, "cleanup-stop-notification-received");
});

test("Python completion markers do not make an uncorrelated stop notification a protocol success", async () => {
  const state = setup({ developerMode: true });
  await connect(state);
  attachFakeStartupProbeHub(state, {
    emitStartNotification: false,
    emitProbeMarkers: true,
    naturalCompletion: true,
  });
  const hub = state.ext._peripheral._spike3;
  hub._rateLimiter.reserve = () => 0;
  const runPromise = hub.runStartupProbe("00", 7, {
    observationMs: 0,
    startTimeoutMs: 5000,
    stopTimeoutMs: 20,
  });
  await waitUntil(
    () =>
      JSON.parse(state.ext.getCommunicationDiagnostics()).startupProbeRuns[0]
        ?.stage === "waiting-for-start-notification",
    "probe waits for the missing start notification"
  );
  state.clock.advance(2000);
  const result = await runPromise;
  assert.equal(result.outcome, "indeterminate");
  assert.equal(result.pythonExecution.status, "completed");
  assert.equal(result.notifications.start, null);
  assert.equal(result.notifications.stop.action, "stop");
  assert.equal(result.terminationStatus, "stop-without-start-notification");
  assert.equal(
    result.executionDurationMs,
    result.executionFinishedAt - result.executionStartedAt
  );
  assert.equal(result.transferResponses.programFlowStop, null);
});

test("missing probe stop notification is indeterminate", async () => {
  const state = setup({ developerMode: true });
  await connect(state);
  attachFakeStartupProbeHub(state, { emitStopNotification: false });
  const hub = state.ext._peripheral._spike3;
  hub._rateLimiter.reserve = () => 0;
  const runPromise = hub.runStartupProbe("00", 7, {
    observationMs: 5,
    startTimeoutMs: 20,
    stopTimeoutMs: 20,
  });
  await waitUntil(
    () =>
      JSON.parse(state.ext.getCommunicationDiagnostics()).startupProbeRuns[0]
        ?.stage === "observing-running-program",
    "probe reaches its observation window"
  );
  state.clock.advance(5);
  await waitUntil(
    () =>
      JSON.parse(state.ext.getCommunicationDiagnostics()).startupProbeRuns[0]
        ?.stage === "waiting-for-stop-notification",
    "probe waits for stop notification"
  );
  state.clock.advance(20);
  const result = await runPromise;
  assert.equal(result.outcome, "indeterminate");
  assert.equal(result.notifications.start.action, "start");
  assert.equal(result.notifications.stop, null);
  assert.equal(result.transferResponses.programFlowStop.ok, true);
  assert.equal(
    result.terminationStatus,
    "diagnostic-stop-notification-missing"
  );
});

test("an uncorrelated early stop without Python markers is indeterminate", async () => {
  const state = setup({ developerMode: true });
  await connect(state);
  attachFakeStartupProbeHub(state, { stopImmediatelyAfterStart: true });
  const hub = state.ext._peripheral._spike3;
  hub._rateLimiter.reserve = () => 0;
  const result = await hub.runStartupProbe("00", 7, {
    observationMs: 50,
    startTimeoutMs: 20,
    stopTimeoutMs: 20,
  });
  assert.equal(result.outcome, "indeterminate");
  assert.match(result.reason, /notification has no slot field/i);
  assert.equal(result.pythonExecution.status, "not-observed");
  assert.equal(result.consoleObservation.status, "no-console-notifications");
  assert.equal(result.finalStage, "waiting-for-start-notification");
  assert.equal(
    result.executionFinishedAt,
    null,
    "a stop notification is not a Python completion timestamp"
  );
  assert.equal(result.notifications.start.action, "start");
  assert.equal(result.notifications.stop.action, "stop");
  assert.equal(result.terminationStatus, "stop-before-diagnostic-stop-request");
  assert.equal(result.notifications.stop.decodedProtocolMessageHex, "2001");
  assert.equal(result.transferResponses.programFlowStop, null);
});

test("a failed probe transfer is recorded as failure and does not start the slot", async () => {
  const state = setup({ developerMode: true });
  await connect(state);
  const fakeHub = attachFakeStartupProbeHub(state, { failChunkIndex: 0 });
  const hub = state.ext._peripheral._spike3;
  hub._rateLimiter.reserve = () => 0;
  const result = await hub.runStartupProbe("00", 7);
  assert.equal(result.outcome, "failure");
  assert.equal(result.transferResponses.transferChunks[0].ok, false);
  assert.equal(result.transferResponses.programFlowStart, null);
  assert.equal(fakeHub.flowStarts, 0);
});

test("a GATT disconnect after ProgramFlowResponse is distinct from a failed BLE write", async () => {
  const state = setup();
  await connect(state);
  const fakeHub = attachFakeControllerHub(state, {
    disconnectAfterProgramFlowResponse: true,
  });
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;

  await assert.rejects(
    state.ext.installHubController({ SLOT: 7 }),
    /disconnected before the controller start was verified/i
  );

  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.lastDisconnect.origin, "gattserverdisconnected");
  assert.equal(diagnostics.controllerStatus, "disconnected");
  assert.equal(
    diagnostics.lastSuccessfulControllerStage.stage,
    "program-flow-response-accepted"
  );
  assert.equal(diagnostics.controllerInstallAttempt.outcome, "interrupted");
  assert.equal(fakeHub.helloCount, 0);
  assert.equal(
    unpackWrittenMessages(state.device.writes).some(
      (message) => message[0] === 0x32
    ),
    false,
    "the extension does not tunnel hello after the GATT connection is gone"
  );
});

test("a Python startup failure is recorded from ConsoleNotification and stop notification", async () => {
  const state = setup();
  await connect(state);
  const startupTraceback = "Traceback: KeyError: module_tunnel";
  const fakeHub = attachFakeControllerHub(state, {
    startupConsoleError: startupTraceback,
  });
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;

  await assert.rejects(
    state.ext.installHubController({ SLOT: 8 }),
    /stopped before it completed its startup handshake.*KeyError: module_tunnel/i
  );

  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.controllerStatus, "startup-error");
  assert.equal(diagnostics.lastProgramFlowNotification.action, "stop");
  assert.match(diagnostics.recentConsoleOutput, /KeyError: module_tunnel/);
  assert.equal(diagnostics.controllerInstallAttempt.outcome, "startup-error");
  assert.equal(
    diagnostics.lastSuccessfulControllerStage.stage,
    "program-flow-response-accepted"
  );
  assert.equal(fakeHub.helloCount, 0);
});

test("a failed ProgramFlow BLE write records its exception and is not labeled a GATT event", async () => {
  const state = setup({ failWriteMessageType: 0x1e });
  await connect(state);
  attachFakeControllerHub(state);
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;

  await assert.rejects(
    state.ext.installHubController({ SLOT: 9 }),
    /simulated fake-device write failure/
  );

  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.equal(diagnostics.lastDisconnect.origin, "ble-write-exception");
  assert.equal(diagnostics.lastWrite.messageType, 0x1e);
  assert.equal(diagnostics.lastWrite.messageName, "ProgramFlowRequest");
  assert.equal(diagnostics.lastWrite.status, "failed");
  assert.match(
    diagnostics.lastWrite.errorStack,
    /simulated fake-device write failure/
  );
  assert.equal(diagnostics.lastTransportError.messageType, 0x1e);
  assert.equal(
    diagnostics.lastTransportError.messageName,
    "ProgramFlowRequest"
  );
  assert.equal(
    diagnostics.controllerInstallAttempt.lastSuccessfulStage,
    "program-upload-complete"
  );
});

test("delayed program-start and hello notifications wait for readiness before reporting success", async () => {
  const state = setup();
  await connect(state);
  const fakeHub = attachFakeControllerHub(state, {
    startNotificationDelayMs: 300,
    helloResponseDelayMs: 500,
  });
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;

  const install = state.ext.installHubController({ SLOT: 10 });
  await waitUntil(
    () =>
      JSON.parse(state.ext.getCommunicationDiagnostics())
        .lastSuccessfulControllerStage?.stage ===
      "program-flow-response-accepted",
    "ProgramFlowResponse should be acknowledged before waiting for start"
  );
  assert.equal(fakeHub.helloCount, 0);
  state.clock.advance(299);
  await tick();
  assert.equal(fakeHub.helloCount, 0);

  state.clock.advance(1);
  await waitUntil(
    () => fakeHub.helloCount === 1,
    "hello should follow start notification"
  );
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).controllerStatus,
    "checking"
  );
  state.clock.advance(499);
  await tick();
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).controllerStatus,
    "checking"
  );
  state.clock.advance(1);
  const result = await install;
  assert.equal(result.version, 1);
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).controllerStatus,
    "ready"
  );
});

test("missing readiness console and lost first hello are recovered by bounded retry", async () => {
  const state = setup();
  await connect(state);
  const fakeHub = attachFakeControllerHub(state, {
    suppressReadyMarker: true,
    ignoreFirstHellos: 1,
  });
  const hub = state.ext._peripheral._spike3;
  hub._rateLimiter.reserve = () => 0;
  const install = state.ext.installHubController({ SLOT: 2 });
  await waitUntil(
    () =>
      JSON.parse(state.ext.getCommunicationDiagnostics())
        .lastSuccessfulControllerStage?.stage === "program-start-notified",
    "start notification"
  );
  assert.equal(fakeHub.helloCount, 0);
  state.clock.advance(1000);
  await waitUntil(() => fakeHub.helloCount === 1, "first hello");
  state.clock.advance(4000);
  await waitUntil(() => fakeHub.helloCount === 2, "second hello");
  assert.equal((await install).version, 1);
  assert.equal(hub._pendingControllerCommands.size, 0);
  const ids = unpackWrittenMessages(state.device.writes)
    .filter((m) => m[0] === 0x32)
    .map((m) => JSON.parse(Buffer.from(m.slice(3)).toString()).i);
  assert.notEqual(ids[0], ids[1]);
});

test("late hello response cannot resolve the next attempt", async () => {
  const state = setup();
  await connect(state);
  const fakeHub = attachFakeControllerHub(state, {
    helloResponseDelayMs: 5000,
  });
  const hub = state.ext._peripheral._spike3;
  hub._rateLimiter.reserve = () => 0;
  const install = state.ext.installHubController({ SLOT: 2 });
  await waitUntil(() => fakeHub.helloCount === 1, "first hello");
  state.clock.advance(4000);
  await waitUntil(() => fakeHub.helloCount === 2, "second hello");
  state.clock.advance(1000);
  await tick();
  assert.equal(hub._controllerReady, false);
  assert.equal(hub._pendingControllerCommands.size, 1);
  state.clock.advance(3000);
  await waitUntil(() => fakeHub.helloCount === 3, "third hello");
  state.clock.advance(1000);
  await tick();
  assert.equal(hub._controllerReady, false);
  state.clock.advance(3000);
  await assert.rejects(install, /did not acknowledge the command in time/i);
  assert.equal(hub._pendingControllerCommands.size, 0);
});

test("manual controller check can verify an already-running program without clearing or retransferring", async () => {
  const state = setup();
  await connect(state);
  const fakeHub = attachFakeControllerHub(state, {
    suppressStartNotification: true,
  });
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;

  const install = state.ext.installHubController({ SLOT: 11 });
  await waitUntil(
    () =>
      JSON.parse(state.ext.getCommunicationDiagnostics())
        .lastSuccessfulControllerStage?.stage ===
      "program-flow-response-accepted",
    "the program-start request should be acknowledged"
  );
  state.clock.advance(7000);
  await assert.rejects(install, /ProgramFlowRequest but did not report/i);
  assert.equal(fakeHub.running, true);
  assert.equal(fakeHub.helloCount, 0);

  const beforeCheck = unpackWrittenMessages(state.device.writes);
  const priorClearCount = beforeCheck.filter(
    (message) => message[0] === 0x46
  ).length;
  const priorChunkCount = beforeCheck.filter(
    (message) => message[0] === 0x10
  ).length;
  const result = await state.ext.checkHubController();
  assert.equal(result.version, 1);
  assert.equal(fakeHub.helloCount, 1);
  const afterCheck = unpackWrittenMessages(state.device.writes);
  assert.equal(
    afterCheck.filter((message) => message[0] === 0x46).length,
    priorClearCount
  );
  assert.equal(
    afterCheck.filter((message) => message[0] === 0x10).length,
    priorChunkCount
  );
});

test("host output blocks are interpreted by the fake controller and return execution acknowledgements", async () => {
  const state = setup();
  await connect(state);
  const fakeHub = attachFakeControllerHub(state);
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  await state.ext.installHubController({ SLOT: 19 });

  await state.ext.motorStart({ PORT: "A", DIRECTION: 1 });
  await state.ext.motorStartPower({ PORT: "A", POWER: 1 });
  await state.ext.stopMotor({ PORT: "A", ACTION: "brake" });
  await state.ext._peripheral.active.sendCommand(
    "scratch.motor_run_for_degrees",
    {
      port: "A",
      speed: 20,
      degrees: 90,
    }
  );
  await state.ext.setPixel({ X: 1, Y: 1, BRIGHTNESS: 0 });
  await state.ext.setPixel({ X: 1, Y: 1, BRIGHTNESS: 100 });
  await state.ext.displayClear();
  await state.ext.playBeep({ FREQUENCY: 440, DURATION: 150 });
  await state.ext.stopSound();

  const writesBeforeUnsupportedStop = state.device.writes.length;
  await assert.rejects(
    state.ext._peripheral.active.sendCommand("scratch.motor_stop", {
      port: "A",
      stop: "hold",
    }),
    /motor stop action has not been verified/
  );
  assert.equal(state.device.writes.length, writesBeforeUnsupportedStop);

  assert.deepEqual(
    fakeHub.actions.map((action) => action.cmd),
    [
      "motor.run",
      "motor.power",
      "motor.stop",
      "motor.run_degrees",
      "matrix.pixel",
      "matrix.pixel",
      "matrix.clear",
      "sound.beep",
      "sound.stop",
    ]
  );
  assert.equal(fakeHub.actions[0].velocity, 540);
  assert.deepEqual(
    [fakeHub.actions[4].brightness, fakeHub.actions[5].brightness],
    [0, 100]
  );
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).controllerStatus,
    "ready"
  );
});

test("controller serializes simultaneous commands and preserves their order", async () => {
  const state = setup();
  await connect(state);
  const fakeHub = attachFakeControllerHub(state);
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  await state.ext.installHubController({ SLOT: 19 });

  const first = state.ext._peripheral.active.sendCommand(
    "scratch.motor_start",
    {
      port: "A",
      speed: 10,
    }
  );
  const second = state.ext._peripheral.active.sendCommand(
    "scratch.motor_stop",
    {
      port: "A",
      stop: "brake",
    }
  );
  await Promise.all([first, second]);
  assert.deepEqual(
    fakeHub.actions.map((action) => action.cmd),
    ["motor.run", "motor.stop"]
  );
});

test("controller execution failures reach the caller with technical detail", async () => {
  const state = setup();
  await connect(state);
  const fakeHub = attachFakeControllerHub(state);
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  await state.ext.installHubController({ SLOT: 19 });
  fakeHub.rejectCommands.add("motor.run");
  await assert.rejects(
    state.ext.motorStart({ PORT: "A", DIRECTION: 1 }),
    /simulated motor API failure/
  );
  const diagnostics = JSON.parse(state.ext.getCommunicationDiagnostics());
  assert.match(
    diagnostics.lastCommunicationError,
    /simulated motor API failure/
  );
});

test("a controller command timeout fails visibly and is never retried", async () => {
  const state = setup();
  await connect(state);
  const fakeHub = attachFakeControllerHub(state);
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  await state.ext.installHubController({ SLOT: 19 });
  fakeHub.ignoreCommands.add("motor.run");

  const writesBefore = state.device.writes.length;
  const command = state.ext._peripheral.active.sendCommand(
    "scratch.motor_start",
    {
      port: "A",
      speed: 10,
    }
  );
  await tick();
  state.clock.advance(4001);
  await assert.rejects(command, /did not acknowledge the command in time/i);
  assert.equal(state.device.writes.length, writesBefore + 1);
  assert.equal(
    fakeHub.actions.some((action) => action.cmd === "motor.run"),
    false
  );
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).controllerStatus,
    "timeout"
  );
});

test("failed transfer acknowledgement aborts before ProgramFlow starts a program", async () => {
  const state = setup();
  await connect(state);
  attachFakeControllerHub(state, { failChunkIndex: 0 });
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  state.context.Scratch.BWConfirm = () => true;
  await assert.rejects(
    state.ext.installHubController({ SLOT: 5 }),
    /Hub rejected program chunk at byte 0/
  );
  const outgoing = unpackWrittenMessages(state.device.writes);
  assert.equal(
    outgoing.some((message) => message[0] === 0x1e),
    false
  );
  assert.equal(
    JSON.parse(state.ext.getCommunicationDiagnostics()).controllerStatus,
    "error"
  );
});

test("malformed StartFileUploadResponse aborts transfer before sending chunks", async () => {
  const state = setup();
  await connect(state);
  attachFakeControllerHub(state, { malformedResponseType: 0x0d });
  state.ext._peripheral._spike3._rateLimiter.reserve = () => 0;
  state.context.Scratch.BWConfirm = () => true;
  await assert.rejects(
    state.ext.installHubController({ SLOT: 5 }),
    /invalid protocol response length.*expected 2, received 3/
  );
  const outgoing = unpackWrittenMessages(state.device.writes);
  assert.equal(
    outgoing.some((message) => message[0] === 0x10),
    false
  );
  assert.equal(
    outgoing.some((message) => message[0] === 0x1e),
    false
  );
});

test("SPIKE 3.x display text does not auto-send an unverified Python fallback", async () => {
  const state = setup({ locale: "ja" });
  await connect(state);
  const writesBefore = state.device.writes.length;
  await assert.rejects(
    state.ext.displayText({ TEXT: "Hello" }),
    /SPIKE 3.xでは文字表示を利用できません/
  );
  await tick();
  assert.equal(
    state.device.writes.length,
    writesBefore,
    "the failed native command and blocked fallback perform no device write"
  );
  assert.match(
    JSON.parse(state.ext.getCommunicationDiagnostics()).lastCommunicationError,
    /SPIKE 3.xでは文字表示を利用できません/
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

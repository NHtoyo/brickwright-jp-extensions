// Movement blocks of the unified SPIKE extension (spikeprime), run against
// its real HubRouter with the hubs' send methods captured. No hardware: the
// "hub" here is a stub that reports counted motor positions the way the
// SPIKE 3 notification parser and the 2.x status stream store them.
//
//   node development/test-spikeprime-movement.js

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

const Cast = {
  toString: (v) => String(v),
  toNumber: (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },
  toBoolean: (v) => Boolean(v),
};

function loadExtension() {
  let registered = null;
  const context = vm.createContext({
    Scratch: {
      extensions: {
        unsandboxed: true,
        register: (ext) => {
          registered = ext;
        },
      },
      ArgumentType: new Proxy({}, { get: (_t, k) => String(k) }),
      BlockType: new Proxy({}, { get: (_t, k) => String(k) }),
      Cast,
    },
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
  assert.ok(registered, "extension registered");
  // The poll timers the tests need are the real ones; the hubs' own
  // background intervals were stubbed out above so the process can exit.
  context.setInterval = setInterval;
  context.clearInterval = clearInterval;
  return registered;
}

/** Capture what each hub is sent, in order. */
function captureSends(ext) {
  const sent = [];
  for (const hub of [ext._peripheral._repl, ext._peripheral._spike3]) {
    hub.sendPythonCommand = (code) => {
      sent.push(code);
      return Promise.resolve();
    };
  }
  return sent;
}

/** Whether a promise has settled by now, without waiting on it. */
async function settled(promise) {
  let done = false;
  promise.then(() => {
    done = true;
  });
  await new Promise((r) => setImmediate(r));
  return done;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// --- defect 2: the dialect's singular units reach MotorPair.move plural ----

test("singular units are sent plural", async () => {
  const ext = loadExtension();
  const sent = captureSends(ext);
  const cases = [
    ["rotation", "rotations"],
    ["degree", "degrees"],
    ["second", "seconds"],
    ["rotations", "rotations"],
    ["degrees", "degrees"],
  ];
  for (const [unit, plural] of cases) {
    sent.length = 0;
    // Tiny amounts so each wait is short (no readings: estimate + 0.5 s).
    const unitValue = unit.startsWith("second") ? 0.01 : 0.001;
    await ext.moveForward({
      DIRECTION: "forward",
      VALUE: unitValue,
      UNIT: unit,
    });
    assert.equal(sent.length, 1);
    assert.match(sent[0], new RegExp(`motors\\.move\\([^)]*'${plural}'`));
  }
});

test("cm and in are sent as rotations", async () => {
  const ext = loadExtension();
  const sent = captureSends(ext);
  await ext.setMovementMotors({
    PORT_A: "A",
    PORT_B: "B",
    WHEEL_CIRCUMFERENCE_CM: 17.6,
  });
  sent.length = 0;
  const done = ext.moveForward({
    DIRECTION: "backward",
    VALUE: 17.6,
    UNIT: "cm",
  });
  assert.match(sent[0], /motors\.move\(-1, 'rotations', speed=75\)/);
  await done;
});

// --- an empty or unknown port is a no-op, not a TypeError -------------------

test("a single-port block with no valid port does nothing", async () => {
  const ext = loadExtension();
  const sent = captureSends(ext);
  const before = JSON.stringify(ext._peripheral.motorSettings);
  for (const PORT of ["", "G", "A+B", undefined]) {
    await ext.motorSetStopAction({ PORT, ACTION: "hold" });
    await ext.motorRunToPosition({ PORT, POSITION: 90 });
    await ext.setMovementMotors({ PORT_A: PORT, PORT_B: "B" });
  }
  assert.equal(JSON.stringify(ext._peripheral.motorSettings), before);
  assert.deepEqual([...ext._peripheral.movementMotors], ["A", "B"]);
  assert.deepEqual(sent, []);
  await ext.motorSetStopAction({ PORT: " c ", ACTION: "hold" });
  assert.equal(ext._peripheral.motorSettings.C.stopMode, 2);
  assert.match(sent[0], /hub\.port\.C\.motor\.set_stop_action\('hold'\)/);
});

// --- defect 1: the block waits for the move to end --------------------------

test("waits for the counted position to advance by the wheel degrees", async () => {
  const ext = loadExtension();
  captureSends(ext);
  const positions = ext._peripheral._repl._sensors.motorPositions;
  positions.A = { relativePosition: 1000 };
  positions.B = { relativePosition: -50 };
  const started = Date.now();
  // 2 rotations = 720 wheel degrees; at speed 75 the fallback is > 4 s.
  const move = ext.moveForward({
    DIRECTION: "forward",
    VALUE: 2,
    UNIT: "rotations",
  });
  assert.equal(await settled(move), false, "returned while still moving");
  await sleep(100);
  // Halfway: still moving.
  positions.A = { relativePosition: 1360 };
  positions.B = { relativePosition: -410 };
  await sleep(100);
  assert.equal(await settled(move), false, "returned halfway");
  // Within a few degrees of the target on both wheels (B runs mirrored).
  positions.A = { relativePosition: 1718 };
  positions.B = { relativePosition: -768 };
  await move;
  const elapsed = Date.now() - started;
  assert.ok(
    elapsed < 1000,
    `resolved on arrival, not the fallback (${elapsed} ms)`
  );
});

test("SPIKE 2 status-stream positions (portValues) count too", async () => {
  const ext = loadExtension();
  captureSends(ext);
  const values = ext._peripheral._repl._portValues;
  values.A = { relativePosition: 0 };
  values.B = { relativePosition: 0 };
  const move = ext.moveForward({
    DIRECTION: "forward",
    VALUE: 90,
    UNIT: "degrees",
  });
  await sleep(60);
  assert.equal(await settled(move), false);
  values.A = { relativePosition: 90 };
  values.B = { relativePosition: -90 };
  const started = Date.now();
  await move;
  assert.ok(Date.now() - started < 200);
});

test("a hub that reports nothing continues after the time estimate", async () => {
  const ext = loadExtension();
  captureSends(ext);
  ext._peripheral.motorSettings.A.speed = 100;
  // 60 degrees at 100 % (600 deg/s) is 100 ms; + 0.5 s = 600 ms.
  const started = Date.now();
  const move = ext.moveForward({
    DIRECTION: "forward",
    VALUE: 60,
    UNIT: "degrees",
  });
  await sleep(450);
  assert.equal(await settled(move), false, "returned before the estimate");
  await move;
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 590 && elapsed < 1000, `fallback at ${elapsed} ms`);
});

test("run motor for degrees waits for a motor slower than the estimate", async () => {
  const ext = loadExtension();
  captureSends(ext);
  ext._peripheral.motorSettings.A.speed = 100;
  const positions = ext._peripheral._repl._sensors.motorPositions;
  positions.A = { relativePosition: 0 };
  // 60 degrees at 100 % is 100 ms; + 0.5 s = 600 ms. The motor is still
  // turning well after that (loaded, or a simulated hub running slow).
  const run = ext.motorRunFor({
    PORT: "A",
    DIRECTION: 1,
    VALUE: 60,
    UNIT: "degrees",
  });
  await sleep(250);
  positions.A = { relativePosition: 20 };
  await sleep(500);
  assert.equal(
    await settled(run),
    false,
    "returned at the wall-clock estimate"
  );
  positions.A = { relativePosition: 58 };
  await run;
});

test("seconds waits that long", async () => {
  const ext = loadExtension();
  captureSends(ext);
  const started = Date.now();
  const move = ext.moveForward({
    DIRECTION: "forward",
    VALUE: 0.3,
    UNIT: "second",
  });
  await sleep(200);
  assert.equal(await settled(move), false);
  await move;
  assert.ok(Date.now() - started >= 295);
});

// --- defect 3: the hub learns the pair; both fields agree -------------------

test("set movement motors sends MotorPair to the hub", async () => {
  const ext = loadExtension();
  const sent = captureSends(ext);
  await ext.setMovementMotors({ PORT_A: "c", PORT_B: "D" });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /motors = MotorPair\('C', 'D'\)/);
  assert.match(sent[0], /from spike import MotorPair/);
  assert.match(sent[0], /from mindstorms import MotorPair/);
  assert.doesNotMatch(sent[0], /\n/, "one REPL line");
});

test("movement commands define motors on the hub when it is missing", async () => {
  const ext = loadExtension();
  const sent = captureSends(ext);
  await ext.stopMovement();
  await ext.steer({ STEERING: 20 });
  for (const line of sent) {
    assert.match(line, /^exec\("try:\\n motors\\nexcept NameError:\\n/);
    assert.match(line, /motors = MotorPair\('A', 'B'\)"\); motors\./);
    assert.doesNotMatch(line, /\n/, "one REPL line");
  }
});

test("the selected movement pair survives switching to the SPIKE 3 route", async () => {
  const ext = loadExtension();
  const sent = captureSends(ext);
  const router = ext._peripheral;
  await ext.setMovementMotors({ PORT_A: "E", PORT_B: "F" });
  assert.deepEqual([...router.movementMotors], ["E", "F"]);
  assert.deepEqual([...router._movementMotors], ["E", "F"]);
  // The selected pair is retained when switching protocols, and movement
  // blocks use the controller command path rather than legacy Python.
  router._activeProtocol = "spike3";
  router._spike3._sensors.motorPositions.E = { motorType: 0x31 };
  router._spike3._sensors.motorPositions.F = { motorType: 0x31 };
  const commands = [];
  router.sendCommand = (method, params) => {
    commands.push({ method, params });
    return Promise.resolve();
  };
  await ext.setMovementMotors({ PORT_A: "E", PORT_B: "F" });
  await ext.steer({ STEERING: 25 });
  await ext.startTank({ LEFT_SPEED: 30, RIGHT_SPEED: -30 });
  await ext.stopMovement();
  assert.deepEqual([...router.movementMotors], ["E", "F"]);
  assert.deepEqual([...router._movementMotors], ["E", "F"]);
  assert.deepEqual(
    commands.map(({ method }) => method),
    [
      "scratch.motor_pair_configure",
      "scratch.motor_pair_move",
      "scratch.motor_pair_move_tank",
      "scratch.motor_pair_stop",
    ]
  );
  assert.equal(sent.length, 1, "only the initial legacy pair setup was sent");
});

test("SPIKE 3 distance movement requires wheel circumference and converts it", async () => {
  const ext = loadExtension();
  const router = ext._peripheral;
  router._activeProtocol = "spike3";
  router._spike3._sensors.motorPositions.A = { motorType: 0x31 };
  router._spike3._sensors.motorPositions.B = { motorType: 0x31 };
  const commands = [];
  router.sendCommand = (method, params) => {
    commands.push({ method, params });
    return Promise.resolve();
  };
  await assert.rejects(
    ext.moveForward({ DIRECTION: "forward", VALUE: 10, UNIT: "cm" }),
    /wheel circumference/
  );
  await ext.setMovementMotors({
    PORT_A: "A",
    PORT_B: "B",
    WHEEL_CIRCUMFERENCE_CM: 20,
  });
  await ext.moveForward({ DIRECTION: "forward", VALUE: 10, UNIT: "cm" });
  assert.equal(commands.at(-1).method, "scratch.motor_pair_move_degrees");
  assert.equal(commands.at(-1).params.degrees, 180);
  assert.equal(commands.at(-1).params.steering, 0);
  assert.equal(commands.at(-1).params.speed, 75);
});

// The generated hub Python must be valid: run it through CPython with stub
// spike/mindstorms modules when Python is on the machine.
test("the MotorPair line is valid Python when Python is present", async () => {
  const { spawnSync } = await import("node:child_process");
  const python = process.platform === "win32" ? "python" : "python3";
  const probe = spawnSync(python, ["--version"]);
  if (probe.status !== 0) {
    console.log(`  (${python} not found: this check did not run)`);
    return;
  }
  const ext = loadExtension();
  const sent = captureSends(ext);
  await ext.stopMovement();
  await ext.setMovementMotors({ PORT_A: "C", PORT_B: "D" });
  const program = [
    "import sys, types",
    "m = types.ModuleType('mindstorms')",
    "class MotorPair:",
    "    def __init__(self, a, b): self.ports = (a, b)",
    "    def stop(self): print('stop', self.ports)",
    "m.MotorPair = MotorPair",
    "sys.modules['mindstorms'] = m",
    // A first command with no motors defined, then the explicit set.
    sent[0],
    sent[1],
    "print('pair', motors.ports)",
  ].join("\n");
  const run = spawnSync(python, ["-c", program], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout.replace(/\r\n/g, "\n"),
    "stop ('A', 'B')\npair ('C', 'D')\n"
  );
});

test("a SPIKE 3 notification with a 3x3 matrix record keeps the records after it", () => {
  const ext = loadExtension();
  const hub = ext._peripheral._spike3;
  // Header (0x3c + size), a 3x3 matrix on port F, then a distance sensor on
  // port A reading 345 mm. Before the 0x0e case the parser stopped at the
  // matrix record, so every record after it was lost.
  const records = [
    0x0e,
    5,
    9,
    0,
    0,
    0,
    9,
    0,
    0,
    0,
    9,
    0x0d,
    0,
    345 & 0xff,
    345 >> 8,
  ];
  const data = Uint8Array.from([
    0x3c,
    records.length & 0xff,
    records.length >> 8,
    ...records,
  ]);
  hub._handleDeviceNotification(data);
  assert.equal(
    JSON.stringify(hub.portValues.F),
    JSON.stringify({ type: "matrix3", pixels: [9, 0, 0, 0, 9, 0, 0, 0, 9] })
  );
  assert.equal(hub.portValues.A.distance, 34.5);
});

test("SPIKE 3 rejects arbitrary Python snippets instead of sending them to TunnelMessage", async () => {
  const ext = loadExtension();
  const hub = ext._peripheral._spike3;
  const writes = [];
  hub._link = {
    isConnected: () => true,
    write: (_service, _char, base64) => {
      writes.push(Buffer.from(base64, "base64"));
      return Promise.resolve();
    },
  };
  await assert.rejects(
    hub.sendPythonCommand("motors.set_default_speed(30)"),
    /Raw Python is not executed by TunnelMessage/
  );
  await assert.rejects(
    hub.sendPythonCommandRaw("motors.start(0, speed=30)"),
    /Raw Python is not executed by TunnelMessage/
  );
  assert.equal(writes.length, 0, "no Python bytes are sent to the hub");
});

// SPIKE 3 device notifications read back through the blocks. The AXIS menu
// names a rotation; the hub's gyro is per sensor axis, and yaw is about z.
test("gyro rate [yaw] reads the IMU record's z rate (and pitch y, roll x)", () => {
  const ext = loadExtension();
  ext._peripheral._activeProtocol = "spike3";
  const imu = new Uint8Array(21);
  imu[0] = 0x01;
  const view = new DataView(imu.buffer);
  view.setInt16(15, 11, true); // gyro x
  view.setInt16(17, -22, true); // gyro y
  view.setInt16(19, 90, true); // gyro z
  ext._peripheral._spike3._handleDeviceNotification(
    Uint8Array.from([0x3c, imu.length, 0, ...imu])
  );
  assert.equal(ext.getGyroRate({ AXIS: "yaw" }), 9);
  assert.equal(ext.getGyroRate({ AXIS: "pitch" }), -2.2);
  assert.equal(ext.getGyroRate({ AXIS: "roll" }), 1.1);
  assert.equal(
    ext.getFilteredGyroRate({ AXIS: "yaw" }),
    "",
    "filtered data is not invented from raw BLE data"
  );
  ext._peripheral._spike3._handleControllerSensorSnapshot({
    gyro_filtered: [3, -4, 27],
    acceleration_filtered: [0, 0, 1000],
  });
  assert.equal(ext.getFilteredGyroRate({ AXIS: "yaw" }), 2.7);
  assert.equal(ext.getFilteredGyroRate({ AXIS: "pitch" }), -0.4);
  assert.equal(ext.getFilteredAcceleration({ AXIS: "z" }), 1000);
});

test("raw colour channels read the colour record's red, green and blue", () => {
  const ext = loadExtension();
  ext._peripheral._activeProtocol = "spike3";
  const record = new Uint8Array(9);
  record.set([0x0c, 2, 9]); // port C, colour red
  const view = new DataView(record.buffer);
  view.setUint16(3, 900, true);
  view.setUint16(5, 150, true);
  view.setUint16(7, 140, true);
  ext._peripheral._spike3._handleDeviceNotification(
    Uint8Array.from([0x3c, record.length, 0, ...record])
  );
  assert.equal(ext.getColorRGB({ PORT: "C", CHANNEL: "red" }), 900);
  assert.equal(ext.getColorRGB({ PORT: "C", CHANNEL: "green" }), 150);
  assert.equal(ext.getColorRGB({ PORT: "C", CHANNEL: "blue" }), 140);
  assert.equal(ext.getColorRGB({ PORT: "D", CHANNEL: "red" }), "");
});

// --- "start motor at % power": a duty cycle, not a speed ---------------------

test("start motor at % power uses the controller on SPIKE 3 and legacy fallback on 2.x", async () => {
  const ext = loadExtension();
  const sent = captureSends(ext);
  const commands = [];
  ext._peripheral.sendCommand = (method, params) => {
    commands.push({ method, params });
    return Promise.resolve();
  };
  ext._peripheral._activeProtocol = "spike3";
  await ext.motorStartPower({ PORT: "B", POWER: 50 });
  assert.equal(
    JSON.stringify(commands),
    JSON.stringify([
      { method: "scratch.motor_power", params: { port: "B", power: 5000 } },
    ])
  );
  commands.length = 0;
  await ext.motorStartPower({ PORT: "B", POWER: 12.34 });
  assert.equal(
    JSON.stringify(commands),
    JSON.stringify([
      { method: "scratch.motor_power", params: { port: "B", power: 1234 } },
    ])
  );
  // 2.x hub module: motor.pwm(-100..100), clamped, one call per port.
  sent.length = 0;
  ext._peripheral.sendCommand = () => Promise.reject(new Error("unsupported"));
  ext._peripheral._activeProtocol = "repl";
  await ext.motorStartPower({ PORT: "A+C", POWER: -130 });
  assert.deepEqual(sent, [
    "import hub; hub.port.A.motor.pwm(-100)",
    "import hub; hub.port.C.motor.pwm(-100)",
  ]);
  // It is a block of its own, labelled as a power in every language.
  const info = ext.getInfo();
  const block = info.blocks.find((b) => b && b.opcode === "motorStartPower");
  assert.ok(block, "motorStartPower is a block");
  assert.match(block.text, /\[POWER\]/);
});

test("start motor's MicroPython fallback asks for a speed, not a duty", async () => {
  const ext = loadExtension();
  const sent = captureSends(ext);
  // A hub that does not take the JSON-RPC verb: the block falls back to MicroPython.
  ext._peripheral._repl.sendCommand = () =>
    Promise.reject(new Error("no verb"));
  ext._peripheral._activeProtocol = "repl";
  ext._peripheral.motorSettings.A.speed = 50;
  await ext.motorStart({ PORT: "A", DIRECTION: -1 });
  assert.deepEqual(sent, ["import hub; hub.port.A.motor.run_at_speed(-50)"]);
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

// Exercise every SPIKE extension opcode through the existing Scratch-to-Python
// transpiler, then parse the resulting Python. This is a local fake VM test;
// it does not connect to or claim compatibility with a physical hub.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL(
    "../extensions/CrispStrobe/legospike_turbowarp_transpile.js",
    import.meta.url
  ),
  "utf8"
);
let extension;
const runtime = { targets: [] };
const context = vm.createContext({
  Scratch: {
    extensions: {
      unsandboxed: true,
      register: (value) => {
        extension = value;
      },
    },
    ArgumentType: new Proxy({}, { get: (_target, key) => String(key) }),
    BlockType: new Proxy({}, { get: (_target, key) => String(key) }),
    Cast: {
      toString: (value) => String(value),
      toNumber: (value) => Number(value),
      toBoolean: (value) => Boolean(value),
    },
    vm: { runtime },
  },
  window: {
    location: { search: "?spikePrimeDiagnostics=1" },
    addEventListener() {},
    removeEventListener() {},
  },
  navigator: { language: "ja-JP", languages: ["ja-JP"] },
  console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  clearInterval() {},
  TextEncoder,
  btoa,
  atob,
  Date,
  Promise,
});

vm.runInContext(source, context);
assert.ok(extension, "extension registers in the fake Scratch VM");

const parseStringMap = (mapName) => {
  const match = source.match(
    new RegExp(`const ${mapName} = \\{([\\s\\S]*?)\\n\\s*\\};`)
  );
  assert.ok(match, `${mapName} exists in the JavaScript encoder`);
  return Object.fromEntries(
    Array.from(match[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g), (entry) => [
      entry[1],
      entry[2],
    ])
  );
};

const commandCodes = parseStringMap("commandCodes");
const fieldCodes = parseStringMap("fieldCodes");
const controllerSource = source.match(
  /const SPIKE3_CONTROLLER_SOURCE = String\.raw`([\s\S]*?)`;\s*\n/
)?.[1];
assert.ok(controllerSource, "embedded controller source is present");
const receiveWhitelist = controllerSource.match(
  /if name not in \(([\s\S]*?)\):\s*\n\s*raise ValueError\("unsupported command"\)/
);
assert.ok(receiveWhitelist, "Python receive whitelist is present");
const pythonAllowedCommands = new Set(
  Array.from(receiveWhitelist[1].matchAll(/"([^"]+)"/g), (entry) => entry[1])
);
const dispatchSource = controllerSource.match(
  /async def _dispatch\(command\):([\s\S]*?)\n\nasync def _process_next/
)?.[1];
assert.ok(dispatchSource, "Python command dispatcher is present");
const pythonDispatchCommands = new Set();
for (const match of dispatchSource.matchAll(/(?:if|elif) name == "([^"]+)"/g)) {
  pythonDispatchCommands.add(match[1]);
}
for (const match of dispatchSource.matchAll(/elif name in \(([^)]+)\)/g)) {
  for (const command of match[1].matchAll(/"([^"]+)"/g)) {
    pythonDispatchCommands.add(command[1]);
  }
}
pythonDispatchCommands.add("x"); // emergency stop is dispatched directly in _receive
const spike3 = extension._peripheral._spike3;
const encodedCommandCodes = new Set();
for (const [command, code] of Object.entries(commandCodes)) {
  const encoded = spike3._encodeControllerCommand(command, {}, 1);
  assert.equal(encoded.c, code, `${command} uses the mapped controller ID`);
  assert.ok(!encodedCommandCodes.has(code), `controller ID ${code} is unique`);
  encodedCommandCodes.add(code);
}
assert.deepEqual(
  [...encodedCommandCodes].sort(),
  [...pythonAllowedCommands].sort(),
  "JavaScript command IDs and the Python receive whitelist match"
);
assert.deepEqual(
  [...encodedCommandCodes].sort(),
  [...pythonDispatchCommands].sort(),
  "every JavaScript command ID has a Python execution/stop branch"
);
for (const [field, code] of Object.entries(fieldCodes)) {
  const encoded = spike3._encodeControllerCommand(
    "controller.hello",
    {
      [field]: "field-value",
    },
    1
  );
  assert.equal(encoded[code], "field-value", `${field} uses field ID ${code}`);
}

const info = extension.getInfo();
const blocks = info.blocks.filter((block) => block && block.opcode);
assert.equal(
  blocks.length,
  109,
  "developer audit includes all 108 regular blocks and the opt-in probe"
);
for (const block of blocks) {
  assert.equal(
    typeof extension[block.opcode],
    "function",
    `${block.opcode} has a Scratch handler`
  );
}

const codeBlocks = {};
let nextId = 0;
const primitiveInput = (value) => [
  1,
  [typeof value === "number" ? 4 : 10, value],
];
const addBlock = (block) => {
  const id = `b${nextId++}`;
  codeBlocks[id] = block;
  return id;
};

const reporterTypes = new Set(["REPORTER", "BOOLEAN"]);
const hats = blocks.filter((block) => block.blockType === "HAT");
const commands = blocks.filter((block) => block.blockType === "COMMAND");
const reporters = blocks.filter((block) => reporterTypes.has(block.blockType));
const defaultInputs = (block) =>
  Object.fromEntries(
    Object.entries(block.arguments || {}).map(([name, argument]) => [
      name,
      primitiveInput(
        argument.defaultValue ?? (argument.type === "NUMBER" ? 0 : "")
      ),
    ])
  );

for (const block of commands) {
  const statement = addBlock({
    opcode: `spikeprime_${block.opcode}`,
    next: null,
    inputs: defaultInputs(block),
    fields: {},
  });
  addBlock({
    opcode: "event_whenflagclicked",
    next: statement,
    inputs: {},
    fields: {},
  });
}

for (const block of hats) {
  const suffix = block.opcode === "runStartupProbe" ? "" : `spikeprime_`;
  const hatOpcode = `${suffix}${block.opcode}`;
  const body = addBlock({
    opcode: "spikeprime_displayClear",
    next: null,
    inputs: {},
    fields: {},
  });
  addBlock({
    opcode: hatOpcode,
    next: body,
    inputs: defaultInputs(block),
    fields: {},
  });
}

runtime.targets = [
  {
    isStage: true,
    sprite: { name: "Stage" },
    blocks: { _blocks: codeBlocks },
  },
];
extension.transpileProject();
const generated = extension.getTranspiledCode();
assert.ok(
  generated.includes("runloop.run("),
  "generated code starts the Hub OS runloop"
);
assert.ok(
  generated.includes("import time"),
  "generated code uses the supported hub time module"
);
assert.ok(
  generated.includes("await motor.run_for_degrees"),
  "timed motor operations are awaited"
);
assert.ok(
  generated.includes("await light_matrix.write"),
  "matrix text is awaited"
);
assert.ok(
  generated.includes("NotImplementedError"),
  "unsupported operations fail visibly instead of emitting fake output"
);
for (const legacyApi of [
  "hub.port.",
  "hub.display.",
  "hub.motion.",
  "hub.sound.SOUND_",
  ".mode(",
  'get_sensor("',
]) {
  assert.ok(
    !generated.includes(legacyApi),
    `generated Python excludes legacy API ${legacyApi}`
  );
}

const python = process.platform === "win32" ? "python" : "python3";
const syntax = spawnSync(
  python,
  ["-c", "import ast,sys; ast.parse(sys.stdin.read())"],
  {
    input: generated,
    encoding: "utf8",
  }
);
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

const reporterFailures = [];
const reporterCode = [];
for (const block of reporters) {
  const reportId = "report";
  const assignId = "assign";
  runtime.targets = [
    {
      isStage: true,
      sprite: { name: "Stage" },
      blocks: {
        _blocks: {
          [reportId]: {
            opcode: `spikeprime_${block.opcode}`,
            next: null,
            inputs: defaultInputs(block),
            fields: {},
          },
          [assignId]: {
            opcode: "data_setvariableto",
            next: null,
            inputs: { VALUE: { block: reportId } },
            fields: { VARIABLE: { value: "audit_value" } },
          },
          hat: {
            opcode: "event_whenflagclicked",
            next: assignId,
            inputs: {},
            fields: {},
          },
        },
      },
    },
  ];
  try {
    extension.transpileProject();
    const code = extension.getTranspiledCode();
    reporterCode.push(code);
    const reportSyntax = spawnSync(
      python,
      ["-c", "import ast,sys; ast.parse(sys.stdin.read())"],
      {
        input: code,
        encoding: "utf8",
      }
    );
    if (reportSyntax.status !== 0)
      reporterFailures.push(`${block.opcode}: ${reportSyntax.stderr}`);
  } catch (error) {
    reporterFailures.push(`${block.opcode}: ${error.message}`);
  }
}
assert.deepEqual(
  reporterFailures,
  [],
  `every reporter must generate valid Python or an explicit runtime limitation: ${reporterFailures.join("; ")}`
);
const generatedReporters = reporterCode.join("\n");
assert.ok(
  generatedReporters.includes("motion_sensor.angular_velocity(False)"),
  "filtered gyro uses the filtered SPIKE API"
);
assert.ok(
  generatedReporters.includes("distance_sensor.distance"),
  "distance readings use the SPIKE 3 sensor API"
);
assert.ok(
  generatedReporters.includes("time.ticks_diff(time.ticks_ms(), timer_start)"),
  "timer reporters use the supported hub time module"
);

console.log(
  `SPIKE codegen coverage passed for ${blocks.length} opcodes; generated Python parsed successfully (fake VM, no hub connection).`
);

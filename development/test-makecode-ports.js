// Headless checks for the five MakeCode ports (spriteutils, statusbars,
// carnival, settingsblocks, neopixel). Each extension is loaded in a vm
// against a small mocked Scratch runtime; every block is called once with its
// default arguments, then the semantics that differ from a naive reading are
// pinned individually.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const FILES = {
  spriteutils: "spriteutils",
  statusbars: "statusbars",
  carnival: "carnival",
  settingsblocks: "settingsblocks",
  neopixelstrips: "neopixel",
};

const proxyEnum = () => new Proxy({}, { get: (_, k) => String(k) });

function makeTarget(runtime, name, x = 0, y = 0, half = 10) {
  const t = {
    id: `${name}-${runtime.targets.length}`,
    isStage: false,
    isOriginal: true,
    sprite: { name },
    x,
    y,
    dragging: false,
    getName: () => name,
    setXY(nx, ny) {
      t.x = nx;
      t.y = ny;
    },
    getBounds: () => ({
      left: t.x - half,
      right: t.x + half,
      top: t.y + half,
      bottom: t.y - half,
    }),
    makeClone() {
      const c = makeTarget(
        { targets: [], getTargetById: () => null },
        name,
        t.x,
        t.y,
        half
      );
      c.isOriginal = false;
      c.id = `${name}-clone-${runtime.targets.length}`;
      return c;
    },
  };
  runtime.targets.push(t);
  return t;
}

function makeRuntime({ withRenderer = true } = {}) {
  const listeners = {};
  const calls = [];
  const rec =
    (name, ret) =>
    (...a) => {
      calls.push([name, ...a]);
      return typeof ret === "function" ? ret(...a) : ret;
    };
  let nextId = 1;
  const runtime = {
    targets: [],
    currentStepTime: 100,
    started: [],
    stopped: 0,
    ioDevices: { keyboard: { getKeyIsDown: () => false } },
    on: (e, f) => (listeners[e] = (listeners[e] || []).concat(f)),
    off: (e, f) => (listeners[e] = (listeners[e] || []).filter((g) => g !== f)),
    emit: (e) => (listeners[e] || []).forEach((f) => f()),
    getSpriteTargetByName: (n) =>
      runtime.targets.find((t) => t.isOriginal && t.getName() === n),
    getTargetById: (id) => runtime.targets.find((t) => t.id === id),
    addTarget: (t) => runtime.targets.push(t),
    disposeTarget: (t) => {
      runtime.targets = runtime.targets.filter((x) => x !== t);
    },
    stopForTarget: () => {},
    startHats: (...a) => runtime.started.push(a),
    stopAll: () => {
      runtime.stopped++;
      runtime.emit("PROJECT_STOP_ALL");
    },
    calls,
    renderer: withRenderer
      ? {
          createSVGSkin: rec("createSVGSkin", () => nextId++),
          updateSVGSkin: rec("updateSVGSkin"),
          createDrawable: rec("createDrawable", () => nextId++),
          updateDrawableSkinId: rec("updateDrawableSkinId"),
          updateDrawablePosition: rec("updateDrawablePosition"),
          updateDrawableVisible: rec("updateDrawableVisible"),
          setDrawableOrder: rec("setDrawableOrder"),
          destroyDrawable: rec("destroyDrawable"),
          destroySkin: rec("destroySkin"),
        }
      : null,
  };
  return runtime;
}

function load(file, { runtime = makeRuntime(), localStorage } = {}) {
  let extension;
  const Scratch = {
    extensions: { register: (e) => (extension = e), unsandboxed: true },
    translate: (message) =>
      typeof message === "string" ? message : message?.default,
    vm: { runtime },
    Cast: {
      toNumber: (v) => Number(v) || 0,
      toString: (v) => String(v),
    },
    BlockType: proxyEnum(),
    ArgumentType: proxyEnum(),
  };
  const source = fs.readFileSync(
    new URL(`../extensions/CrispStrobe/${file}.js`, import.meta.url),
    "utf8"
  );
  const context = {
    console,
    Scratch,
    Math,
    Date,
    Uint8Array,
    JSON,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    globalThis: undefined,
  };
  context.globalThis = context;
  if (localStorage !== undefined) context.localStorage = localStorage;
  vm.runInContext(source, vm.createContext(context));
  return { ext: extension, runtime };
}

const memoryStorage = () => {
  const m = new Map();
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

const util = (runtime, target) => ({
  target,
  stopAll: () => runtime.stopAll(),
});

function defaultArgs(ext, block) {
  const info = ext.getInfo();
  const args = {};
  for (const [name, def] of Object.entries(block.arguments || {})) {
    if (def.defaultValue !== undefined) args[name] = def.defaultValue;
    else if (def.menu) {
      const menu = info.menus[def.menu];
      const items =
        typeof menu.items === "string" ? ext[menu.items]() : menu.items;
      const first = items[0];
      args[name] = typeof first === "object" ? first.value : first;
    } else args[name] = "";
  }
  return args;
}

for (const [id, file] of Object.entries(FILES)) {
  test(`${file}: header ID matches getInfo and every block has a method`, () => {
    const { ext } = load(file);
    const header = fs
      .readFileSync(
        new URL(`../extensions/CrispStrobe/${file}.js`, import.meta.url),
        "utf8"
      )
      .match(/^\/\/ ID: (\S+)/m)[1];
    const info = ext.getInfo();
    assert.equal(info.id, id);
    assert.equal(header, id);
    const blocks = info.blocks.filter((b) => b && b.opcode);
    assert.ok(blocks.length > 5);
    for (const b of blocks) {
      assert.equal(typeof ext[b.opcode], "function", b.opcode);
      for (const arg of Object.values(b.arguments || {})) {
        if (arg.menu)
          assert.ok(info.menus[arg.menu], `${b.opcode}: menu ${arg.menu}`);
      }
    }
  });

  test(`${file}: every block runs once with default arguments`, () => {
    const runtime = makeRuntime();
    const me = makeTarget(runtime, "Me", 10, 20);
    makeTarget(runtime, "Other", 40, 60);
    const { ext } = load(file, { runtime, localStorage: memoryStorage() });
    const blocks = ext.getInfo().blocks.filter((b) => b && b.opcode);
    // Deleting blocks last, so the others have something to act on.
    const ordered = [
      ...blocks.filter((b) => !/^remove/.test(b.opcode)),
      ...blocks.filter((b) => /^remove/.test(b.opcode)),
    ];
    for (const b of ordered) {
      const args = defaultArgs(ext, b);
      for (const k of Object.keys(args)) {
        if (args[k] === "myself") args[k] = "_myself_";
      }
      assert.doesNotThrow(
        () => ext[b.opcode](args, util(runtime, me)),
        b.opcode
      );
    }
    assert.doesNotThrow(() => runtime.emit("BEFORE_EXECUTE"));
    assert.doesNotThrow(() => runtime.emit("AFTER_EXECUTE"));
    assert.doesNotThrow(() => runtime.emit("PROJECT_START"));
  });

  test(`${file}: loads and runs without a renderer`, () => {
    const runtime = makeRuntime({ withRenderer: false });
    const me = makeTarget(runtime, "Me");
    const { ext } = load(file, { runtime, localStorage: memoryStorage() });
    for (const b of ext.getInfo().blocks.filter((x) => x && x.opcode)) {
      assert.doesNotThrow(
        () => ext[b.opcode](defaultArgs(ext, b), util(runtime, me)),
        b.opcode
      );
    }
    assert.doesNotThrow(() => runtime.emit("AFTER_EXECUTE"));
  });
}

// spriteutils ------------------------------------------------------------------

test("spriteutils: geometry uses Scratch's y-up stage", () => {
  const runtime = makeRuntime();
  const a = makeTarget(runtime, "A", 0, 0);
  const b = makeTarget(runtime, "B", 3, 4);
  const { ext } = load("spriteutils", { runtime });
  const u = util(runtime, a);
  assert.equal(ext.distanceBetween({ A: "A", B: "B" }, u), 5);
  assert.equal(ext.distanceBetween({ A: "A", B: "Nope" }, u), 0);
  assert.equal(ext.isDestroyed({ SPRITE: "Nope" }, u), true);
  assert.equal(ext.isDestroyed({ SPRITE: "B" }, u), false);
  // B is up and to the right: positive radians, Scratch direction < 90.
  assert.ok(
    Math.abs(ext.angleFrom({ A: "A", B: "B" }, u) - Math.atan2(4, 3)) < 1e-12
  );
  assert.ok(
    Math.abs(ext.directionFrom({ A: "A", B: "B" }, u) - 36.8699) < 1e-3
  );
  ext.placeAngleFrom(
    { MOVE: "B", ANGLE: Math.PI / 2, DISTANCE: 10, FROM: "A" },
    u
  );
  assert.ok(Math.abs(b.x) < 1e-9 && Math.abs(b.y - 10) < 1e-9);
  assert.equal(ext.round({ VALUE: 3.14159, DIGITS: 2 }), "3.14");
  assert.equal(ext.round({ VALUE: 2, DIGITS: 3 }), "2.000");
  assert.equal(ext.countWithin({ KIND: "B", DISTANCE: 20, SPRITE: "A" }, u), 1);
  assert.equal(ext.nearestDistance({ KIND: "B", SPRITE: "A" }, u), 10);
});

test("spriteutils: velocity moves a sprite each frame and stops with the project", () => {
  const runtime = makeRuntime();
  const a = makeTarget(runtime, "A", 0, 0);
  const b = makeTarget(runtime, "B", 100, 0);
  const { ext } = load("spriteutils", { runtime });
  const u = util(runtime, a);
  ext.setVelocityToward({ SPRITE: "A", TARGET: "B", SPEED: 60 }, u);
  runtime.emit("BEFORE_EXECUTE"); // 100 ms step
  assert.ok(Math.abs(a.x - 6) < 1e-9 && Math.abs(a.y) < 1e-9);
  assert.equal(ext.getVelocity({ AXIS: "x", SPRITE: "A" }, u), 60);
  ext.setAcceleration({ SPRITE: "B", AX: 0, AY: -200 }, u);
  ext.jump({ SPRITE: "B", PIXELS: 50 }, u);
  assert.ok(
    Math.abs(
      ext.getVelocity({ AXIS: "y", SPRITE: "B" }, u) - Math.sqrt(2 * 50 * 200)
    ) < 1e-9
  );
  runtime.emit("PROJECT_STOP_ALL");
  assert.equal(ext.getVelocity({ AXIS: "x", SPRITE: "A" }, u), 0);
  // A deleted sprite's motion is dropped without error.
  ext.setVelocity({ SPRITE: "A", VX: 5, VY: 0 }, u);
  runtime.targets = runtime.targets.filter((t) => t !== a);
  assert.doesNotThrow(() => runtime.emit("BEFORE_EXECUTE"));
  void b;
});

// settingsblocks -----------------------------------------------------------------

test("settingsblocks: typed values round-trip, mismatches read empty", () => {
  const ls = memoryStorage();
  const { ext } = load("settingsblocks", { localStorage: ls });
  ext.writeNumber({ NAME: "n", VALUE: "42" });
  ext.writeString({ NAME: "s", VALUE: "hi" });
  ext.writeNumberArray({ NAME: "a", VALUE: '[1, 2.5, "x"]' });
  ext.writeNumberArray({ NAME: "b", VALUE: "3, 4 5" });
  assert.equal(ext.readNumber({ NAME: "n" }), 42);
  assert.equal(ext.readString({ NAME: "s" }), "hi");
  assert.equal(ext.readNumberArray({ NAME: "a" }), "[1,2.5,0]");
  assert.equal(ext.readNumberArray({ NAME: "b" }), "[3,4,5]");
  assert.equal(ext.readNumber({ NAME: "s" }), "");
  assert.equal(ext.readString({ NAME: "n" }), "");
  assert.equal(ext.readNumber({ NAME: "missing" }), "");
  assert.equal(ext.exists({ NAME: "n" }), true);
  assert.equal(ext.list(), '["a","b","n","s"]');
  ext.remove({ NAME: "n" });
  assert.equal(ext.exists({ NAME: "n" }), false);
  assert.ok(
    Array.from(ls.m.keys()).every((k) =>
      k.startsWith("bwext.settings.v1:default:")
    )
  );
  ext.clear();
  assert.equal(ext.list(), "[]");
});

test("settingsblocks: namespaces are separate and clear touches only one", () => {
  const ls = memoryStorage();
  ls.setItem("someone.elses.key", "keep");
  const { ext } = load("settingsblocks", { localStorage: ls });
  ext.writeNumber({ NAME: "n", VALUE: 1 });
  ext.setNamespace({ NAMESPACE: "game2" });
  assert.equal(ext.getNamespace(), "game2");
  assert.equal(ext.exists({ NAME: "n" }), false);
  ext.writeNumber({ NAME: "n", VALUE: 2 });
  ext.clear();
  assert.equal(ext.exists({ NAME: "n" }), false);
  ext.setNamespace({ NAMESPACE: "default" });
  assert.equal(ext.readNumber({ NAME: "n" }), 1);
  assert.equal(ls.getItem("someone.elses.key"), "keep");
});

test("settingsblocks: storage that throws falls back to this session", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
    key() {
      throw new Error("blocked");
    },
    get length() {
      throw new Error("blocked");
    },
  };
  for (const localStorage of [broken, undefined]) {
    const { ext } = load("settingsblocks", { localStorage });
    assert.equal(ext.isPersistent(), false);
    ext.writeNumber({ NAME: "n", VALUE: 7 });
    assert.equal(ext.readNumber({ NAME: "n" }), 7);
    assert.equal(ext.list(), '["n"]');
    ext.remove({ NAME: "n" });
    assert.equal(ext.exists({ NAME: "n" }), false);
  }
});

test("settingsblocks: a quota error after the probe keeps the value in memory", () => {
  const ls = memoryStorage();
  let full = false;
  const real = ls.setItem;
  ls.setItem = (k, v) => {
    if (full && !k.endsWith("probe")) throw new Error("QuotaExceededError");
    real(k, v);
  };
  const { ext } = load("settingsblocks", { localStorage: ls });
  assert.equal(ext.isPersistent(), true);
  full = true;
  ext.writeString({ NAME: "s", VALUE: "kept" });
  assert.equal(ext.readString({ NAME: "s" }), "kept");
});

// neopixel -------------------------------------------------------------------------

const ledColors = (runtime) => {
  const call = [...runtime.calls]
    .reverse()
    .find((c) => c[0] === "createSVGSkin" || c[0] === "updateSVGSkin");
  const svg = call[call.length - 1];
  return Array.from(svg.matchAll(/<circle[^>]* fill="([^"]+)"/g)).map((m) => {
    const rgb = /rgb\((\d+),(\d+),(\d+)\)/.exec(m[1]);
    return rgb ? rgb.slice(1).map(Number) : [0, 0, 0];
  });
};

const strip = (ext, over = {}) =>
  ext.create({ STRIP: "s", PIN: "P0", LEDS: 4, MODE: "1", ...over });

test("neopixel: nothing is drawn until show; brightness uses the >>8 rule", () => {
  const { ext, runtime } = load("neopixel");
  strip(ext);
  ext.setBrightness({ STRIP: "s", BRIGHTNESS: 255 });
  ext.setPixelColor({ STRIP: "s", PIXEL: 1, COLOR: "#ff0000" });
  assert.equal(runtime.calls.filter((c) => c[0] === "createSVGSkin").length, 0);
  ext.show({ STRIP: "s" });
  assert.deepEqual(ledColors(runtime)[1], [255, 0, 0]);
  assert.deepEqual(ledColors(runtime)[0], [0, 0, 0]);
  // default brightness is 128: (255 * 128) >> 8 = 127
  strip(ext);
  ext.showColor({ STRIP: "s", COLOR: "#ffffff" });
  assert.deepEqual(ledColors(runtime)[0], [127, 127, 127]);
});

test("neopixel: RGB (RGB format) and GRB give the same picture; RGBW adds white", () => {
  const { ext, runtime } = load("neopixel");
  for (const mode of ["1", "3"]) {
    strip(ext, { MODE: mode });
    ext.setBrightness({ STRIP: "s", BRIGHTNESS: 255 });
    ext.showColor({ STRIP: "s", COLOR: "#102030" });
    assert.deepEqual(ledColors(runtime)[0], [16, 32, 48], `mode ${mode}`);
  }
  strip(ext, { MODE: "2" });
  ext.setBrightness({ STRIP: "s", BRIGHTNESS: 255 });
  ext.setPixelColor({ STRIP: "s", PIXEL: 0, COLOR: "#000000" });
  ext.setPixelWhite({ STRIP: "s", PIXEL: 0, WHITE: 100 });
  ext.show({ STRIP: "s" });
  assert.deepEqual(ledColors(runtime)[0], [100, 100, 100]);
  // white on a non-RGBW strip is ignored
  strip(ext, { MODE: "1" });
  ext.setPixelWhite({ STRIP: "s", PIXEL: 0, WHITE: 255 });
  ext.show({ STRIP: "s" });
  assert.deepEqual(ledColors(runtime)[0], [0, 0, 0]);
});

test("neopixel: shift zero-fills, rotate wraps, ranges share the buffer", () => {
  const { ext, runtime } = load("neopixel");
  strip(ext, { LEDS: 4 });
  ext.setBrightness({ STRIP: "s", BRIGHTNESS: 255 });
  const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffffff"];
  colors.forEach((c, i) =>
    ext.setPixelColor({ STRIP: "s", PIXEL: i, COLOR: c })
  );
  ext.rotate({ STRIP: "s", OFFSET: 1 });
  ext.show({ STRIP: "s" });
  assert.deepEqual(ledColors(runtime), [
    [255, 255, 255],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ]);
  ext.shift({ STRIP: "s", OFFSET: 2 });
  ext.show({ STRIP: "s" });
  assert.deepEqual(ledColors(runtime), [
    [0, 0, 0],
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
  ]);
  // a range of the last two LEDs: clear touches only those
  ext.range({ RANGE: "r", STRIP: "s", START: 2, LENGTH: 99 });
  assert.equal(ext.length({ STRIP: "r" }), 2);
  ext.clear({ STRIP: "r" });
  ext.show({ STRIP: "s" });
  assert.deepEqual(ledColors(runtime).slice(2), [
    [0, 0, 0],
    [0, 0, 0],
  ]);
  // out of range pixel writes are ignored
  assert.doesNotThrow(() =>
    ext.setPixelColor({ STRIP: "r", PIXEL: 5, COLOR: "#ffffff" })
  );
});

test("neopixel: rainbow, bar graph, hsl, power, matrix", () => {
  const { ext, runtime } = load("neopixel");
  strip(ext, { LEDS: 6 });
  ext.setBrightness({ STRIP: "s", BRIGHTNESS: 255 });
  ext.showRainbow({ STRIP: "s", START: 1, END: 360 });
  const rainbow = ledColors(runtime);
  assert.equal(rainbow.length, 6);
  assert.ok(rainbow[0][0] > rainbow[0][1] && rainbow[0][0] > rainbow[0][2]); // starts red
  assert.equal(new Set(rainbow.map((c) => c.join())).size, 6);
  ext.showBarGraph({ STRIP: "s", VALUE: 255, HIGH: 255 });
  assert.deepEqual(ledColors(runtime)[5], [255, 0, 0]);
  ext.showBarGraph({ STRIP: "s", VALUE: 10, HIGH: 0 });
  assert.deepEqual(ledColors(runtime)[0], [255, 255, 0]);
  assert.equal(ext.hsl({ H: 0, S: 99, L: 50 }) >> 16 > 200, true);
  assert.equal(ext.rgb({ RED: 1, GREEN: 2, BLUE: 3 }), 0x010203);
  assert.equal(ext.colors({ COLOR: "orange" }), 0xffa500);
  ext.showColor({ STRIP: "s", COLOR: "#ffffff" });
  // 6 leds * 0.7 + bytes * 480 / 10000, all bytes 255
  assert.equal(
    ext.power({ STRIP: "s" }),
    Math.trunc((6 * 7) / 10) + Math.trunc((6 * 3 * 255 * 480) / 10000)
  );
  strip(ext, { LEDS: 6 });
  ext.setBrightness({ STRIP: "s", BRIGHTNESS: 255 });
  ext.setMatrixWidth({ STRIP: "s", WIDTH: 3 });
  ext.setMatrixColor({ STRIP: "s", X: 2, Y: 1, COLOR: "#0000ff" });
  ext.setMatrixColor({ STRIP: "s", X: 3, Y: 0, COLOR: "#ff0000" }); // outside: ignored
  ext.show({ STRIP: "s" });
  assert.deepEqual(ledColors(runtime)[5], [0, 0, 255]);
  assert.equal(ledColors(runtime).filter((c) => c.some(Boolean)).length, 1);
});

// statusbars ---------------------------------------------------------------------

test("statusbars: bar sits above the sprite and follows it", () => {
  const runtime = makeRuntime();
  const me = makeTarget(runtime, "Me", 0, 0, 10);
  const { ext } = load("statusbars", { runtime });
  const u = util(runtime, me);
  ext.create({ KIND: "Health", SPRITE: "_myself_", WIDTH: 60, HEIGHT: 12 }, u);
  runtime.emit("AFTER_EXECUTE");
  const pos = () =>
    Array.from(
      [...runtime.calls]
        .reverse()
        .find((c) => c[0] === "updateDrawablePosition")[2]
    );
  assert.deepEqual(pos(), [0, 16]); // bounds top 10 + padding 0 + half height 6
  me.x = 50;
  me.y = 30;
  runtime.emit("AFTER_EXECUTE");
  assert.deepEqual(pos(), [50, 46]);
  ext.setPaddingOffset(
    { KIND: "Health", SPRITE: "_myself_", PADDING: 4, OFFSET: 5 },
    u
  );
  assert.deepEqual(pos(), [55, 50]);
  ext.setPosition(
    { KIND: "Health", SPRITE: "_myself_", DIRECTION: "bottom" },
    u
  );
  assert.deepEqual(pos(), [55, 30 - 10 - 4 - 6]);
});

test("statusbars: value, max, constrain, flags and the zero hat", () => {
  const runtime = makeRuntime();
  const me = makeTarget(runtime, "Me");
  const { ext } = load("statusbars", { runtime });
  const u = util(runtime, me);
  const a = { KIND: "Health", SPRITE: "_myself_" };
  ext.create({ ...a, WIDTH: 100, HEIGHT: 10 }, u);
  assert.equal(ext.getValue(a, u), 100);
  ext.changeValue({ ...a, VALUE: -150 }, u);
  assert.equal(ext.getValue(a, u), 0); // constrained to 0..max
  assert.equal(ext.whenZero({ KIND: "Health" }, u), true);
  ext.setValue({ ...a, VALUE: 40 }, u);
  assert.equal(ext.whenZero({ KIND: "Health" }, u), false);
  assert.equal(
    ext.whenReached(
      { KIND: "Health", COMPARISON: "<=", VALUE: 50, UNIT: "percent" },
      u
    ),
    true
  );
  assert.equal(
    ext.whenReached(
      { KIND: "Health", COMPARISON: ">", VALUE: 50, UNIT: "fixed" },
      u
    ),
    false
  );
  ext.setFlag({ ...a, FLAG: "constrain", ON: "off" }, u);
  ext.setValue({ ...a, VALUE: 500 }, u);
  assert.equal(ext.getValue(a, u), 500);
  ext.setFlag({ ...a, FLAG: "ignoreEvents", ON: "on" }, u);
  ext.setValue({ ...a, VALUE: 0 }, u);
  assert.equal(ext.whenZero({ KIND: "Health" }, u), false);
});

test("statusbars: smooth transition drains over frames; fill width follows value", () => {
  const runtime = makeRuntime();
  const me = makeTarget(runtime, "Me");
  const { ext } = load("statusbars", { runtime });
  const u = util(runtime, me);
  const a = { KIND: "Energy", SPRITE: "_myself_" };
  ext.create({ ...a, WIDTH: 100, HEIGHT: 10 }, u);
  ext.setFlag({ ...a, FLAG: "smooth", ON: "on" }, u);
  ext.setValue({ ...a, VALUE: 0 }, u);
  const svg = () =>
    [...runtime.calls]
      .reverse()
      .find((c) => c[0] === "createSVGSkin" || c[0] === "updateSVGSkin")
      .at(-1);
  assert.match(svg(), /fill="#fff609"|fill="#ff8135"/);
  let frames = 0;
  while (frames < 200 && /fill="#ff8135"/.test(svg())) {
    runtime.emit("AFTER_EXECUTE");
    frames++;
  }
  assert.ok(frames > 1, "the drain takes more than one frame");
  assert.ok(frames < 200, "and ends");
});

test("statusbars: destroyed sprite removes its bar unless told not to", () => {
  const runtime = makeRuntime();
  const a = makeTarget(runtime, "A");
  const b = makeTarget(runtime, "B");
  const { ext } = load("statusbars", { runtime });
  const ua = util(runtime, a);
  const ub = util(runtime, b);
  ext.create({ KIND: "Health", SPRITE: "_myself_", WIDTH: 20, HEIGHT: 4 }, ua);
  ext.create({ KIND: "Health", SPRITE: "_myself_", WIDTH: 20, HEIGHT: 4 }, ub);
  ext.setFlag(
    { KIND: "Health", SPRITE: "_myself_", FLAG: "noAutoDestroy", ON: "on" },
    ub
  );
  assert.equal(ext.countOfKind({ KIND: "Health" }), 2);
  runtime.targets = [];
  runtime.emit("AFTER_EXECUTE");
  assert.equal(ext.countOfKind({ KIND: "Health" }), 1);
  assert.equal(
    runtime.calls.filter((c) => c[0] === "destroyDrawable").length,
    1
  );
  runtime.emit("AFTER_EXECUTE"); // the kept bar stays put without error
  assert.equal(ext.countOfKind({ KIND: "Health" }), 1);
});

test("statusbars: a bar on the screen sits against the stage edge", () => {
  const runtime = makeRuntime();
  const me = makeTarget(runtime, "Me");
  const { ext } = load("statusbars", { runtime });
  const u = util(runtime, me);
  ext.create({ KIND: "Magic", SPRITE: "_screen_", WIDTH: 100, HEIGHT: 10 }, u);
  const pos = () =>
    Array.from(
      [...runtime.calls]
        .reverse()
        .find((c) => c[0] === "updateDrawablePosition")[2]
    );
  assert.deepEqual(pos(), [0, 180 - 5]);
  ext.setPosition({ KIND: "Magic", SPRITE: "_screen_", DIRECTION: "left" }, u);
  assert.deepEqual(pos(), [-240 + 50, 0]);
});

// carnival -----------------------------------------------------------------------

test("carnival: countdown ends in game over and keeps the best score", () => {
  const runtime = makeRuntime();
  const me = makeTarget(runtime, "Me");
  const ls = memoryStorage();
  const { ext } = load("carnival", { runtime, localStorage: ls });
  const u = util(runtime, me);
  ext.setScore({ SCORE: 7 });
  ext.changeScore({ SCORE: 3 });
  assert.equal(ext.getScore(), 10);
  assert.equal(ext.savedBest({ WHICH: "high" }), "");
  ext.startCountdown({ SECONDS: 0, WIN: "score" }, u);
  runtime.emit("AFTER_EXECUTE");
  assert.equal(ext.whenCountdownEnds(), true);
  assert.equal(runtime.stopped, 1);
  assert.equal(ext.savedBest({ WHICH: "high" }), 10);
  const dialog = runtime.calls
    .find((c) => c[0] === "createSVGSkin" && /Great Score!/.test(c.at(-1)))
    .at(-1);
  assert.match(dialog, /Great Score!/);
  assert.match(dialog, /New Best Score!/);
  // a lower score on the next run does not replace it
  runtime.emit("PROJECT_START");
  ext.setScore({ SCORE: 4 });
  ext.gameOver({ WIN: "score" }, u);
  assert.equal(ext.savedBest({ WHICH: "high" }), 10);
  assert.match(
    runtime.calls
      .filter((c) => c[0] === "createSVGSkin")
      .at(-1)
      .at(-1),
    /Best:10/
  );
  assert.ok(
    Array.from(ls.m.keys()).every((k) =>
      k.startsWith("bwext.carnival.v1:default:")
    )
  );
});

test("carnival: low-time and custom judging, lose has no score, storage may be absent", () => {
  const runtime = makeRuntime();
  const me = makeTarget(runtime, "Me");
  const { ext } = load("carnival", { runtime });
  const u = util(runtime, me);
  assert.equal(ext.scoresAreSaved(), false);
  ext.customGameOver({ MESSAGE: "Nice", SCORING: "low", SCORE: "12" }, u);
  assert.equal(ext.savedBest({ WHICH: "low" }), 12);
  runtime.emit("PROJECT_START");
  ext.customGameOver({ MESSAGE: "Nice", SCORING: "low", SCORE: "30" }, u);
  assert.equal(ext.savedBest({ WHICH: "low" }), 12);
  runtime.emit("PROJECT_START");
  ext.gameOver({ WIN: "lose" }, u);
  assert.doesNotMatch(
    runtime.calls
      .filter((c) => c[0] === "createSVGSkin")
      .at(-1)
      .at(-1),
    /Score:/
  );
  ext.forgetBest();
  assert.equal(ext.savedBest({ WHICH: "low" }), "");
});

test("carnival: a tossed ball follows the Arcade trajectory scaled to the stage", () => {
  const runtime = makeRuntime();
  const ball = makeTarget(runtime, "Ball", 0, 0);
  const { ext } = load("carnival", { runtime });
  const u = util(runtime, ball);
  const a = { SPRITE: "_myself_" };
  ext.setBallProperty({ ...a, PROP: "angle", VALUE: 90 }, u);
  ext.setBallProperty({ ...a, PROP: "power", VALUE: 10 }, u);
  ext.setBallProperty({ ...a, PROP: "gravity", VALUE: 20 }, u);
  ext.setBallProperty({ ...a, PROP: "wind", VALUE: 4 }, u);
  assert.equal(ext.getBallProperty({ ...a, PROP: "power" }, u), 10);
  ext.toss(a, u);
  assert.equal(ext.isFlying(a, u), true);
  runtime.emit("AFTER_EXECUTE"); // dt = 0.1 s
  // vy = 10 * 3 = 30 up, ay = -60: y = 0.1 * (30 + (-60 * 0.1)) = 2.4 ; x from wind
  assert.ok(Math.abs(ball.y - 2.4) < 1e-9, String(ball.y));
  assert.ok(Math.abs(ball.x - 0.1 * (12 * 0.1)) < 1e-9, String(ball.x));
  ext.stopBall(a, u);
  assert.equal(ext.isFlying(a, u), false);
  assert.ok(Math.abs(ext.xComponent({ DEGREE: 60, MAGNITUDE: 10 }) - 5) < 1e-9);
  assert.ok(
    Math.abs(ext.yComponent({ DEGREE: 90, MAGNITUDE: 10 }) - 10) < 1e-9
  );
});

test("carnival: trace draws only while the ball rests, arrow keys aim it", () => {
  const runtime = makeRuntime();
  const ball = makeTarget(runtime, "Ball", 0, 0);
  const { ext } = load("carnival", { runtime });
  const u = util(runtime, ball);
  const a = { SPRITE: "_myself_" };
  ext.setTrace({ ...a, TRACE: "full" }, u);
  runtime.emit("AFTER_EXECUTE");
  const created = runtime.calls.filter((c) => c[0] === "createSVGSkin");
  assert.equal(created.length, 1);
  assert.match(created.at(-1).at(-1), /<circle/);
  const keys = new Set(["left arrow"]);
  runtime.ioDevices.keyboard.getKeyIsDown = (k) => keys.has(k);
  ext.controlWithKeys({ ...a, ON: "on" }, u);
  const before = ext.getBallProperty({ ...a, PROP: "angle" }, u);
  runtime.emit("AFTER_EXECUTE");
  assert.ok(ext.getBallProperty({ ...a, PROP: "angle" }, u) > before); // left raises the angle
  ext.toss(a, u);
  runtime.emit("AFTER_EXECUTE");
  assert.ok(
    runtime.calls.some(
      (c) => c[0] === "updateDrawableVisible" && c[2] === false
    )
  );
});

test("carnival: projectile clones are removed once they leave the stage", () => {
  const runtime = makeRuntime();
  const ball = makeTarget(runtime, "Ball", 0, 0);
  makeTarget(runtime, "Dart", 0, 0);
  const { ext } = load("carnival", { runtime });
  const u = util(runtime, ball);
  ext.setBallProperty({ SPRITE: "_myself_", PROP: "angle", VALUE: 0 }, u);
  ext.setBallProperty({ SPRITE: "_myself_", PROP: "power", VALUE: 100 }, u);
  const before = runtime.targets.length;
  ext.fireProjectile({ PROJECTILE: "Dart", SPRITE: "_myself_" }, u);
  assert.equal(runtime.targets.length, before + 1);
  assert.equal(runtime.started.at(-1)[0], "control_start_as_clone");
  for (let i = 0; i < 20 && runtime.targets.length > before; i++) {
    runtime.emit("AFTER_EXECUTE");
  }
  assert.equal(runtime.targets.length, before);
});

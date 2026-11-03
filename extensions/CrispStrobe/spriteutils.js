// Name: Sprite Utils
// ID: spriteutils
// Description: Distance, angle and velocity helpers between sprites, ported from the MakeCode Arcade Sprite Utils extension.
// By: Joey Wunderlich <https://github.com/jwunderl>
// By: CrispStrobe <https://github.com/CrispStrobe>
// Original: Joey Wunderlich (arcade-sprite-util)
// License: MIT

// Derived from jwunderl/arcade-sprite-util at commit
// df4991a9793a0fff092225a67d0a81936b75d7e1 (spriteutils.ts), MIT licensed:
//
//   MIT License
//   Copyright (c) 2020 Joey Wunderlich
//
//   Permission is hereby granted, free of charge, to any person obtaining a
//   copy of this software and associated documentation files (the
//   "Software"), to deal in the Software without restriction, including
//   without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to permit
//   persons to whom the Software is furnished to do so, subject to the
//   following conditions:
//
//   The above copyright notice and this permission notice shall be included
//   in all copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
//   THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//   FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
//   DEALINGS IN THE SOFTWARE.
//
// This is a Scratch-native port, not a MakeCode runtime: the geometry is the
// same, adapted to Scratch's stage (x right, y UP, origin at the centre) and
// to Scratch's frame loop. See docs/CrispStrobe/spriteutils.md for what was
// adapted and what was skipped. The licence texts of all MakeCode ports are
// collected in licenses/makecode-extensions.MIT.txt.

// Block text is English-only, as in the other CrispStrobe extensions of this
// gallery (see microbitplus.js for the reasoning).
/* eslint-disable extension/should-translate */

(function (Scratch) {
  "use strict";

  if (!Scratch.extensions.unsandboxed) {
    throw new Error("Sprite Utils must run unsandboxed");
  }

  const vm = Scratch.vm;
  const runtime = vm.runtime;
  const Cast = Scratch.Cast;

  const MYSELF = "_myself_";
  // Arcade's fallback when a sprite has no acceleration, kept as is.
  const DEFAULT_JUMP_GRAVITY = 200;

  /**
   * Velocity state per target id. Scratch sprites have no velocity, so this
   * extension owns it: units are stage units per second, y up.
   * @type {Map<string, {vx:number, vy:number, ax:number, ay:number}>}
   */
  const motion = new Map();

  const getMotion = (target) => {
    let m = motion.get(target.id);
    if (!m) {
      m = { vx: 0, vy: 0, ax: 0, ay: 0 };
      motion.set(target.id, m);
    }
    return m;
  };

  const resolve = (name, util) => {
    const key = Cast.toString(name);
    if (key === MYSELF) return util.target;
    if (typeof runtime.getSpriteTargetByName === "function") {
      return runtime.getSpriteTargetByName(key) || null;
    }
    return (
      runtime.targets.find((t) => t.isOriginal && t.getName() === key) || null
    );
  };

  const exists = (target) =>
    !!target && !target.isStage && runtime.targets.indexOf(target) !== -1;

  const spriteMenu = () => {
    const items = [{ text: Scratch.translate("myself"), value: MYSELF }];
    for (const t of runtime.targets) {
      if (t.isOriginal && !t.isStage) {
        items.push({ text: t.getName(), value: t.getName() });
      }
    }
    return items;
  };

  const num = (v) => {
    const n = Cast.toNumber(v);
    return Number.isFinite(n) ? n : 0;
  };

  // Frame integration -------------------------------------------------------

  const stepSeconds = () => {
    const ms = runtime.currentStepTime;
    return ms > 0 ? ms / 1000 : 1 / 30;
  };

  const tick = () => {
    if (motion.size === 0) return;
    const dt = stepSeconds();
    for (const [id, m] of Array.from(motion)) {
      const target = runtime.getTargetById(id);
      if (!target || target.isStage || runtime.targets.indexOf(target) === -1) {
        motion.delete(id);
        continue;
      }
      if (m.vx === 0 && m.vy === 0 && m.ax === 0 && m.ay === 0) continue;
      // Same order as Arcade's physics engine: accelerate, then move.
      m.vx += m.ax * dt;
      m.vy += m.ay * dt;
      if (target.dragging) continue;
      target.setXY(target.x + m.vx * dt, target.y + m.vy * dt);
    }
  };

  const clearMotion = () => motion.clear();

  runtime.on("BEFORE_EXECUTE", tick);
  runtime.on("PROJECT_START", clearMotion);
  runtime.on("PROJECT_STOP_ALL", clearMotion);
  runtime.on("RUNTIME_DISPOSED", () => {
    runtime.off("BEFORE_EXECUTE", tick);
    runtime.off("PROJECT_START", clearMotion);
    runtime.off("PROJECT_STOP_ALL", clearMotion);
    clearMotion();
  });

  // As spriteutils.roundWithPrecision: a fixed number of decimals, as text.
  const roundWithPrecision = (x, digits) => {
    const d = Math.max(0, Math.min(20, Math.trunc(digits)));
    const f = Math.pow(10, d);
    return (Math.round(x * f) / f).toFixed(d);
  };

  const CONSTANTS = {
    pi: Math.PI,
    e: Math.E,
    ln2: Math.LN2,
    ln10: Math.LN10,
    sqrt1_2: Math.SQRT1_2,
    sqrt2: Math.SQRT2,
  };

  // Scratch direction (0 = up, clockwise) of the vector (dx, dy), y up.
  const scratchDirection = (dx, dy) =>
    dx === 0 && dy === 0 ? 90 : (Math.atan2(dx, dy) * 180) / Math.PI;

  class SpriteUtils {
    getInfo() {
      return {
        id: "spriteutils",
        name: "Sprite Utils",
        color1: "#4B7BEC",
        color2: "#3867D6",
        color3: "#2D54B0",
        blocks: [
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Geometry"),
          },
          {
            opcode: "isDestroyed",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate("[SPRITE] is deleted"),
            arguments: {
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          {
            opcode: "distanceBetween",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("distance between [A] and [B]"),
            arguments: {
              A: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              B: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          {
            opcode: "angleFrom",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("angle from [A] to [B] in radians"),
            arguments: {
              A: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              B: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          {
            opcode: "directionFrom",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("direction from [A] to [B]"),
            arguments: {
              A: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              B: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          {
            opcode: "placeAngleFrom",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate(
              "place [MOVE] at angle [ANGLE] radians distance [DISTANCE] from [FROM]"
            ),
            arguments: {
              MOVE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              ANGLE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DISTANCE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
              FROM: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          {
            opcode: "countWithin",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate(
              "number of [KIND] sprites within [DISTANCE] of [SPRITE]"
            ),
            arguments: {
              KIND: {
                type: Scratch.ArgumentType.STRING,
                menu: "originalSprites",
              },
              DISTANCE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 },
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          {
            opcode: "nearestDistance",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate(
              "distance to nearest [KIND] sprite from [SPRITE]"
            ),
            arguments: {
              KIND: {
                type: Scratch.ArgumentType.STRING,
                menu: "originalSprites",
              },
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          {
            opcode: "nearestDirection",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate(
              "direction to nearest [KIND] sprite from [SPRITE]"
            ),
            arguments: {
              KIND: {
                type: Scratch.ArgumentType.STRING,
                menu: "originalSprites",
              },
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Velocity (stage units per second)"),
          },
          {
            opcode: "setVelocity",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [SPRITE] velocity to vx [VX] vy [VY]"),
            arguments: {
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              VX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              VY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          {
            opcode: "setVelocityAtAngle",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate(
              "set [SPRITE] velocity at angle [ANGLE] radians speed [SPEED]"
            ),
            arguments: {
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              ANGLE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              SPEED: { type: Scratch.ArgumentType.NUMBER, defaultValue: 60 },
            },
          },
          {
            opcode: "setVelocityToward",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate(
              "set [SPRITE] velocity toward [TARGET] speed [SPEED]"
            ),
            arguments: {
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              SPEED: { type: Scratch.ArgumentType.NUMBER, defaultValue: 60 },
            },
          },
          {
            opcode: "setAcceleration",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate(
              "set [SPRITE] acceleration to ax [AX] ay [AY]"
            ),
            arguments: {
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              AX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              AY: { type: Scratch.ArgumentType.NUMBER, defaultValue: -200 },
            },
          },
          {
            opcode: "jump",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("make [SPRITE] jump [PIXELS] units"),
            arguments: {
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
              PIXELS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
            },
          },
          {
            opcode: "stopMoving",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("stop moving [SPRITE]"),
            arguments: {
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          {
            opcode: "getVelocity",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("[AXIS] velocity of [SPRITE]"),
            arguments: {
              AXIS: { type: Scratch.ArgumentType.STRING, menu: "axes" },
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "sprites" },
            },
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("General"),
          },
          {
            opcode: "radiansToDegrees",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("convert [VALUE] radians to degrees"),
            arguments: {
              VALUE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 3.14159,
              },
            },
          },
          {
            opcode: "degreesToRadians",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("convert [VALUE] degrees to radians"),
            arguments: {
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 180 },
            },
          },
          {
            opcode: "round",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("round [VALUE] to [DIGITS] decimal places"),
            arguments: {
              VALUE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 3.14159,
              },
              DIGITS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
            },
          },
          {
            opcode: "constant",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("[CONSTANT]"),
            arguments: {
              CONSTANT: {
                type: Scratch.ArgumentType.STRING,
                menu: "constants",
                defaultValue: "pi",
              },
            },
          },
        ],
        menus: {
          sprites: { acceptReporters: true, items: "spriteMenu" },
          originalSprites: { acceptReporters: true, items: "originalMenu" },
          axes: {
            acceptReporters: false,
            items: [
              { text: "x", value: "x" },
              { text: "y", value: "y" },
            ],
          },
          constants: {
            acceptReporters: false,
            items: [
              { text: "π", value: "pi" },
              { text: "e", value: "e" },
              { text: "LN2", value: "ln2" },
              { text: "LN10", value: "ln10" },
              { text: "√1/2", value: "sqrt1_2" },
              { text: "√2", value: "sqrt2" },
            ],
          },
        },
      };
    }

    spriteMenu() {
      return spriteMenu();
    }

    originalMenu() {
      return spriteMenu().filter((i) => i.value !== MYSELF);
    }

    isDestroyed(args, util) {
      return !exists(resolve(args.SPRITE, util));
    }

    // Distance between sprite positions (the rotation centre, which Scratch
    // calls x/y). 0 if either sprite does not exist, as in the original.
    distanceBetween(args, util) {
      const a = resolve(args.A, util);
      const b = resolve(args.B, util);
      if (!exists(a) || !exists(b)) return 0;
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    // Math convention on the Scratch stage: radians counter-clockwise from
    // the +x axis, y up. (Arcade's y points down, so its sign is the mirror.)
    angleFrom(args, util) {
      const a = resolve(args.A, util);
      const b = resolve(args.B, util);
      if (!exists(a) || !exists(b)) return 0;
      return Math.atan2(b.y - a.y, b.x - a.x);
    }

    // The same line in Scratch's own convention: degrees, 0 = up, clockwise.
    directionFrom(args, util) {
      const a = resolve(args.A, util);
      const b = resolve(args.B, util);
      if (!exists(a) || !exists(b)) return 0;
      return scratchDirection(b.x - a.x, b.y - a.y);
    }

    placeAngleFrom(args, util) {
      const move = resolve(args.MOVE, util);
      const from = resolve(args.FROM, util);
      if (!exists(move) || !exists(from)) return;
      const angle = num(args.ANGLE);
      const distance = num(args.DISTANCE);
      move.setXY(
        from.x + Math.cos(angle) * distance,
        from.y + Math.sin(angle) * distance
      );
    }

    // All targets (original sprite and its clones) of the named kind.
    _ofKind(kind) {
      const name = Cast.toString(kind);
      return runtime.targets.filter(
        (t) => !t.isStage && t.sprite && t.sprite.name === name
      );
    }

    // Same rule as getSpritesWithin: everything of the kind at or under the
    // distance counts, including the reference sprite itself if it matches.
    countWithin(args, util) {
      const ref = resolve(args.SPRITE, util);
      if (!exists(ref)) return 0;
      const max = num(args.DISTANCE);
      return this._ofKind(args.KIND).filter(
        (t) => Math.hypot(t.x - ref.x, t.y - ref.y) <= max
      ).length;
    }

    _nearest(args, util) {
      const ref = resolve(args.SPRITE, util);
      if (!exists(ref)) return null;
      let best = null;
      let bestDist = Infinity;
      for (const t of this._ofKind(args.KIND)) {
        if (t === ref) continue;
        const d = Math.hypot(t.x - ref.x, t.y - ref.y);
        if (d < bestDist) {
          best = t;
          bestDist = d;
        }
      }
      return best ? { target: best, ref, dist: bestDist } : null;
    }

    nearestDistance(args, util) {
      const n = this._nearest(args, util);
      return n ? n.dist : 0;
    }

    nearestDirection(args, util) {
      const n = this._nearest(args, util);
      return n
        ? scratchDirection(n.target.x - n.ref.x, n.target.y - n.ref.y)
        : 0;
    }

    setVelocity(args, util) {
      const t = resolve(args.SPRITE, util);
      if (!exists(t)) return;
      const m = getMotion(t);
      m.vx = num(args.VX);
      m.vy = num(args.VY);
    }

    setVelocityAtAngle(args, util) {
      const t = resolve(args.SPRITE, util);
      if (!exists(t)) return;
      const angle = num(args.ANGLE);
      const speed = num(args.SPEED);
      const m = getMotion(t);
      m.vx = Math.cos(angle) * speed;
      m.vy = Math.sin(angle) * speed;
    }

    setVelocityToward(args, util) {
      const t = resolve(args.SPRITE, util);
      const to = resolve(args.TARGET, util);
      if (!exists(t) || !exists(to)) return;
      const angle = Math.atan2(to.y - t.y, to.x - t.x);
      const speed = num(args.SPEED);
      const m = getMotion(t);
      m.vx = Math.cos(angle) * speed;
      m.vy = Math.sin(angle) * speed;
    }

    setAcceleration(args, util) {
      const t = resolve(args.SPRITE, util);
      if (!exists(t)) return;
      const m = getMotion(t);
      m.ax = num(args.AX);
      m.ay = num(args.AY);
    }

    // Arcade: vy = dir * sqrt(2 * pixels * g), g = |ay| or 200, against the
    // current gravity. Scratch's y is up, so "up" is +y unless the sprite is
    // being accelerated upwards (ay > 0).
    jump(args, util) {
      const t = resolve(args.SPRITE, util);
      if (!exists(t)) return;
      const m = getMotion(t);
      const g = Math.abs(m.ay) || DEFAULT_JUMP_GRAVITY;
      const dir = m.ay > 0 ? -1 : 1;
      m.vy = dir * Math.sqrt(2 * Math.abs(num(args.PIXELS)) * g);
    }

    stopMoving(args, util) {
      const t = resolve(args.SPRITE, util);
      if (!exists(t)) return;
      motion.delete(t.id);
    }

    getVelocity(args, util) {
      const t = resolve(args.SPRITE, util);
      if (!exists(t)) return 0;
      const m = motion.get(t.id);
      if (!m) return 0;
      return Cast.toString(args.AXIS) === "y" ? m.vy : m.vx;
    }

    radiansToDegrees(args) {
      return (num(args.VALUE) * 180) / Math.PI;
    }

    degreesToRadians(args) {
      return (num(args.VALUE) * Math.PI) / 180;
    }

    round(args) {
      return roundWithPrecision(num(args.VALUE), num(args.DIGITS));
    }

    constant(args) {
      const key = Cast.toString(args.CONSTANT);
      return Object.prototype.hasOwnProperty.call(CONSTANTS, key)
        ? CONSTANTS[key]
        : 0;
    }
  }

  Scratch.extensions.register(new SpriteUtils());
})(Scratch);

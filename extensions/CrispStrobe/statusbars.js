// Name: Status Bars
// ID: statusbars
// Description: Health, energy and other bars that follow sprites, ported from the MakeCode Arcade Status Bars extension.
// By: Joey Wunderlich <https://github.com/jwunderl>
// By: CrispStrobe <https://github.com/CrispStrobe>
// Original: Joey Wunderlich (pxt-status-bar)
// License: MIT

// Derived from jwunderl/pxt-status-bar at commit
// efcd376357ae7215e65616a11283e03bceaa7fa2 (status-bar.ts), MIT licensed:
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
// Scratch-native port: a bar is drawn with the renderer (an SVG skin on its
// own drawable in the sprite layer) and positioned from the sprite's bounds
// every frame. See docs/CrispStrobe/statusbars.md for what was adapted and
// skipped. The licence texts of all MakeCode ports are collected in
// licenses/makecode-extensions.MIT.txt.

// Block text is English-only, as in the other CrispStrobe extensions of this
// gallery (see microbitplus.js for the reasoning).
/* eslint-disable extension/should-translate */

(function (Scratch) {
  "use strict";

  if (!Scratch.extensions.unsandboxed) {
    throw new Error("Status Bars must run unsandboxed");
  }

  const vm = Scratch.vm;
  const runtime = vm.runtime;
  const Cast = Scratch.Cast;

  const MYSELF = "_myself_";
  const SCREEN = "_screen_";
  const STAGE_W = 480;
  const STAGE_H = 360;
  // Arcade draws on a 160x120 screen, the stage is three times that.
  const LABEL_CHAR_W = 6;
  const LABEL_CHAR_H = 8;
  const LABEL_FONT_SIZE = 10;
  // Arcade moves a smooth bar one pixel per 100 ms; scaled to stage units.
  const SMOOTH_STEP_MS = 100 / 3;
  const REFRONT_EVERY = 8;

  // The sixteen Arcade palette colours the original's defaults use.
  const ARCADE = {
    white: "#ffffff",
    red: "#ff2121",
    pink: "#ff93c4",
    orange: "#ff8135",
    yellow: "#fff609",
    green: "#78dc52",
    blue: "#003fad",
    lightBlue: "#87f2ff",
    mauve: "#a4839f",
  };
  const DEFAULT_COLORS = {
    energy: { on: ARCADE.yellow, off: ARCADE.mauve, drain: ARCADE.orange },
    magic: { on: ARCADE.blue, off: ARCADE.mauve, drain: ARCADE.lightBlue },
    health: { on: ARCADE.green, off: ARCADE.red, drain: ARCADE.pink },
  };

  const FLAGS = {
    smooth: "smooth transition",
    labelAtEnd: "label at end",
    constrain: "constrain value",
    invert: "invert fill direction",
    hidePreview: "hide transition preview",
    noAutoDestroy: "no autodestroy on attached destroy",
    ignoreEvents: "ignore events",
  };

  /** @type {Map<string, any>} */
  const bars = new Map();
  let frame = 0;

  const num = (v) => {
    const n = Cast.toNumber(v);
    return Number.isFinite(n) ? n : 0;
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const renderer = () => runtime.renderer || null;

  const exists = (target) =>
    !!target && !target.isStage && runtime.targets.indexOf(target) !== -1;

  const resolveOwner = (name, util) => {
    const key = Cast.toString(name);
    if (key === SCREEN) return { id: "", target: null, screen: true };
    let target;
    if (key === MYSELF) target = util.target;
    else if (typeof runtime.getSpriteTargetByName === "function") {
      target = runtime.getSpriteTargetByName(key);
    } else {
      target = runtime.targets.find((t) => t.isOriginal && t.getName() === key);
    }
    if (!target || target.isStage) return null;
    return { id: target.id, target, screen: false };
  };

  const keyOf = (kind, ownerId) => `${kind}\u0000${ownerId}`;

  const colorOrDefault = (value, fallback) => {
    const s = Cast.toString(value).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return (
        "#" +
        s
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
          .toLowerCase()
      );
    }
    // Scratch's colour input can also hand over a decimal number.
    if (/^\d+$/.test(s)) {
      return "#" + (Number(s) & 0xffffff).toString(16).padStart(6, "0");
    }
    return fallback;
  };

  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const r2 = (n) => Math.round(n * 100) / 100;

  // Geometry ----------------------------------------------------------------

  const isVertical = (bar) => bar.height > bar.width;

  // Size of the whole picture: the bar plus its label, as Arcade's
  // rebuildImage.
  const imageSize = (bar) => {
    let w = bar.width;
    let h = bar.height;
    if (bar.label) {
      const lw = LABEL_CHAR_W * bar.label.length;
      if (isVertical(bar)) {
        w = Math.max(w, lw);
        h += LABEL_CHAR_H + 1;
      } else {
        w += lw;
        h = Math.max(h, LABEL_CHAR_H);
      }
    }
    return { w: Math.max(1, w), h: Math.max(1, h) };
  };

  const svgFor = (bar) => {
    const { w, h } = imageSize(bar);
    const vertical = isVertical(bar);
    const bw = bar.borderWidth;
    const fillW = Math.max(0, bar.width - 2 * bw);
    const fillH = Math.max(0, bar.height - 2 * bw);
    const labelEnd = bar.flags.has("labelAtEnd");
    const borderColor = bar.borderColor || bar.off;
    let barLeft = 0;
    let barTop = 0;
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(w)}" height="${r2(h)}" viewBox="0 0 ${r2(w)} ${r2(h)}">`;

    if (bar.label) {
      const tw = LABEL_CHAR_W * bar.label.length;
      let tx = 0;
      let ty = 0;
      if (vertical) {
        if (labelEnd) ty = bar.height + 1;
        else barTop += LABEL_CHAR_H + 1;
        if (bar.width > tw) tx = (bar.width - tw) / 2;
        else if (bar.width < tw) barLeft = (tw - bar.width) / 2;
      } else {
        if (labelEnd) tx = bar.width + 1;
        else barLeft += tw;
        if (bar.height > LABEL_CHAR_H) ty = (bar.height - LABEL_CHAR_H) / 2;
        else if (bar.height < LABEL_CHAR_H)
          barTop = (LABEL_CHAR_H - bar.height) / 2;
      }
      out +=
        `<text x="${r2(tx)}" y="${r2(ty + LABEL_CHAR_H * 0.85)}" ` +
        `font-family="monospace" font-size="${LABEL_FONT_SIZE}" ` +
        `textLength="${r2(tw)}" lengthAdjust="spacingAndGlyphs" ` +
        `fill="${bar.labelColor}">${esc(bar.label)}</text>`;
    }

    out += `<rect x="${r2(barLeft)}" y="${r2(barTop)}" width="${r2(bar.width)}" height="${r2(bar.height)}" fill="${borderColor}"/>`;
    out += `<rect x="${r2(barLeft + bw)}" y="${r2(barTop + bw)}" width="${r2(fillW)}" height="${r2(fillH)}" fill="${bar.off}"/>`;

    const invert = bar.flags.has("invert");
    const fillRect = (fraction, color) => {
      const fw = vertical ? fillW : Math.round(fillW * fraction);
      const fh = vertical ? Math.round(fillH * fraction) : fillH;
      const fx = barLeft + bw + (vertical || !invert ? 0 : fillW - fw);
      const fy = barTop + bw + (vertical && !invert ? fillH - fh : 0);
      if (fw > 0 && fh > 0) {
        out += `<rect x="${r2(fx)}" y="${r2(fy)}" width="${r2(fw)}" height="${r2(fh)}" fill="${color}"/>`;
      }
    };

    if (bar.display > 0 && bar.max > 0) {
      if (!bar.flags.has("hidePreview")) {
        fillRect(clamp(bar.display / bar.max, 0, 1), bar.drain);
      }
      fillRect(clamp(bar.target / bar.max, 0, 1), bar.on);
    }
    return out + "</svg>";
  };

  // Where the centre of the picture goes, in stage coordinates (y up).
  // Mirrors StatusBar.positionNextTo, with Arcade's y-down offsets mirrored:
  // a positive offset moves a bar right (above/below a sprite) or up (beside
  // it).
  const placement = (bar) => {
    if (bar.fixed) return bar.fixed;
    const { w, h } = imageSize(bar);
    const dir = bar.direction || (isVertical(bar) ? "left" : "top");
    const pad = bar.padding;
    const off = bar.offset;
    const target = bar.owner;
    if (target) {
      let b = null;
      try {
        b = target.getBounds();
      } catch (e) {
        b = null;
      }
      if (!b) {
        b = {
          left: target.x,
          right: target.x,
          top: target.y,
          bottom: target.y,
        };
      }
      if (dir === "left" || dir === "right") {
        const cy = target.y + off;
        const cx =
          dir === "right" ? b.right + pad + w / 2 : b.left - pad - w / 2;
        return { x: cx, y: cy };
      }
      const cx = target.x + off;
      const cy =
        dir === "bottom" ? b.bottom - pad - h / 2 : b.top + pad + h / 2;
      return { x: cx, y: cy };
    }
    // Not attached: against the edge of the stage.
    if (dir === "left" || dir === "right") {
      return {
        x:
          dir === "left"
            ? -STAGE_W / 2 + pad + w / 2
            : STAGE_W / 2 - pad - w / 2,
        y: off,
      };
    }
    return {
      x: off,
      y: dir === "top" ? STAGE_H / 2 - pad - h / 2 : -STAGE_H / 2 + pad + h / 2,
    };
  };

  // Drawing -----------------------------------------------------------------

  const draw = (bar) => {
    const r = renderer();
    if (!r) return;
    try {
      const svg = svgFor(bar);
      if (bar.skinId === null) {
        bar.skinId = r.createSVGSkin(svg);
        bar.drawableId = r.createDrawable("sprite");
        r.updateDrawableSkinId(bar.drawableId, bar.skinId);
        bar.svg = svg;
        r.setDrawableOrder(bar.drawableId, Infinity, "sprite");
      } else if (svg !== bar.svg) {
        r.updateSVGSkin(bar.skinId, svg);
        bar.svg = svg;
      }
      const p = placement(bar);
      if (p.x !== bar.px || p.y !== bar.py) {
        r.updateDrawablePosition(bar.drawableId, [p.x, p.y]);
        bar.px = p.x;
        bar.py = p.y;
      }
      if (!bar.shown) {
        r.updateDrawableVisible(bar.drawableId, true);
        bar.shown = true;
      }
      if (frame % REFRONT_EVERY === 0) {
        r.setDrawableOrder(bar.drawableId, Infinity, "sprite");
      }
    } catch (e) {
      // A renderer that refuses a skin must not take the project down: the
      // bar keeps its state, so values and events still work.
    }
  };

  const destroyBar = (bar) => {
    bar.destroyed = true;
    bars.delete(keyOf(bar.kind, bar.ownerId));
    const r = renderer();
    if (!r) return;
    try {
      if (bar.drawableId !== null) r.destroyDrawable(bar.drawableId, "sprite");
      if (bar.skinId !== null) r.destroySkin(bar.skinId);
    } catch (e) {
      // already gone
    }
    bar.drawableId = null;
    bar.skinId = null;
  };

  const clearAll = () => {
    for (const bar of Array.from(bars.values())) destroyBar(bar);
  };

  const tick = () => {
    frame++;
    if (bars.size === 0) return;
    const dtMs = runtime.currentStepTime > 0 ? runtime.currentStepTime : 33;
    for (const bar of Array.from(bars.values())) {
      if (bar.owner && !exists(bar.owner)) {
        if (bar.flags.has("noAutoDestroy")) {
          // Stays where it was, no longer following anything.
          bar.fixed = { x: bar.px, y: bar.py };
          bar.owner = null;
        } else {
          destroyBar(bar);
          continue;
        }
      }
      if (bar.display !== bar.target && bar.flags.has("smooth")) {
        bar.acc += dtMs;
        const steps = Math.floor(bar.acc / SMOOTH_STEP_MS);
        if (steps > 0) {
          bar.acc -= steps * SMOOTH_STEP_MS;
          const length = Math.max(bar.width, bar.height) - bar.borderWidth * 2;
          const change = (bar.max / Math.max(1, length)) * steps;
          bar.display =
            bar.target > bar.display
              ? Math.min(bar.display + change, bar.target)
              : Math.max(bar.display - change, bar.target);
        }
      } else if (!bar.flags.has("smooth")) {
        bar.display = bar.target;
      }
      draw(bar);
    }
  };

  runtime.on("AFTER_EXECUTE", tick);
  runtime.on("PROJECT_START", clearAll);
  runtime.on("RUNTIME_DISPOSED", () => {
    runtime.off("AFTER_EXECUTE", tick);
    runtime.off("PROJECT_START", clearAll);
    clearAll();
  });

  // State -------------------------------------------------------------------

  const createBar = (kind, owner, width, height) => {
    const defaults =
      DEFAULT_COLORS[kind.toLowerCase()] || DEFAULT_COLORS.health;
    const bar = {
      kind,
      ownerId: owner.id,
      owner: owner.target,
      width: Math.max(1, width),
      height: Math.max(1, height),
      on: defaults.on,
      off: defaults.off,
      drain: defaults.drain,
      max: 100,
      target: 100,
      display: 100,
      acc: 0,
      borderWidth: 0,
      borderColor: null,
      label: "",
      labelColor: ARCADE.white,
      flags: new Set(["constrain"]),
      padding: 0,
      offset: 0,
      direction: owner.target ? null : "top",
      fixed: null,
      skinId: null,
      drawableId: null,
      svg: null,
      shown: false,
      px: NaN,
      py: NaN,
      destroyed: false,
    };
    const old = bars.get(keyOf(kind, owner.id));
    if (old) destroyBar(old);
    bars.set(keyOf(kind, owner.id), bar);
    draw(bar);
    return bar;
  };

  const getBar = (args, util) => {
    const owner = resolveOwner(args.SPRITE, util);
    if (!owner) return null;
    return bars.get(keyOf(Cast.toString(args.KIND), owner.id)) || null;
  };

  const setValues = (bar, value, max) => {
    bar.target = value;
    bar.max = max;
    if (bar.flags.has("constrain")) {
      bar.target = clamp(bar.target, 0, bar.max);
      bar.display = clamp(bar.display, 0, bar.max);
    }
    if (!bar.flags.has("smooth")) bar.display = bar.target;
    draw(bar);
  };

  const spriteMenu = (withScreen) => {
    const items = [{ text: Scratch.translate("myself"), value: MYSELF }];
    if (withScreen) items.push({ text: Scratch.translate("the screen"), value: SCREEN });
    for (const t of runtime.targets) {
      if (t.isOriginal && !t.isStage) {
        items.push({ text: t.getName(), value: t.getName() });
      }
    }
    return items;
  };

  const kindArg = { type: Scratch.ArgumentType.STRING, defaultValue: "Health" };
  const spriteArg = { type: Scratch.ArgumentType.STRING, menu: "sprites" };

  class StatusBars {
    getInfo() {
      return {
        id: "statusbars",
        name: "Status Bars",
        color1: "#38364d",
        color2: "#2d2b3f",
        color3: "#232233",
        blocks: [
          {
            opcode: "create",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("create [KIND] bar on [SPRITE] width [WIDTH] height [HEIGHT]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { type: Scratch.ArgumentType.STRING, menu: "owners" },
              WIDTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 60 },
              HEIGHT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 12 },
            },
          },
          {
            opcode: "remove",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("delete [KIND] bar of [SPRITE]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
            },
          },
          {
            opcode: "removeAll",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("delete all status bars"),
          },
          {
            opcode: "exists",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate("[KIND] bar of [SPRITE] exists"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
            },
          },
          {
            opcode: "countOfKind",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("number of [KIND] bars"),
            arguments: { KIND: kindArg },
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Value"),
          },
          {
            opcode: "setValue",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [KIND] bar of [SPRITE] value to [VALUE]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
            },
          },
          {
            opcode: "changeValue",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("change [KIND] bar of [SPRITE] value by [VALUE]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: -10 },
            },
          },
          {
            opcode: "setMax",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [KIND] bar of [SPRITE] max to [MAX]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              MAX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
            },
          },
          {
            opcode: "getValue",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("[KIND] bar value of [SPRITE]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
            },
          },
          {
            opcode: "getMax",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("[KIND] bar max of [SPRITE]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
            },
          },
          {
            opcode: "freeze",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("stop [KIND] bar of [SPRITE] transition"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
            },
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Display"),
          },
          {
            opcode: "setColor",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [KIND] bar of [SPRITE] fill [FILL] background [BACKGROUND] drain [DRAIN]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              FILL: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: ARCADE.green,
              },
              BACKGROUND: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: ARCADE.red,
              },
              DRAIN: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: ARCADE.pink,
              },
            },
          },
          {
            opcode: "setBorder",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [KIND] bar of [SPRITE] border width [WIDTH] color [COLOR]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              WIDTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: "#000000",
              },
            },
          },
          {
            opcode: "setLabel",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [KIND] bar of [SPRITE] label [LABEL] color [COLOR]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              LABEL: { type: Scratch.ArgumentType.STRING, defaultValue: "HP" },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: "#ffffff",
              },
            },
          },
          {
            opcode: "setFlag",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [KIND] bar of [SPRITE] [FLAG] to [ON]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              FLAG: {
                type: Scratch.ArgumentType.STRING,
                menu: "flags",
                defaultValue: "smooth",
              },
              ON: {
                type: Scratch.ArgumentType.STRING,
                menu: "onOff",
                defaultValue: "on",
              },
            },
          },
          {
            opcode: "setSize",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [KIND] bar of [SPRITE] width [WIDTH] height [HEIGHT]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              WIDTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 60 },
              HEIGHT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 12 },
            },
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Attach"),
          },
          {
            opcode: "attach",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("attach [KIND] bar of [SPRITE] to [TO] padding [PADDING] offset [OFFSET]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              TO: spriteArg,
              PADDING: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              OFFSET: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          {
            opcode: "setPosition",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [KIND] bar of [SPRITE] position to [DIRECTION]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              DIRECTION: {
                type: Scratch.ArgumentType.STRING,
                menu: "directions",
                defaultValue: "top",
              },
            },
          },
          {
            opcode: "setPaddingOffset",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [KIND] bar of [SPRITE] padding [PADDING] offset [OFFSET]"),
            arguments: {
              KIND: kindArg,
              SPRITE: { ...spriteArg, menu: "owners" },
              PADDING: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              OFFSET: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Events"),
          },
          {
            opcode: "whenZero",
            blockType: Scratch.BlockType.HAT,
            text: Scratch.translate("when my [KIND] bar reaches zero"),
            isEdgeActivated: true,
            arguments: { KIND: kindArg },
          },
          {
            opcode: "whenReached",
            blockType: Scratch.BlockType.HAT,
            text: Scratch.translate("when my [KIND] bar is [COMPARISON] [VALUE] [UNIT]"),
            isEdgeActivated: true,
            arguments: {
              KIND: kindArg,
              COMPARISON: {
                type: Scratch.ArgumentType.STRING,
                menu: "comparisons",
                defaultValue: "<=",
              },
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 25 },
              UNIT: {
                type: Scratch.ArgumentType.STRING,
                menu: "units",
                defaultValue: "percent",
              },
            },
          },
        ],
        menus: {
          sprites: { acceptReporters: true, items: "spriteMenu" },
          owners: { acceptReporters: true, items: "ownerMenu" },
          flags: {
            acceptReporters: false,
            items: Object.keys(FLAGS).map((k) => ({
              text: FLAGS[k],
              value: k,
            })),
          },
          onOff: {
            acceptReporters: false,
            items: [
              { text: "on", value: "on" },
              { text: Scratch.translate("off"), value: "off" },
            ],
          },
          directions: {
            acceptReporters: false,
            items: [
              { text: Scratch.translate("top"), value: "top" },
              { text: Scratch.translate("bottom"), value: "bottom" },
              { text: Scratch.translate("left"), value: "left" },
              { text: Scratch.translate("right"), value: "right" },
            ],
          },
          comparisons: {
            acceptReporters: false,
            items: ["=", "≠", "<", "<=", ">", ">="].map((c) => ({
              text: c === "<=" ? "≤" : c === ">=" ? "≥" : c,
              value: c,
            })),
          },
          units: {
            acceptReporters: false,
            items: [
              { text: "%", value: "percent" },
              { text: Scratch.translate("fixed"), value: "fixed" },
            ],
          },
        },
      };
    }

    spriteMenu() {
      return spriteMenu(false);
    }

    ownerMenu() {
      return spriteMenu(true);
    }

    create(args, util) {
      const owner = resolveOwner(args.SPRITE, util);
      if (!owner) return;
      createBar(
        Cast.toString(args.KIND),
        owner,
        num(args.WIDTH),
        num(args.HEIGHT)
      );
    }

    remove(args, util) {
      const bar = getBar(args, util);
      if (bar) destroyBar(bar);
    }

    removeAll() {
      clearAll();
    }

    exists(args, util) {
      return !!getBar(args, util);
    }

    countOfKind(args) {
      const kind = Cast.toString(args.KIND);
      let n = 0;
      for (const bar of bars.values()) if (bar.kind === kind) n++;
      return n;
    }

    setValue(args, util) {
      const bar = getBar(args, util);
      if (bar) setValues(bar, num(args.VALUE), bar.max);
    }

    changeValue(args, util) {
      const bar = getBar(args, util);
      if (bar) setValues(bar, bar.target + num(args.VALUE), bar.max);
    }

    setMax(args, util) {
      const bar = getBar(args, util);
      if (bar) setValues(bar, bar.target, Math.max(0, num(args.MAX)));
    }

    getValue(args, util) {
      const bar = getBar(args, util);
      return bar ? bar.target : 0;
    }

    getMax(args, util) {
      const bar = getBar(args, util);
      return bar ? bar.max : 0;
    }

    freeze(args, util) {
      const bar = getBar(args, util);
      if (!bar) return;
      bar.target = bar.display;
      draw(bar);
    }

    setColor(args, util) {
      const bar = getBar(args, util);
      if (!bar) return;
      bar.on = colorOrDefault(args.FILL, bar.on);
      bar.off = colorOrDefault(args.BACKGROUND, bar.off);
      bar.drain = colorOrDefault(args.DRAIN, bar.drain);
      draw(bar);
    }

    setBorder(args, util) {
      const bar = getBar(args, util);
      if (!bar) return;
      bar.borderWidth = clamp(
        num(args.WIDTH),
        0,
        Math.floor(Math.min(bar.width, bar.height) / 2)
      );
      bar.borderColor = colorOrDefault(args.COLOR, bar.off);
      draw(bar);
    }

    setLabel(args, util) {
      const bar = getBar(args, util);
      if (!bar) return;
      bar.label = Cast.toString(args.LABEL);
      bar.labelColor = colorOrDefault(args.COLOR, bar.labelColor);
      draw(bar);
    }

    setFlag(args, util) {
      const bar = getBar(args, util);
      const flag = Cast.toString(args.FLAG);
      if (!bar || !Object.prototype.hasOwnProperty.call(FLAGS, flag)) return;
      if (Cast.toString(args.ON) === "on") bar.flags.add(flag);
      else bar.flags.delete(flag);
      if (flag === "constrain" && bar.flags.has(flag)) {
        setValues(bar, bar.target, bar.max);
        return;
      }
      if (!bar.flags.has("smooth")) bar.display = bar.target;
      draw(bar);
    }

    setSize(args, util) {
      const bar = getBar(args, util);
      if (!bar) return;
      bar.width = Math.max(1, num(args.WIDTH));
      bar.height = Math.max(1, num(args.HEIGHT));
      draw(bar);
    }

    // Follow another sprite. Moving a bar between owners re-keys it, so the
    // bar is found under its new owner afterwards ("[KIND] bar of [TO]").
    attach(args, util) {
      const bar = getBar(args, util);
      const to = resolveOwner(args.TO, util);
      if (!bar || !to || !to.target) return;
      bars.delete(keyOf(bar.kind, bar.ownerId));
      const clash = bars.get(keyOf(bar.kind, to.id));
      if (clash && clash !== bar) destroyBar(clash);
      bar.owner = to.target;
      bar.ownerId = to.id;
      bar.padding = num(args.PADDING);
      bar.offset = num(args.OFFSET);
      bars.set(keyOf(bar.kind, bar.ownerId), bar);
      draw(bar);
    }

    setPosition(args, util) {
      const bar = getBar(args, util);
      const dir = Cast.toString(args.DIRECTION);
      if (!bar || !["top", "bottom", "left", "right"].includes(dir)) return;
      bar.direction = dir;
      draw(bar);
    }

    setPaddingOffset(args, util) {
      const bar = getBar(args, util);
      if (!bar) return;
      bar.padding = num(args.PADDING);
      bar.offset = num(args.OFFSET);
      draw(bar);
    }

    _ownBar(kind, util) {
      const bar = bars.get(keyOf(Cast.toString(kind), util.target.id));
      return bar && !bar.flags.has("ignoreEvents") ? bar : null;
    }

    whenZero(args, util) {
      const bar = this._ownBar(args.KIND, util);
      return !!bar && bar.target <= 0;
    }

    whenReached(args, util) {
      const bar = this._ownBar(args.KIND, util);
      if (!bar) return false;
      const value = num(args.VALUE);
      const current =
        Cast.toString(args.UNIT) === "percent"
          ? bar.max > 0
            ? (bar.target / bar.max) * 100
            : 0
          : bar.target;
      switch (Cast.toString(args.COMPARISON)) {
        case "=":
          return current === value;
        case "≠":
          return current !== value;
        case "<":
          return current < value;
        case "<=":
          return current <= value;
        case ">":
          return current > value;
        case ">=":
          return current >= value;
        default:
          return false;
      }
    }
  }

  Scratch.extensions.register(new StatusBars());
})(Scratch);

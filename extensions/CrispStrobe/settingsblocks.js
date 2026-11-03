// Name: Saved Settings
// ID: settingsblocks
// Description: Save and read named numbers, text and number lists that persist between runs, ported from the MakeCode settings blocks.
// By: Microsoft Corporation
// By: CrispStrobe <https://github.com/CrispStrobe>
// Original: Microsoft (pxt-settings-blocks)
// License: MIT

// Derived from microsoft/pxt-settings-blocks at commit
// 068d05d80a063b04d373bf9b411af45201d7ce7a (main.ts), MIT licensed:
//
//     MIT License
//
//     Copyright (c) Microsoft Corporation. All rights reserved.
//
//     Permission is hereby granted, free of charge, to any person obtaining a
//     copy of this software and associated documentation files (the
//     "Software"), to deal in the Software without restriction, including
//     without limitation the rights to use, copy, modify, merge, publish,
//     distribute, sublicense, and/or sell copies of the Software, and to
//     permit persons to whom the Software is furnished to do so, subject to
//     the following conditions:
//
//     The above copyright notice and this permission notice shall be included
//     in all copies or substantial portions of the Software.
//
//     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
//     OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
//     MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
//     IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
//     CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
//     TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
//     SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE
//
// The original wraps MakeCode's flash-backed `settings` namespace. Here the
// same ten blocks sit on the browser's localStorage. See
// docs/CrispStrobe/settingsblocks.md for the storage scope and what differs.
// The licence texts of all MakeCode ports are collected in
// licenses/makecode-extensions.MIT.txt.

// Block text is English-only, as in the other CrispStrobe extensions of this
// gallery (see microbitplus.js for the reasoning).
/* eslint-disable extension/should-translate */

(function (Scratch) {
  "use strict";

  if (!Scratch.extensions.unsandboxed) {
    throw new Error("Saved Settings must run unsandboxed");
  }

  const Cast = Scratch.Cast;
  const KEY_PREFIX = "bwext.settings.v1:";
  const DEFAULT_NAMESPACE = "default";

  let namespace = DEFAULT_NAMESPACE;
  // Used whenever localStorage is missing or refuses; lives for the session.
  const memory = new Map();
  let persistent = null;

  /**
   * The browser's localStorage, or null when it is not usable: blocked by the
   * browser, a sandboxed frame without allow-same-origin, private modes that
   * throw on access, or a quota of zero. Probed once with a real write.
   */
  const storage = () => {
    if (persistent !== null) return persistent || null;
    try {
      const ls = globalThis.localStorage;
      const probe = KEY_PREFIX + "probe";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      persistent = ls;
    } catch (e) {
      persistent = false;
    }
    return persistent || null;
  };

  const prefix = () => KEY_PREFIX + namespace + ":";

  const readRaw = (name) => {
    const full = prefix() + name;
    const ls = storage();
    if (ls) {
      try {
        const v = ls.getItem(full);
        if (v !== null) return v;
      } catch (e) {
        // fall through to memory
      }
    }
    return memory.has(full) ? memory.get(full) : null;
  };

  const writeRaw = (name, value) => {
    const full = prefix() + name;
    const ls = storage();
    if (ls) {
      try {
        ls.setItem(full, value);
        memory.delete(full);
        return;
      } catch (e) {
        // Quota exceeded or revoked since the probe: keep the value for this
        // session instead of losing it silently.
      }
    }
    memory.set(full, value);
  };

  const removeRaw = (name) => {
    const full = prefix() + name;
    const ls = storage();
    if (ls) {
      try {
        ls.removeItem(full);
      } catch (e) {
        // ignore
      }
    }
    memory.delete(full);
  };

  const allNames = () => {
    const p = prefix();
    const names = new Set();
    const ls = storage();
    if (ls) {
      try {
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k && k.startsWith(p)) names.add(k.slice(p.length));
        }
      } catch (e) {
        // ignore
      }
    }
    for (const k of memory.keys()) {
      if (k.startsWith(p)) names.add(k.slice(p.length));
    }
    return Array.from(names).sort();
  };

  // Entries are {t: "number"|"string"|"numbers", v: ...}; the type tag is how
  // `read as number` can tell a number from a string, as the original's
  // fixed-size buffers could.
  const write = (name, type, value) => {
    const n = Cast.toString(name);
    if (n === "") return;
    writeRaw(n, JSON.stringify({ t: type, v: value }));
  };

  const read = (name, type) => {
    const raw = readRaw(Cast.toString(name));
    if (raw === null) return undefined;
    try {
      const entry = JSON.parse(raw);
      if (entry && entry.t === type) return entry.v;
    } catch (e) {
      // not ours or corrupted: treat as absent
    }
    return undefined;
  };

  // A number array arrives as JSON ("[1,2,3]") or as comma/space separated
  // numbers ("1, 2, 3"). Anything non-numeric in it is stored as 0, since the
  // original only holds numbers.
  const parseNumberList = (value) => {
    let list;
    if (Array.isArray(value)) {
      list = value;
    } else {
      const text = Cast.toString(value).trim();
      if (text === "") return [];
      try {
        const parsed = JSON.parse(text);
        list = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        list = text.split(/[\s,;]+/).filter((s) => s !== "");
      }
    }
    return list.map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    });
  };

  class SavedSettings {
    getInfo() {
      return {
        id: "settingsblocks",
        name: "Saved Settings",
        color1: "#3b3b3b",
        color2: "#2e2e2e",
        color3: "#232323",
        blocks: [
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Numbers"),
          },
          {
            opcode: "writeNumber",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set setting [NAME] to number [VALUE]"),
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: "score",
              },
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          {
            opcode: "readNumber",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("read setting [NAME] as number"),
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: "score",
              },
            },
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Strings"),
          },
          {
            opcode: "writeString",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set setting [NAME] to string [VALUE]"),
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "name" },
              VALUE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: "hello",
              },
            },
          },
          {
            opcode: "readString",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("read setting [NAME] as string"),
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "name" },
            },
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Arrays"),
          },
          {
            opcode: "writeNumberArray",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate(
              "set setting [NAME] to number array [VALUE]"
            ),
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: "scores",
              },
              VALUE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: "[1, 2, 3]",
              },
            },
          },
          {
            opcode: "readNumberArray",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("read setting [NAME] as number array"),
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: "scores",
              },
            },
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Operations"),
          },
          {
            opcode: "remove",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("remove setting with name [NAME]"),
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: "score",
              },
            },
          },
          {
            opcode: "exists",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate("setting with name [NAME] exists"),
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: "score",
              },
            },
          },
          {
            opcode: "list",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("array of all settings names"),
          },
          {
            opcode: "clear",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("clear all settings"),
          },
          "---",
          {
            blockType: Scratch.BlockType.LABEL,
            text: Scratch.translate("Storage"),
          },
          {
            opcode: "setNamespace",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("use settings namespace [NAMESPACE]"),
            arguments: {
              NAMESPACE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: DEFAULT_NAMESPACE,
              },
            },
          },
          {
            opcode: "getNamespace",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("settings namespace"),
          },
          {
            opcode: "isPersistent",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate("settings are saved on this device?"),
          },
        ],
      };
    }

    writeNumber(args) {
      write(args.NAME, "number", Cast.toNumber(args.VALUE));
    }

    // Missing or of another type: empty, as the original returns undefined.
    readNumber(args) {
      const v = read(args.NAME, "number");
      return v === undefined ? "" : v;
    }

    writeString(args) {
      write(args.NAME, "string", Cast.toString(args.VALUE));
    }

    readString(args) {
      const v = read(args.NAME, "string");
      return v === undefined ? "" : v;
    }

    writeNumberArray(args) {
      write(args.NAME, "numbers", parseNumberList(args.VALUE));
    }

    // Returned as JSON text, e.g. [1,2,3]; "" when missing.
    readNumberArray(args) {
      const v = read(args.NAME, "numbers");
      return v === undefined ? "" : JSON.stringify(v);
    }

    remove(args) {
      removeRaw(Cast.toString(args.NAME));
    }

    exists(args) {
      return readRaw(Cast.toString(args.NAME)) !== null;
    }

    list() {
      return JSON.stringify(allNames());
    }

    // Only this namespace; other namespaces and other keys of the site are
    // untouched (the original likewise keeps system settings).
    clear() {
      for (const name of allNames()) removeRaw(name);
    }

    setNamespace(args) {
      const ns = Cast.toString(args.NAMESPACE).trim();
      namespace = ns === "" ? DEFAULT_NAMESPACE : ns;
    }

    getNamespace() {
      return namespace;
    }

    isPersistent() {
      return storage() !== null;
    }
  }

  Scratch.extensions.register(new SavedSettings());
})(Scratch);

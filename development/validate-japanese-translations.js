import assert from "node:assert/strict";
import fs from "node:fs";
import Builder from "./builder.js";
import * as espree from "espree";

const filename = new URL("../extensions/CrispStrobe/legospike_turbowarp_transpile.js", import.meta.url);
const source = fs.readFileSync(filename, "utf8");
const ast = espree.parse(source, {
  ecmaVersion: "latest",
  sourceType: "script",
});

let translations;
let menuLabels;
const visit = (node) => {
  if (!node || typeof node !== "object") return;
  if (
    node.type === "VariableDeclarator" &&
    node.id?.type === "Identifier" &&
    node.id.name === "translations"
  ) {
    translations = node.init;
  }
  if (
    node.type === "VariableDeclarator" &&
    node.id?.type === "Identifier" &&
    node.id.name === "menuLabels"
  ) {
    menuLabels = node.init;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") visit(value);
  }
};
visit(ast);
assert.ok(translations, "SPIKE translation catalog was not found");
assert.ok(menuLabels, "SPIKE menu translation catalog was not found");

const getLocale = (catalog, locale) => {
  const property = catalog.properties.find(
    (item) => item.key?.name === locale || item.key?.value === locale
  );
  assert.ok(property, `Missing ${locale} translation catalog`);
  return Object.fromEntries(
    property.value.properties.map((item) => [
      item.key.name || item.key.value,
      item.value.value,
    ])
  );
};

const english = getLocale(translations, "en");
const japanese = getLocale(translations, "ja");
const missing = Object.keys(english).filter(
  (key) => !Object.hasOwn(japanese, key)
);
assert.deepEqual(missing, [], `Japanese SPIKE translations are missing: ${missing.join(", ")}`);

const placeholders = (message) =>
  [...message.matchAll(/\[[^\]]+\]|\{[A-Za-z0-9_.-]+\}/g)]
    .map(([placeholder]) => placeholder)
    .sort();
const mismatched = Object.keys(english).filter(
  (key) =>
    placeholders(english[key]).join("\0") !==
    placeholders(japanese[key]).join("\0")
);
assert.deepEqual(
  mismatched,
  [],
  `SPIKE translation placeholders do not match: ${mismatched.join(", ")}`
);

const englishMenus = getLocale(menuLabels, "en");
const japaneseMenus = getLocale(menuLabels, "ja");
assert.deepEqual(
  Object.keys(japaneseMenus).sort(),
  Object.keys(englishMenus).sort(),
  "Japanese SPIKE menu labels must have the same keys as English"
);
const mismatchedMenuPlaceholders = Object.keys(englishMenus).filter(
  (key) =>
    placeholders(englishMenus[key]).join("\0") !==
    placeholders(japaneseMenus[key]).join("\0")
);
assert.deepEqual(
  mismatchedMenuPlaceholders,
  [],
  `SPIKE menu placeholders do not match: ${mismatchedMenuPlaceholders.join(", ")}`
);

const usedTextKeys = new Set();
const collectTextKeys = (node) => {
  if (!node || typeof node !== "object") return;
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "t" &&
    node.arguments[0]?.type === "Literal"
  ) {
    usedTextKeys.add(node.arguments[0].value);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(collectTextKeys);
    else if (value && typeof value === "object") collectTextKeys(value);
  }
};
collectTextKeys(ast);
const missingTextKeys = [...usedTextKeys].filter(
  (key) => !Object.hasOwn(english, key) || !Object.hasOwn(japanese, key)
);
assert.deepEqual(
  missingTextKeys,
  [],
  `SPIKE t() strings must be translated in both languages: ${missingTextKeys.join(", ")}`
);

const readJapaneseCatalog = (filename) =>
  JSON.parse(fs.readFileSync(new URL(filename, import.meta.url), "utf8")).ja ||
  {};
const runtimeJapanese = readJapaneseCatalog(
  "../translations/extension-runtime.json"
);
const metadataJapanese = readJapaneseCatalog(
  "../translations/extension-metadata.json"
);
const gallery = await new Builder("development").build();
const hardcodedTextBaseline = JSON.parse(
  fs.readFileSync(
    new URL("./japanese-runtime-gap-baseline.json", import.meta.url),
    "utf8"
  )
);
const hardcodedTextCounts = {};
const scannedSourcePaths = new Set();
const collectStaticTextProperties = (node, result) => {
  if (!node || typeof node !== "object") return;
  if (
    node.type === "Property" &&
    !node.computed &&
    node.key?.name === "text" &&
    node.value?.type === "Literal" &&
    typeof node.value.value === "string"
  ) {
    result[node.value.value] = (result[node.value.value] || 0) + 1;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((child) => collectStaticTextProperties(child, result));
    } else if (value && typeof value === "object") {
      collectStaticTextProperties(value, result);
    }
  }
};
for (const file of Object.values(gallery.files)) {
  if (
    !file.featured ||
    !file.sourcePath?.endsWith(".js") ||
    scannedSourcePaths.has(file.sourcePath)
  ) {
    continue;
  }
  scannedSourcePaths.add(file.sourcePath);
  const source = fs.readFileSync(file.sourcePath, "utf8");
  const ast = espree.parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
  });
  const textCounts = {};
  collectStaticTextProperties(ast, textCounts);
  if (Object.keys(textCounts).length > 0) {
    hardcodedTextCounts[file.slug] = textCounts;
  }
}
const unreviewedDirectText = [];
for (const [slug, texts] of Object.entries(hardcodedTextCounts)) {
  const baselineTexts = hardcodedTextBaseline.files?.[slug];
  for (const [text, count] of Object.entries(texts)) {
    if (!baselineTexts || (baselineTexts[text] || 0) < count) {
      unreviewedDirectText.push(
        slug + ": " + JSON.stringify(text) + " (" + count + ")"
      );
    }
  }
}
assert.deepEqual(
  unreviewedDirectText,
  [],
  "New literal text fields bypass Scratch.translate(). Translate them and add the Japanese catalog before updating the reviewed baseline:\n" +
    unreviewedDirectText.join("\n")
);
const missingMetadata = [];
const missingRuntime = [];
const mismatchedGalleryPlaceholders = [];
let metadataTotal = 0;
let runtimeTotal = 0;
let runtimeTranslated = 0;

for (const [path, file] of Object.entries(gallery.files)) {
  if (!path.endsWith(".js") || typeof file.getStrings !== "function") {
    continue;
  }
  const strings = file.getStrings();
  if (!strings) continue;

  for (const key of Object.keys(strings["extension-metadata"])) {
    metadataTotal++;
    if (!Object.hasOwn(metadataJapanese, key)) missingMetadata.push(key);
  }
  for (const [key, value] of Object.entries(strings["extension-runtime"])) {
    runtimeTotal++;
    if (!Object.hasOwn(runtimeJapanese, key)) {
      missingRuntime.push(key);
    } else {
      runtimeTranslated++;
      if (
        placeholders(value.string).join("\0") !==
        placeholders(runtimeJapanese[key]).join("\0")
      ) {
        mismatchedGalleryPlaceholders.push(key);
      }
    }
  }
}

assert.deepEqual(
  missingMetadata,
  [],
  `Gallery Japanese metadata is missing: ${missingMetadata.join(", ")}`
);
assert.deepEqual(
  missingRuntime,
  [],
  `Gallery Japanese runtime strings are missing: ${missingRuntime.join(", ")}`
);
assert.deepEqual(
  mismatchedGalleryPlaceholders,
  [],
  `Gallery translation placeholders do not match: ${mismatchedGalleryPlaceholders.join(", ")}`
);

console.log(
  `Japanese translation coverage passed: SPIKE ${Object.keys(english).length}/${Object.keys(english).length}; SPIKE menus ${Object.keys(englishMenus).length}/${Object.keys(englishMenus).length}; gallery metadata ${metadataTotal}/${metadataTotal}; gallery block and UI strings ${runtimeTranslated}/${runtimeTotal}; placeholders match.`
);

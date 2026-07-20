/* CSS / design audit — checks the stylesheet against the markup. */
import fs from "fs";

const src = fs.readFileSync("../HunzaRoleApp.jsx", "utf8");

// --- pull out the CSS template literal -------------------------------------
const cssStart = src.indexOf("const CSS = `");
const css = src.slice(cssStart + 13, src.indexOf("\n`;", cssStart));

const issues = [];
const warn = (level, msg) => issues.push({ level, msg });
const ok = [];

// --- 1. classes used in JSX vs defined in CSS -------------------------------
const usedClasses = new Set();
for (const m of src.matchAll(/className=(?:"([^"]*)"|\{[^}]*?"([^"]*)"[^}]*?\})/g)) {
  (m[1] || m[2] || "").split(/\s+/).forEach((c) => { if (c.startsWith("hz-")) usedClasses.add(c); });
}
for (const m of src.matchAll(/"(hz-[a-z0-9-]+)"/g)) usedClasses.add(m[1]);
// ids (datalist/list=) are not classes — don't expect CSS rules for them
for (const m of src.matchAll(/(?:id|list)="(hz-[a-z0-9-]+)"/g)) usedClasses.delete(m[1]);

const definedClasses = new Set();
for (const m of css.matchAll(/\.(hz-[a-z0-9-]+)/g)) definedClasses.add(m[1]);

const undefinedUsed = [...usedClasses].filter((c) => !definedClasses.has(c));
const unusedDefined = [...definedClasses].filter((c) => !usedClasses.has(c));

if (undefinedUsed.length) warn("HIGH", `Classes used in markup but never styled: ${undefinedUsed.join(", ")}`);
else ok.push("Every class used in the markup has styles");

if (unusedDefined.length > 12) warn("LOW", `${unusedDefined.length} styled classes are no longer used (dead CSS): ${unusedDefined.slice(0, 10).join(", ")}…`);
else if (unusedDefined.length) warn("INFO", `Unused CSS classes: ${unusedDefined.join(", ")}`);
else ok.push("No dead CSS classes");

// --- 2. CSS variables: used vs defined --------------------------------------
const definedVars = new Set();
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) definedVars.add(m[1]);
const usedVars = new Set();
for (const m of src.matchAll(/var\((--[a-z0-9-]+)/g)) usedVars.add(m[1]);
const missingVars = [...usedVars].filter((v) => !definedVars.has(v));
if (missingVars.length) warn("HIGH", `CSS variables used but never defined: ${missingVars.join(", ")}`);
else ok.push(`All ${usedVars.size} CSS variables are defined`);

// --- 3. theme completeness (dark + light) -----------------------------------
const darkBlock = (css.match(/\.hz\[data-theme=["']?dark["']?\]\s*\{([\s\S]*?)\}/) || [])[1] || "";
const lightBlock = (css.match(/\.hz\[data-theme=["']?light["']?\]\s*\{([\s\S]*?)\}/) || [])[1] || "";
const rootBlock = (css.match(/\.hz\s*\{([\s\S]*?)\}/) || [])[1] || "";
const varsIn = (block) => new Set([...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const dv = varsIn(darkBlock), lv = varsIn(lightBlock), rv = varsIn(rootBlock);
if (dv.size && lv.size) {
  const onlyDark = [...dv].filter((v) => !lv.has(v));
  const onlyLight = [...lv].filter((v) => !dv.has(v));
  if (onlyDark.length || onlyLight.length) {
    warn("MEDIUM", `Theme mismatch — only in dark: [${onlyDark.join(", ")}], only in light: [${onlyLight.join(", ")}]`);
  } else ok.push(`Dark and light themes define the same ${dv.size} variables`);
} else if (rv.size) {
  ok.push(`Theme variables defined on the root (${rv.size})`);
}

// --- 4. duplicate selectors --------------------------------------------------
const selCount = {};
for (const m of css.matchAll(/(^|\n)\s*([.#][a-zA-Z][^{\n]*?)\s*\{/g)) {
  const sel = m[2].trim();
  if (sel.includes("@") || sel.includes("%")) continue;
  selCount[sel] = (selCount[sel] || 0) + 1;
}
const dupes = Object.entries(selCount).filter(([, n]) => n > 2);
if (dupes.length) warn("LOW", `Selectors defined 3+ times (later rules may silently override): ${dupes.map(([s, n]) => `${s} ×${n}`).slice(0, 6).join(", ")}`);
else ok.push("No heavily duplicated selectors");

// --- 5. responsive coverage ---------------------------------------------------
const breakpoints = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map((m) => +m[1]);
const uniqueBps = [...new Set(breakpoints)].sort((a, b) => b - a);
if (uniqueBps.length < 3) warn("MEDIUM", `Only ${uniqueBps.length} responsive breakpoints — small screens may break`);
else ok.push(`Responsive breakpoints present: ${uniqueBps.join(", ")}px`);
if (!/max-width:\s*(4[0-9][0-9]|5[0-2][0-9])px/.test(css)) warn("MEDIUM", "No breakpoint below ~520px — very small phones untested");
else ok.push("A small-phone breakpoint exists");

// --- 6. layout risks ----------------------------------------------------------
const fixedWidths = [...css.matchAll(/[^-]width:\s*(\d{3,})px/g)].map((m) => +m[1]).filter((w) => w > 360);
if (fixedWidths.length) warn("MEDIUM", `Fixed widths larger than a phone screen: ${[...new Set(fixedWidths)].join("px, ")}px — check they shrink on mobile`);
else ok.push("No oversized fixed widths");

const gridsWithoutMinmax = [...css.matchAll(/grid-template-columns:\s*([^;]+);/g)]
  .map((m) => m[1].trim())
  .filter((v) => /\dfr/.test(v) && !v.includes("minmax") && !v.includes("repeat(auto"));
if (gridsWithoutMinmax.length > 6) warn("LOW", `${gridsWithoutMinmax.length} grids use bare fr units — long text can overflow (minmax(0,1fr) is safer)`);
else ok.push("Grid columns generally guard against overflow");

if (!/overflow-x:\s*hidden/.test(src) && !/overflow-x:\s*auto/.test(css)) warn("LOW", "No overflow-x guard found — long words could cause sideways scroll");
else ok.push("Horizontal overflow is guarded");

// --- 7. accessibility ---------------------------------------------------------
if (!/prefers-reduced-motion/.test(css)) warn("MEDIUM", "No prefers-reduced-motion support");
else ok.push("Respects prefers-reduced-motion");

if (!/:focus|focus-visible|focus-within/.test(css)) warn("HIGH", "No focus styles — keyboard users cannot see where they are");
else ok.push("Focus styles present");

const tapTargets = /min-width:\s*3[6-9]px|min-height:\s*3[6-9]px|min-height:\s*4\dpx/.test(css);
if (!tapTargets) warn("MEDIUM", "No minimum tap-target sizing for touch devices");
else ok.push("Touch tap targets are sized for fingers");

const aria = (src.match(/aria-label/g) || []).length;
if (aria < 3) warn("LOW", `Only ${aria} aria-labels — icon-only buttons should be labelled`);
else ok.push(`${aria} aria-labels on icon controls`);

const titles = (src.match(/title=/g) || []).length;
ok.push(`${titles} elements carry tooltips/titles`);

// --- 8. print stylesheet -------------------------------------------------------
if (!/@media print/.test(css)) warn("HIGH", "No print stylesheet — receipts will print the whole page");
else {
  ok.push("Print stylesheet exists");
  if (!/page-break-after|break-after/.test(css)) warn("LOW", "No page-break rule — the two receipts may print on one page");
  else ok.push("Receipts break onto separate pages");
}

// --- 9. safe areas / mobile chrome ---------------------------------------------
if (!/env\(safe-area-inset/.test(css)) warn("LOW", "No iPhone safe-area handling");
else ok.push("iPhone notch safe areas handled");

// --- 10. colour contrast sanity -------------------------------------------------
const hexes = [...css.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => m[1]);
const lum = (hex) => {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };
const bgDark = "141110", textDark = "F4EEE3";
const pairs = [
  ["body text on dark", textDark, bgDark],
  ["ember on dark", "FF6B2C", bgDark],
  ["jade on dark", "29D3A6", bgDark],
  ["saffron on dark", "FFB22C", bgDark],
  ["rose on dark", "FF5470", bgDark],
];
for (const [label, fg, bg] of pairs) {
  const r = ratio(fg, bg);
  if (r < 3) warn("MEDIUM", `Low contrast: ${label} = ${r.toFixed(1)}:1 (needs 3:1 for large text, 4.5:1 for body)`);
  else ok.push(`Contrast ${label}: ${r.toFixed(1)}:1`);
}

// --- 11. stylesheet size --------------------------------------------------------
const kb = (css.length / 1024).toFixed(1);
ok.push(`Stylesheet size: ${kb} KB (${css.split("\n").length} lines)`);
if (css.length > 90000) warn("LOW", `Stylesheet is large (${kb} KB) — consider splitting if it grows further`);

// --- report ----------------------------------------------------------------------
console.log("\n════════ CSS / DESIGN AUDIT ════════\n");
console.log(`✓ ${ok.length} checks passed:`);
ok.forEach((o) => console.log("   ·", o));
const order = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
issues.sort((a, b) => order[a.level] - order[b.level]);
console.log(`\n${issues.length ? "⚠ " + issues.length + " findings:" : "No issues found."}`);
issues.forEach((i) => console.log(`   [${i.level}] ${i.msg}`));
const high = issues.filter((i) => i.level === "HIGH").length;
console.log(`\nHIGH: ${high} · MEDIUM: ${issues.filter((i) => i.level === "MEDIUM").length} · LOW/INFO: ${issues.filter((i) => /LOW|INFO/.test(i.level)).length}`);

import assert from "node:assert/strict";

import {
  ensureAllowedValue,
  sanitizePlayerName,
  sanitizeSingleLineText,
} from "../src/utils/validation.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("sanitizePlayerName preserves supported special characters used by roster names", () => {
  assert.equal(sanitizePlayerName("KP°"), "KP°");
  assert.equal(sanitizePlayerName("AncientOne-"), "AncientOne-");
  assert.equal(sanitizePlayerName("John [BOM]"), "John [BOM]");
});

runTest("sanitizeSingleLineText strips control characters before trimming", () => {
  assert.equal(sanitizeSingleLineText("  A\tB\nC  ", 20), "ABC");
});

runTest("ensureAllowedValue falls back safely for invalid values", () => {
  const result = ensureAllowedValue("BadValue", ["A", "B", "C"], "B");
  assert.equal(result, "B");
});

console.log("Validation smoke tests passed.");

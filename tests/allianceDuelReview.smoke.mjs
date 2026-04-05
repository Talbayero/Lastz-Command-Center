import assert from "node:assert/strict";

import {
  dedupeLocalEntries,
  getAllianceDuelCompliance,
  normalizeLocalRank,
  normalizeLocalScore,
  parseAllianceDuelOcrRow,
  summarizeAllianceDuelCompliance,
} from "../src/utils/allianceDuelReview.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("getAllianceDuelCompliance handles daily and non-daily cases correctly", () => {
  assert.equal(getAllianceDuelCompliance("weekly", null, 3000000), "N/A");
  assert.equal(getAllianceDuelCompliance("daily", null, 3000000), "Missing Data");
  assert.equal(getAllianceDuelCompliance("daily", { score: 2999999, rank: 10 }, 3000000), "Below Requirement");
  assert.equal(getAllianceDuelCompliance("daily", { score: 3000000, rank: 10 }, 3000000), "Met");
});

runTest("summarizeAllianceDuelCompliance aggregates compliance counts", () => {
  assert.deepEqual(
    summarizeAllianceDuelCompliance("daily", ["Met", "Below Requirement", "Missing Data", "Met"]),
    { met: 2, below: 1, missing: 1 }
  );

  assert.deepEqual(
    summarizeAllianceDuelCompliance("weekly", ["N/A", "N/A", "Missing Data"]),
    { met: 0, below: 0, missing: 1 }
  );
});

runTest("normalizeLocalScore and normalizeLocalRank strip OCR punctuation safely", () => {
  assert.equal(normalizeLocalScore("17,583,383"), 17583383);
  assert.equal(normalizeLocalScore(" 10.816.072 "), 10816072);
  assert.equal(normalizeLocalRank("#52"), 52);
  assert.equal(normalizeLocalRank(""), null);
});

runTest("parseAllianceDuelOcrRow extracts rank, player, and score from a realistic row", () => {
  const parsed = parseAllianceDuelOcrRow([
    { text: "52", x0: 10, y0: 10, y1: 30 },
    { text: "Tedmeister", x0: 80, y0: 10, y1: 30 },
    { text: "[BOM]Band", x0: 180, y0: 10, y1: 30 },
    { text: "13,163,380", x0: 320, y0: 10, y1: 30 },
  ]);

  assert.deepEqual(parsed, {
    name: "Tedmeister",
    rank: 52,
    score: 13163380,
  });
});

runTest("dedupeLocalEntries removes duplicate OCR matches by normalized name and score", () => {
  const deduped = dedupeLocalEntries([
    { name: "Tedmeister", score: 13163380, rank: 52 },
    { name: "Tedmeister ", score: 13163380, rank: 52 },
    { name: "Deepmind", score: 98965966, rank: 1 },
  ]);

  assert.equal(deduped.length, 2);
});

console.log("Alliance duel review smoke tests passed.");

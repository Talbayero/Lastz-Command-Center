import assert from "node:assert/strict";
import { AI_PROMPTS, getAiPrompt } from "../src/utils/ai/prompts.ts";
import {
  normalizeAllianceDuelEntriesFromJson,
  parseVisionJsonResponse,
} from "../src/utils/ai/visionParsing.ts";

assert.ok(AI_PROMPTS.playerNameVision.version >= 1);
assert.ok(AI_PROMPTS.allianceDuelVision.version >= 1);
assert.equal(getAiPrompt("playerNameVision").id, "player-name-vision");

const parsed = parseVisionJsonResponse('```json {"entries":[{"rank":"2","name":"Mithryll","score":"95,546,354"}],} ```');
assert.equal(parsed.entries[0].name, "Mithryll");

const duelRows = normalizeAllianceDuelEntriesFromJson(
  '{"entries":[{"rank":"2","name":"Mithryll","score":"95,546,354"},{"rank":null,"name":"Tedmeister","score":"13,163,380"}]}'
);

assert.deepEqual(duelRows, [
  { rank: 2, name: "Mithryll", score: 95546354 },
  { rank: null, name: "Tedmeister", score: 13163380 },
]);

console.log("aiVision smoke checks passed");

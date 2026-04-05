import assert from "node:assert/strict";

import {
  getNextSessionExpiry,
  SESSION_TTL_DAYS,
  SESSION_EXPIRY_REFRESH_WINDOW_MS,
  SESSION_ROTATE_AFTER_MS,
  shouldRotateSession,
} from "../src/utils/sessionLifecycle.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("shouldRotateSession stays false for young sessions far from expiry", () => {
  const now = Date.UTC(2026, 3, 5, 12, 0, 0);
  const createdAt = new Date(now - (SESSION_ROTATE_AFTER_MS - 60_000));
  const expiresAt = new Date(now + SESSION_EXPIRY_REFRESH_WINDOW_MS + 60_000);

  assert.equal(shouldRotateSession(now, createdAt, expiresAt), false);
});

runTest("shouldRotateSession turns true for old sessions or sessions near expiry", () => {
  const now = Date.UTC(2026, 3, 5, 12, 0, 0);

  assert.equal(
    shouldRotateSession(
      now,
      new Date(now - SESSION_ROTATE_AFTER_MS),
      new Date(now + SESSION_EXPIRY_REFRESH_WINDOW_MS + 60_000)
    ),
    true
  );

  assert.equal(
    shouldRotateSession(
      now,
      new Date(now - 60_000),
      new Date(now + SESSION_EXPIRY_REFRESH_WINDOW_MS)
    ),
    true
  );
});

runTest("getNextSessionExpiry uses the shared TTL window", () => {
  const now = Date.UTC(2026, 3, 5, 12, 0, 0);
  const expected = now + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

  assert.equal(getNextSessionExpiry(now).getTime(), expected);
});

console.log("Session lifecycle smoke tests passed.");

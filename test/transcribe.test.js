import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTranscript, SUPPORTED_EXTENSIONS } from "../src/transcribe.js";

test("normalizes plain transcript text", () => {
  assert.deepEqual(normalizeTranscript({ text: "  Hello world  " }, false), {
    text: "Hello world",
    segments: [],
  });
});

test("normalizes diarized segments", () => {
  const result = normalizeTranscript({
    segments: [{ speaker: "A", start: 0, end: 1.5, text: " Hello " }],
  }, true);
  assert.equal(result.text, "A: Hello");
  assert.deepEqual(result.segments[0], { speaker: "A", start: 0, end: 1.5, text: "Hello" });
});

test("contains every supported API media extension", () => {
  for (const extension of [".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"]) {
    assert.equal(SUPPORTED_EXTENSIONS.has(extension), true);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLegacySnapshot, loadState } from "../src/state.ts";
import type { ModelEvent, ModelSnapshot } from "../src/types.ts";

/** A snapshot as the pre-rebuild watcher wrote it: no slug, channel, or class. */
const LEGACY = {
  key: "glm-5-2::glm-5-2",
  owner: "Zhipu AI",
  family: "GLM 5.2",
  modelId: "GLM-5.2",
  displayName: "GLM-5.2",
  modalities: ["text"],
  capabilities: {},
  limits: {},
  availability: [],
  lifecycle: "available",
  evidence: [],
  confidence: "verified",
  fingerprint: "abc",
  firstSeen: "2026-07-16T22:53:03.690Z",
  lastChanged: "2026-07-24T20:42:32.781Z",
} as unknown as ModelSnapshot;

const CURRENT: ModelSnapshot = {
  ...LEGACY,
  slug: "GLM-5.2",
  slugAliases: ["GLM-5.2"],
  channel: "ga",
  slugClass: "model",
  attributionVerified: true,
};

function event(id: string, after: ModelSnapshot): ModelEvent {
  return { id, type: "updated", importance: "major", after, changedFields: ["pricing"], detectedAt: "2026-07-24T20:42:32.781Z" };
}

async function stateDir(delivery: ModelEvent[], digest: ModelEvent[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "model-watcher-state-"));
  await writeFile(join(directory, "delivery.json"), JSON.stringify({ sent: {}, pendingMajor: delivery }), "utf8");
  await writeFile(join(directory, "digest.json"), JSON.stringify({ pending: digest }), "utf8");
  return directory;
}

test("a snapshot is legacy only until it carries every identity field", () => {
  assert.equal(isLegacySnapshot(LEGACY), true);
  assert.equal(isLegacySnapshot(CURRENT), false);
  assert.equal(isLegacySnapshot(undefined), false);
});

test("events queued under an older schema are dropped before they can be rendered", async () => {
  const directory = await stateDir([event("legacy", LEGACY), event("current", CURRENT)], [event("stale", LEGACY)]);
  const previous = process.env["STATE_DIR"];
  process.env["STATE_DIR"] = directory;
  try {
    const state = await loadState();
    assert.deepEqual(state.delivery.pendingMajor.map((queued) => queued.id), ["current"]);
    assert.deepEqual(state.digest.pending, []);
  } finally {
    if (previous === undefined) delete process.env["STATE_DIR"];
    else process.env["STATE_DIR"] = previous;
  }
});

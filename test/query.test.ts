import assert from "node:assert/strict";
import test from "node:test";
import { applySourceResults } from "../src/engine.ts";
import { record } from "../src/sources/factories.ts";
import { byRecency, familyHead, findModel, resolveVendorId, select, stealthCandidates } from "../src/query.ts";
import { SOURCES, coverage } from "../src/sources/registry.ts";
import type { SourceAdapter, SourceRunResult, WatcherState } from "../src/types.ts";

function source(id: string, kind: SourceAdapter["kind"], owner?: string): SourceAdapter {
  return {
    id,
    kind,
    ...(owner ? { owner } : {}),
    url: `https://example.com/${id}`,
    intervalMinutes: 10,
    tracksRemovals: true,
    enabled: () => true,
    fetch: async () => {
      throw new Error("unused");
    },
    parse: () => [],
  };
}

function run(adapter: SourceAdapter, entries: Array<[string, string | undefined]>): SourceRunResult {
  return {
    source: adapter,
    status: "ok",
    wasBaseline: false,
    observations: entries.flatMap(([slug, releaseDate]) =>
      record({
        sourceUrl: adapter.url,
        slug,
        ...(adapter.owner ? { assertedVendorId: adapter.owner } : {}),
        ...(releaseDate ? { releaseDate } : {}),
        availability: ["public"],
      }),
    ),
    document: { url: adapter.url, status: 200, body: "x", fetchedAt: "2026-07-24T12:00:00.000Z" },
  };
}

function populated(): WatcherState {
  const state: WatcherState = {
    models: {},
    sources: {},
    delivery: { sent: {}, pendingMajor: [] },
    digest: { pending: [] },
    subscriptions: {},
  };
  const anthropic = source("official:api:anthropic", "official-api", "anthropic");
  const arena = source("benchmark:arena", "benchmark");
  for (const adapter of [anthropic, arena]) {
    state.sources[adapter.id] = { failureCount: 0, modelKeys: [], missingCounts: {}, baselineComplete: true };
  }
  applySourceResults(state, [
    run(anthropic, [
      ["claude-opus-4-6", "2026-02-17"],
      ["claude-opus-4-5", "2025-11-01"],
      ["claude-opus-5-preview", "2026-06-01"],
      ["claude-opus-4-6-latest", undefined],
    ]),
    run(arena, [["torenia-alpha", undefined]]),
  ]);
  return state;
}

test("select excludes pointers unless asked and honours filters", () => {
  const state = populated();
  assert.equal(select(state, { vendorId: "anthropic" }).length, 3);
  assert.equal(select(state, { vendorId: "anthropic", includePointers: true }).length, 4);
  assert.equal(select(state, { modality: "text" }).length >= 3, true);
  assert.equal(select(state, { modality: "3d" }).length, 0);
  assert.equal(select(state, { verifiedOnly: true }).every((model) => model.attributionVerified), true);
});

test("recency ordering prefers the published date, then the version", () => {
  const models = select(populated(), { vendorId: "anthropic" }).sort(byRecency);
  assert.deepEqual(models.map((model) => model.slug), [
    "claude-opus-5-preview",
    "claude-opus-4-6",
    "claude-opus-4-5",
  ]);
});

test("the family head prefers generally available over preview", () => {
  const head = familyHead(populated(), "claude");
  assert.equal(head[0]?.slug, "claude-opus-4-6");
  assert.equal(head.at(-1)?.channel, "preview");
});

test("model lookup accepts an exact slug, an alias spelling, or a fragment", () => {
  const state = populated();
  assert.equal(findModel(state, "claude-opus-4-6")?.slug, "claude-opus-4-6");
  assert.equal(findModel(state, "us.anthropic.claude-opus-4-6-v1:0")?.slug, "claude-opus-4-6");
  assert.equal(findModel(state, "opus-4-5")?.slug, "claude-opus-4-5");
  assert.equal(findModel(state, "nothing-like-this"), undefined);
});

test("stealth candidates are exactly the unattributed arena-only sightings", () => {
  const candidates = stealthCandidates(populated());
  assert.deepEqual(candidates.map((model) => model.slug), ["torenia-alpha"]);
  assert.equal(candidates[0]?.attributionVerified, false);
});

test("vendor lookup accepts an id, a display name, or a fragment", () => {
  assert.equal(resolveVendorId("openai"), "openai");
  assert.equal(resolveVendorId("OpenAI"), "openai");
  assert.equal(resolveVendorId("Black Forest Labs"), "bfl");
  assert.equal(resolveVendorId("black-forest-labs"), "bfl");
  assert.equal(resolveVendorId("not-a-company"), undefined);
});

test("the registry covers every generative modality and has unique source ids", () => {
  const ids = new Set(SOURCES.map((item) => item.id));
  assert.equal(ids.size, SOURCES.length, "source ids are unique");
  const report = coverage();
  assert.ok(report.total >= 250, "the registry is broad");
  for (const modality of ["text", "code", "image", "video", "audio", "speech", "music", "3d", "world", "embedding", "rerank"]) {
    assert.ok((report.byModality[modality] ?? 0) > 0, `${modality} has at least one dedicated source`);
  }
  assert.ok(report.vendorsCovered / report.vendorsTotal >= 0.75, "most publishers have a first-party source");
});

test("every source declares a sane polling interval and a valid URL", () => {
  for (const item of SOURCES) {
    assert.ok(item.intervalMinutes >= 10 && item.intervalMinutes <= 240, `${item.id} polls politely`);
    assert.doesNotThrow(() => new URL(item.url), `${item.id} has a valid URL`);
    assert.match(item.url, /^https:\/\//, `${item.id} uses HTTPS`);
  }
});

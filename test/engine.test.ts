import assert from "node:assert/strict";
import test from "node:test";
import { applySourceResults, observation } from "../src/engine.ts";
import type { SourceAdapter, SourceRunResult, WatcherState } from "../src/types.ts";

function state(): WatcherState {
  return { models: {}, sources: {}, delivery: { sent: {}, pendingMajor: [] }, digest: { pending: [] } };
}

function source(id: string, kind: SourceAdapter["kind"], owner?: string): SourceAdapter {
  return {
    id, kind, owner, url: `https://example.com/${id}`, intervalMinutes: 10, tracksRemovals: true,
    enabled: () => true, fetch: async () => { throw new Error("unused"); }, parse: () => [],
  };
}

function run(adapter: SourceAdapter, names: string[], wasBaseline = false): SourceRunResult {
  return {
    source: adapter, status: "ok", wasBaseline,
    observations: names.map((name) => observation(adapter.url, name.split(/[- ]/)[0]!, name, {
      displayName: name, modalities: ["video"], availability: ["public"], lifecycle: "available",
    })),
    document: { url: adapter.url, status: 200, body: names.join("\n"), fetchedAt: "2026-07-16T12:00:00.000Z" },
  };
}

test("new sources seed silently, then emit verified additions", () => {
  const value = state();
  const official = source("official:bytedance", "official-page", "ByteDance Seed");
  assert.equal(applySourceResults(value, [run(official, ["Seedance-2.0"], true)]).length, 0);
  const events = applySourceResults(value, [run(official, ["Seedance-2.0", "Seedance-2.1"])]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "added");
  assert.equal(events[0]?.after.confidence, "verified");
});

test("benchmark sighting creates an emerging unknown-owner event", () => {
  const value = state();
  const benchmark = source("benchmark:video", "benchmark");
  value.sources[benchmark.id] = { failureCount: 0, modelKeys: [], missingCounts: {}, baselineComplete: true };
  const events = applySourceResults(value, [run(benchmark, ["HappyHorse-1.1"])]);
  assert.equal(events[0]?.after.confidence, "emerging");
  assert.equal(events[0]?.after.owner, undefined);
});

test("first-party evidence upgrades emerging models to verified", () => {
  const value = state();
  const benchmark = source("benchmark:video", "benchmark");
  const official = source("official:alibaba", "official-page", "Alibaba");
  value.sources[benchmark.id] = { failureCount: 0, modelKeys: [], missingCounts: {}, baselineComplete: true };
  applySourceResults(value, [run(benchmark, ["HappyHorse-1.1"])]);
  value.sources[official.id] = { failureCount: 0, modelKeys: [], missingCounts: {}, baselineComplete: true };
  const events = applySourceResults(value, [run(official, ["HappyHorse-1.1"])]);
  assert.equal(events[0]?.type, "verified");
  assert.equal(events[0]?.after.owner, "Alibaba");
});

test("removal requires three successful absences and failures do not count", () => {
  const value = state();
  const official = source("official:vidu", "official-page", "ShengShu");
  applySourceResults(value, [run(official, ["ViduQ3"], true)]);
  const failed: SourceRunResult = { source: official, status: "failed", observations: [], error: "timeout", wasBaseline: false };
  assert.equal(applySourceResults(value, [failed]).length, 0);
  assert.equal(applySourceResults(value, [run(official, [])]).length, 0);
  assert.equal(applySourceResults(value, [run(official, [])]).length, 0);
  const events = applySourceResults(value, [run(official, [])]);
  assert.equal(events[0]?.type, "removed");
});

import assert from "node:assert/strict";
import test from "node:test";
import { applySourceResults, observation } from "../src/engine.ts";
import { record } from "../src/sources/factories.ts";
import type { SourceAdapter, SourceRunResult, WatcherState } from "../src/types.ts";

function state(): WatcherState {
  return { models: {}, sources: {}, delivery: { sent: {}, pendingMajor: [] }, digest: { pending: [] }, subscriptions: {} };
}

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

function run(adapter: SourceAdapter, slugs: string[], wasBaseline = false): SourceRunResult {
  return {
    source: adapter,
    status: "ok",
    wasBaseline,
    observations: slugs.flatMap((slug) =>
      record({
        sourceUrl: adapter.url,
        slug,
        ...(adapter.owner ? { assertedVendorId: adapter.owner } : {}),
        availability: ["public"],
      }),
    ),
    document: { url: adapter.url, status: 200, body: slugs.join("\n"), fetchedAt: "2026-07-24T12:00:00.000Z" },
  };
}

function ready(value: WatcherState, adapter: SourceAdapter): void {
  value.sources[adapter.id] = { failureCount: 0, modelKeys: [], missingCounts: {}, baselineComplete: true };
}

test("new sources seed silently, then emit verified additions", () => {
  const value = state();
  const official = source("official:page:bytedance", "official-page", "bytedance");
  assert.equal(applySourceResults(value, [run(official, ["seedance-2.0"], true)]).length, 0);
  const events = applySourceResults(value, [run(official, ["seedance-2.0", "seedance-2.1"])]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "added");
  assert.equal(events[0]?.after.confidence, "verified");
  assert.equal(events[0]?.after.slug, "seedance-2.1");
  assert.equal(events[0]?.after.owner, "ByteDance Seed");
});

test("every snapshot field is definitive or explicitly absent", () => {
  const value = state();
  const official = source("official:api:anthropic", "official-api", "anthropic");
  applySourceResults(value, [run(official, ["claude-opus-4-6"], true)]);
  const snapshot = Object.values(value.models)[0]?.snapshot;
  assert.equal(snapshot?.slug, "claude-opus-4-6");
  assert.equal(snapshot?.vendorId, "anthropic");
  assert.equal(snapshot?.familyId, "claude");
  assert.equal(snapshot?.version, "4.6");
  assert.equal(snapshot?.tier, "opus");
  assert.equal(snapshot?.channel, "ga");
  assert.equal(snapshot?.slugClass, "model");
  assert.equal(snapshot?.attributionVerified, true);
  assert.equal(snapshot?.releaseDate, undefined, "a date that was never published stays absent");
});

test("benchmark-only sightings are emerging and unattributed", () => {
  const value = state();
  const benchmark = source("benchmark:arena", "benchmark");
  ready(value, benchmark);
  const events = applySourceResults(value, [{
    source: benchmark,
    status: "ok",
    wasBaseline: false,
    observations: [observation(benchmark.url, "stealth", "torenia-alpha", {
      displayName: "torenia-alpha",
      capabilities: { stealth: true },
      availability: ["arena evaluation only"],
      lifecycle: "preview",
    })],
    document: { url: benchmark.url, status: 200, body: "torenia-alpha", fetchedAt: "2026-07-24T12:00:00.000Z" },
  }]);
  assert.equal(events[0]?.after.confidence, "emerging");
  assert.equal(events[0]?.after.owner, undefined);
  assert.equal(events[0]?.after.attributionVerified, false);
});

test("first-party evidence upgrades an emerging model to verified", () => {
  const value = state();
  const benchmark = source("benchmark:arena", "benchmark");
  const official = source("official:page:alibaba", "official-page", "alibaba");
  ready(value, benchmark);
  applySourceResults(value, [run(benchmark, ["qwen4-max"])]);
  ready(value, official);
  const events = applySourceResults(value, [run(official, ["qwen4-max"])]);
  assert.equal(events[0]?.type, "verified");
  assert.equal(events[0]?.after.owner, "Alibaba Cloud (Qwen)");
});

test("dated snapshots and rolling aliases are minor, not new-model alerts", () => {
  const value = state();
  const official = source("official:api:anthropic", "official-api", "anthropic");
  ready(value, official);
  const events = applySourceResults(value, [run(official, ["claude-opus-4-6-20260217", "claude-opus-4-6-latest"])]);
  assert.equal(events.length, 2);
  assert.equal(events.every((event) => event.importance === "minor"), true);
  assert.deepEqual(events.map((event) => event.after.slugClass).sort(), ["alias", "snapshot"]);
});

test("quantized and community re-uploads never enter the catalog", () => {
  const value = state();
  const repo = source("official:hf:meta", "official-repo", "meta");
  ready(value, repo);
  const events = applySourceResults(value, [run(repo, [
    "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    "meta-llama/Llama-4-Scout-17B-16E-Instruct-FP8",
  ])]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.after.slug, "Llama-4-Scout-17B-16E-Instruct");
});

test("an older version first seen in prose is a back-reference, not a launch", () => {
  const value = state();
  const official = source("official:page:google", "official-page", "google");
  applySourceResults(value, [run(official, ["gemini-3.6-flash"], true)]);
  // A docs page later mentions Gemini 2 in passing. The name is new to us, but
  // it sits below the family head, so it must not be announced as a release.
  const events = applySourceResults(value, [run(official, ["gemini-3.6-flash", "gemini-2.0-pro", "gemini-4.0-pro"])]);
  const bySlug = new Map(events.map((event) => [event.after.slug, event]));
  assert.equal(bySlug.get("gemini-2.0-pro")?.importance, "minor", "an older version is digested");
  assert.equal(bySlug.get("gemini-4.0-pro")?.importance, "major", "a newer version is announced");
});

test("removal requires three successful absences and failures never count", () => {
  const value = state();
  const official = source("official:page:shengshu", "official-page", "shengshu");
  applySourceResults(value, [run(official, ["vidu-q3"], true)]);
  const failed: SourceRunResult = { source: official, status: "failed", observations: [], error: "timeout", wasBaseline: false };
  assert.equal(applySourceResults(value, [failed]).length, 0);
  assert.equal(applySourceResults(value, [run(official, [])]).length, 0);
  assert.equal(applySourceResults(value, [run(official, [])]).length, 0);
  const events = applySourceResults(value, [run(official, [])]);
  assert.equal(events[0]?.type, "removed");
});

test("a published-limit change on a tracked model is a major update", () => {
  const value = state();
  const official = source("official:api:openai", "official-api", "openai");
  applySourceResults(value, [run(official, ["gpt-5.2"], true)]);
  const upgraded: SourceRunResult = {
    ...run(official, ["gpt-5.2"]),
    observations: record({
      sourceUrl: official.url,
      slug: "gpt-5.2",
      assertedVendorId: "openai",
      limits: { contextTokens: 2_000_000 },
      availability: ["public"],
    }),
  };
  const events = applySourceResults(value, [upgraded]);
  assert.equal(events[0]?.type, "updated");
  assert.equal(events[0]?.importance, "major");
  assert.ok(events[0]?.changedFields.includes("limits"));
});

test("the same model seen under different spellings stays one record", () => {
  const value = state();
  const api = source("official:api:anthropic", "official-api", "anthropic");
  const catalog = source("catalog:models-dev", "catalog");
  ready(value, api);
  ready(value, catalog);
  applySourceResults(value, [run(api, ["claude-opus-4-6"])]);
  applySourceResults(value, [run(catalog, ["us.anthropic.claude-opus-4-6-v1:0"])]);
  assert.equal(Object.keys(value.models).length, 1);
  const snapshot = Object.values(value.models)[0]!.snapshot!;
  assert.equal(snapshot.evidence.length, 2);
  assert.equal(snapshot.confidence, "verified");
});

import assert from "node:assert/strict";
import test from "node:test";
import { COMMANDS, autocomplete, handleCommand } from "../src/bot/commands.ts";
import { applySourceResults } from "../src/engine.ts";
import { record } from "../src/sources/factories.ts";
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

function run(adapter: SourceAdapter, slugs: string[]): SourceRunResult {
  return {
    source: adapter,
    status: "ok",
    wasBaseline: false,
    observations: slugs.flatMap((slug) =>
      record({
        sourceUrl: adapter.url,
        slug,
        ...(adapter.owner ? { assertedVendorId: adapter.owner } : {}),
        limits: { contextTokens: 200000 },
        availability: ["public"],
      }),
    ),
    document: { url: adapter.url, status: 200, body: slugs.join("\n"), fetchedAt: "2026-07-24T12:00:00.000Z" },
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
  const google = source("official:api:google", "official-api", "google");
  const bfl = source("official:api:bfl", "official-api", "bfl");
  for (const adapter of [anthropic, google, bfl]) {
    state.sources[adapter.id] = { failureCount: 0, modelKeys: [], missingCounts: {}, baselineComplete: true };
  }
  applySourceResults(state, [
    run(anthropic, ["claude-opus-4-6", "claude-sonnet-5", "claude-opus-4-6-20260217"]),
    run(google, ["gemini-3.6-flash", "veo-3.1-generate-001"]),
    run(bfl, ["flux-2-pro"]),
  ]);
  return state;
}

const context = (state: WatcherState, channelId = "channel-1") => ({
  state,
  channelId,
  save: async () => undefined,
});

test("every command declares a description and valid option types", () => {
  const names = new Set(COMMANDS.map((command) => command.name));
  assert.equal(names.size, COMMANDS.length, "command names are unique");
  for (const command of COMMANDS) {
    assert.match(command.name, /^[a-z][a-z-]{0,31}$/, `${command.name} is a legal command name`);
    assert.ok(command.description.length > 0 && command.description.length <= 100);
    for (const option of command.options ?? []) {
      assert.ok([3, 4, 5].includes(option.type), `${command.name}.${option.name} has a supported type`);
      assert.ok(option.description.length <= 100);
    }
    const required = (command.options ?? []).map((option) => option.required === true);
    assert.deepEqual([...required].sort((a, b) => Number(b) - Number(a)), required, "required options come first");
  }
});

test("/model returns a definitive record for an exact slug", async () => {
  const response = await handleCommand("model", { slug: "claude-opus-4-6" }, context(populated()));
  const embed = response.embeds?.[0];
  assert.match(embed?.description ?? "", /`claude-opus-4-6`/);
  assert.match(embed?.description ?? "", /Anthropic/);
});

test("/model resolves a routed slug spelling to the same record", async () => {
  const response = await handleCommand("model", { slug: "us.anthropic.claude-opus-4-6-v1:0" }, context(populated()));
  assert.match(response.embeds?.[0]?.description ?? "", /`claude-opus-4-6`/);
});

test("/model reports no match rather than guessing", async () => {
  const response = await handleCommand("model", { slug: "definitely-not-a-model" }, context(populated()));
  assert.equal(response.embeds?.[0]?.title, "No definitive match");
});

test("/slugs emits a bare slug list and excludes pointers by default", async () => {
  const response = await handleCommand("slugs", { vendor: "anthropic" }, context(populated()));
  const block = response.embeds?.[0]?.description ?? "";
  assert.match(block, /claude-opus-4-6/);
  assert.match(block, /claude-sonnet-5/);
  assert.ok(!block.includes("20260217"), "dated snapshots are excluded by default");
  assert.match(response.content ?? "", /^\*\*2 slugs\*\*/);

  const withPointers = await handleCommand("slugs", { vendor: "anthropic", pointers: true }, context(populated()));
  assert.match(withPointers.embeds?.[0]?.description ?? "", /20260217/);
});

test("/slugs rejects an unknown publisher instead of returning everything", async () => {
  const response = await handleCommand("slugs", { vendor: "acme-labs" }, context(populated()));
  assert.equal(response.embeds?.[0]?.title, "No definitive match");
});

test("/vendor groups a publisher's models by modality", async () => {
  const response = await handleCommand("vendor", { name: "Google DeepMind" }, context(populated()));
  const embed = response.embeds?.[0];
  assert.match(embed?.title ?? "", /Google DeepMind · 2 tracked models/);
  assert.ok((embed?.fields ?? []).some((field) => field.name.includes("video")));
});

test("/vendor names a registered publisher with no observations yet", async () => {
  const response = await handleCommand("vendor", { name: "moonvalley" }, context(populated()));
  assert.match(response.embeds?.[0]?.title ?? "", /0 tracked models/);
  assert.match(response.embeds?.[0]?.description ?? "", /registered/);
});

test("/latest returns the family head plus the rest of the family", async () => {
  const response = await handleCommand("latest", { family: "claude" }, context(populated()));
  assert.match(response.embeds?.[0]?.description ?? "", /`claude-(opus-4-6|sonnet-5)`/);
  assert.ok((response.embeds?.length ?? 0) >= 1);
});

test("/parse decomposes any identifier without needing it to be tracked", async () => {
  const response = await handleCommand("parse", { slug: "publishers/google/models/veo-3.1-fast-generate-001" }, context(populated()));
  const description = response.embeds?.[0]?.description ?? "";
  assert.match(description, /\*\*canonical slug:\*\* veo-3\.1-fast-generate-001/);
  assert.match(description, /\*\*routing namespace:\*\* publishers\/google\/models/);
  assert.match(description, /\*\*version:\*\* 3\.1/);
  assert.match(description, /\*\*release channel:\*\* generally available/);
});

test("/compare puts two models side by side", async () => {
  const response = await handleCommand("compare", { a: "claude-opus-4-6", b: "gemini-3.6-flash" }, context(populated()));
  assert.match(response.embeds?.[0]?.description ?? "", /`claude-opus-4-6` vs `gemini-3\.6-flash`/);
});

test("/new bounds its window and reports an empty window honestly", async () => {
  const state = populated();
  const fresh = await handleCommand("new", { hours: 24 }, context(state));
  assert.match(fresh.embeds?.[0]?.title ?? "", /new models? · last 24h/);
  for (const model of Object.values(state.models)) {
    if (model.snapshot) model.snapshot.firstSeen = "2020-01-01T00:00:00.000Z";
  }
  const empty = await handleCommand("new", { hours: 1000 }, context(state));
  assert.match(empty.embeds?.[0]?.title ?? "", /No new models in the last 720h/);
});

test("/watch and /unwatch persist a channel subscription", async () => {
  const state = populated();
  let saved = 0;
  const save = async () => {
    saved += 1;
  };
  await handleCommand("watch", { vendor: "anthropic", modality: "text" }, { state, channelId: "c1", save });
  assert.deepEqual(state.subscriptions["c1"]?.vendors, ["anthropic"]);
  assert.deepEqual(state.subscriptions["c1"]?.modalities, ["text"]);
  assert.equal(state.subscriptions["c1"]?.minImportance, "major");

  await handleCommand("watch", { family: "claude", minor: true }, { state, channelId: "c1", save });
  assert.deepEqual(state.subscriptions["c1"]?.families, ["claude"]);
  assert.equal(state.subscriptions["c1"]?.minImportance, "minor");

  await handleCommand("unwatch", {}, { state, channelId: "c1", save });
  assert.equal(state.subscriptions["c1"], undefined);
  assert.equal(saved, 3);
});

test("/coverage reports source health without throwing", async () => {
  const response = await handleCommand("coverage", {}, context(populated()));
  assert.equal(response.embeds?.[0]?.title, "Watcher coverage");
  assert.match(response.embeds?.[0]?.description ?? "", /sources configured/);
});

test("/vendors and /families enumerate the registry", async () => {
  const vendors = await handleCommand("vendors", { modality: "video" }, context(populated()));
  assert.match(vendors.embeds?.[0]?.title ?? "", /tracked AI publishers · video/);
  const families = await handleCommand("families", { vendor: "bfl" }, context(populated()));
  assert.match(families.embeds?.[0]?.title ?? "", /Black Forest Labs/);
});

test("autocomplete never exceeds Discord's limits", () => {
  const state = populated();
  for (const [command, option, value] of [
    ["model", "slug", "cla"],
    ["slugs", "vendor", "goo"],
    ["latest", "family", "flu"],
  ] as const) {
    const choices = autocomplete(command, option, value, state);
    assert.ok(choices.length <= 25);
    for (const choice of choices) {
      assert.ok(choice.name.length <= 100 && choice.value.length <= 100);
    }
  }
});

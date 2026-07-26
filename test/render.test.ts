import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { cardForm, matchesSubscription } from "../src/discord.ts";
import { renderModelCard } from "../src/image-card.ts";
import { compareEmbed, digestEmbeds, modelEmbed, slugBlock } from "../src/render.ts";
import type { ModelEvent, ModelSnapshot, Subscription } from "../src/types.ts";
import { newYorkClock } from "../src/util.ts";

function snapshot(overrides: Partial<ModelSnapshot> = {}): ModelSnapshot {
  return {
    key: "seedance::seedance-2-0",
    owner: "ByteDance Seed",
    vendorId: "bytedance",
    family: "Seedance",
    familyId: "seedance",
    modelId: "seedance-2.0",
    slug: "seedance-2.0",
    slugAliases: ["seedance-2.0", "bytedance/seedance-2.0"],
    displayName: "Seedance 2.0",
    modalities: ["video", "audio"],
    channel: "ga",
    slugClass: "model",
    version: "2.0",
    tier: "pro",
    capabilities: { nativeAudio: true },
    limits: { contextTokens: 128000 },
    pricing: { "$/second": 0.15 },
    availability: ["Volcengine Ark"],
    lifecycle: "available",
    releaseDate: "2026-03-02",
    evidence: [{
      sourceId: "official:page:bytedance",
      sourceKind: "official-page",
      url: "https://seed.bytedance.com/en/models",
      observedAt: "2026-07-24T12:00:00.000Z",
    }],
    confidence: "verified",
    attributionVerified: true,
    fingerprint: "abc",
    firstSeen: "2026-07-24T12:00:00.000Z",
    lastChanged: "2026-07-24T12:00:00.000Z",
    ...overrides,
  };
}

const event: ModelEvent = {
  id: "fixture-event",
  type: "added",
  importance: "major",
  changedFields: ["model"],
  detectedAt: "2026-07-24T14:00:00.000Z",
  after: snapshot(),
};

function embedSize(embed: ReturnType<typeof modelEmbed>): number {
  return (
    (embed.title?.length ?? 0) +
    (embed.description?.length ?? 0) +
    (embed.fields ?? []).reduce((total, field) => total + field.name.length + field.value.length, 0)
  );
}

test("the model embed leads with the exact slug and stays inside Discord limits", () => {
  const embed = modelEmbed(event.after, event, true);
  assert.match(embed.title ?? "", /^NEW MODEL/);
  assert.match(embed.description ?? "", /`seedance-2\.0`/);
  assert.ok((embed.fields ?? []).some((field) => field.name === "Evidence"));
  assert.ok((embed.fields ?? []).some((field) => field.name === "Release channel"));
  assert.ok((embed.fields ?? []).some((field) => field.name === "Known slug spellings"));
  assert.ok(embedSize(embed) <= 6000);
  assert.equal(embed.image?.url, "attachment://model-card.png");
});

test("an unattributed model states that its publisher is unverified", () => {
  const embed = modelEmbed(snapshot({
    owner: undefined,
    vendorId: undefined,
    attributionVerified: false,
    capabilities: { stealth: true },
    displayName: "torenia-alpha",
    slug: "torenia-alpha",
  }));
  const attribution = (embed.fields ?? []).find((field) => field.name === "Attribution");
  assert.ok(attribution, "an attribution caveat is always present when unverified");
  assert.match(attribution!.value, /No publisher has claimed/);
});

test("unpublished fields are reported as absent rather than guessed", () => {
  const embed = modelEmbed(snapshot({ limits: {}, pricing: undefined, releaseDate: undefined, modalities: [] }));
  assert.match(embed.description ?? "", /Publication date: not published/);
  const context = (embed.fields ?? []).find((field) => field.name === "Context window");
  assert.equal(context?.value, "Not published");
  const modalities = (embed.fields ?? []).find((field) => field.name === "Modalities");
  assert.equal(modalities?.value, "Not published");
});

test("the slug block is copy-pasteable and chunked", () => {
  const blocks = slugBlock([snapshot(), snapshot({ slug: "seedance-2.1", key: "b" })]);
  assert.equal(blocks.length, 1);
  assert.match(blocks[0]!, /^```\nseedance-2\.0\nseedance-2\.1\n```$/);
  assert.deepEqual(slugBlock([]), ["```\n(no matching slugs)\n```"]);
});

test("compare and digest renderers stay within field limits", () => {
  const compare = compareEmbed(snapshot(), snapshot({ slug: "veo-3.2", displayName: "Veo 3.2", owner: "Google DeepMind" }));
  assert.ok((compare.fields ?? []).length <= 25);
  const digest = digestEmbeds([event, { ...event, id: "second" }]);
  assert.equal(digest.length, 1);
  assert.match(digest[0]!.description ?? "", /seedance-2\.0/);
});

test("subscriptions filter by publisher, modality, family, and importance", () => {
  const base: Subscription = {
    channelId: "1",
    vendors: [],
    modalities: [],
    families: [],
    minImportance: "major",
    createdAt: "2026-07-24T12:00:00.000Z",
  };
  assert.equal(matchesSubscription(event, base), true);
  assert.equal(matchesSubscription(event, { ...base, vendors: ["bytedance"] }), true);
  assert.equal(matchesSubscription(event, { ...base, vendors: ["openai"] }), false);
  assert.equal(matchesSubscription(event, { ...base, modalities: ["video"] }), true);
  assert.equal(matchesSubscription(event, { ...base, modalities: ["3d"] }), false);
  assert.equal(matchesSubscription(event, { ...base, families: ["seedance"] }), true);
  assert.equal(matchesSubscription({ ...event, importance: "minor" }, base), false);
  assert.equal(matchesSubscription({ ...event, importance: "minor" }, { ...base, minImportance: "minor" }), true);
});

test("the card is a 1200x675 PNG", async () => {
  const card = await renderModelCard(event);
  const metadata = await sharp(card).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 675);
});

test("a card upload carries the payload as a field, never as a file", async () => {
  const form = cardForm({ embeds: [modelEmbed(event.after, event, true)] }, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const body = await new Request("https://discord.invalid", { method: "POST", body: form }).text();
  const dispositions = body.split("\r\n").filter((line) => line.startsWith("Content-Disposition"));
  assert.deepEqual(dispositions, [
    'Content-Disposition: form-data; name="payload_json"',
    'Content-Disposition: form-data; name="files[0]"; filename="model-card.png"',
  ]);
  assert.equal(body.includes('filename="blob"'), false, "a Blob payload would be posted as a junk attachment");
});

test("the New York digest clock handles daylight-saving offsets", () => {
  assert.deepEqual(newYorkClock(new Date("2026-01-15T14:00:00Z")), { date: "2026-01-15", hour: 9 });
  assert.deepEqual(newYorkClock(new Date("2026-07-15T13:00:00Z")), { date: "2026-07-15", hour: 9 });
});

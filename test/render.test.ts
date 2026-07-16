import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderEvent } from "../src/discord.ts";
import { renderModelCard } from "../src/image-card.ts";
import type { ModelEvent } from "../src/types.ts";
import { newYorkClock } from "../src/util.ts";

const event: ModelEvent = {
  id: "fixture-event", type: "added", importance: "major", changedFields: ["model"], detectedAt: "2026-07-16T14:00:00.000Z",
  after: {
    key: "seedance::seedance-2-0", owner: "ByteDance Seed", family: "Seedance", modelId: "seedance-2.0",
    displayName: "Seedance 2.0", modalities: ["video", "audio"], capabilities: { nativeAudio: true }, limits: { resolution: "1080p" },
    availability: ["public"], lifecycle: "available", evidence: [{ sourceId: "official:seed", sourceKind: "official-page", url: "https://seed.bytedance.com/en/models", observedAt: "2026-07-16T14:00:00.000Z" }],
    confidence: "verified", fingerprint: "abc", firstSeen: "2026-07-16T14:00:00.000Z", lastChanged: "2026-07-16T14:00:00.000Z",
  },
};

test("Discord event is readable and card is 1200x675 PNG", async () => {
  const embed = renderEvent(event, true);
  assert.match(embed.title, /VERIFIED/);
  assert.ok(embed.fields.some((field) => field.name === "Evidence"));
  const embedCharacters = embed.title.length + embed.description.length
    + embed.fields.reduce((total, field) => total + field.name.length + field.value.length, 0);
  assert.ok(embedCharacters <= 6000);
  const card = await renderModelCard(event);
  const metadata = await sharp(card).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 675);
});

test("New York digest clock handles daylight-saving offsets", () => {
  assert.deepEqual(newYorkClock(new Date("2026-01-15T14:00:00Z")), { date: "2026-01-15", hour: 9 });
  assert.deepEqual(newYorkClock(new Date("2026-07-15T13:00:00Z")), { date: "2026-07-15", hour: 9 });
});

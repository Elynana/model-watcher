import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { ModelObservation, SourceAdapter } from "../src/types.ts";
import {
  falCatalog,
  huggingFaceOrg,
  liteLlmCatalog,
  modelsDevCatalog,
  officialFeed,
  officialPage,
  openRouter,
} from "../src/sources/factories.ts";

async function parseFixture(source: SourceAdapter, file: string): Promise<ModelObservation[]> {
  const body = await readFile(new URL(`./fixtures/${file}`, import.meta.url), "utf8");
  return source.parse({ url: source.url, status: 200, body, fetchedAt: "2026-07-24T12:00:00.000Z" });
}

const slugs = (models: ModelObservation[]): string[] => models.map((model) => model.modelId);

test("models.dev catalog yields exact slugs with limits, pricing, and dates", async () => {
  const models = await parseFixture(modelsDevCatalog(), "models-dev.json");
  assert.deepEqual(slugs(models), [
    "claude-opus-4-6",
    "claude-opus-4-5-20251101",
    "gemini-3.6-flash",
    "flux-2-pro",
  ]);
  const opus = models[0]!;
  assert.equal(opus.owner, "Anthropic");
  assert.equal(opus.limits["contextTokens"], 1000000);
  assert.equal(opus.pricing?.["input $/M"], 5);
  assert.equal(opus.releaseDate, "2026-02-17");
  assert.equal(opus.capabilities["reasoning"], true);

  const flux = models.at(-1)!;
  assert.equal(flux.owner, "Black Forest Labs");
  assert.deepEqual(flux.modalities, ["image"], "a modality is what the model produces");
  assert.equal(flux.capabilities["accepts"], "image, text", "inputs are a capability, not a modality");
});

test("LiteLLM catalog covers video, speech, and rerank and drops tariff rows", async () => {
  const models = await parseFixture(liteLlmCatalog(), "litellm.json");
  const byId = new Map(models.map((model) => [model.modelId, model]));
  assert.ok(!slugs(models).some((slug) => slug.includes("1024-x-1024")), "resolution tariff rows are excluded");

  assert.deepEqual(byId.get("veo-3.1-generate-001")?.modalities, ["video"]);
  assert.equal(byId.get("veo-3.1-generate-001")?.capabilities["accepts"], "image, text");
  assert.equal(byId.get("veo-3.1-generate-001")?.owner, "Google DeepMind");
  assert.deepEqual(byId.get("sora-2-pro")?.modalities, ["video"]);
  assert.equal(byId.get("eleven_v3")?.owner, "ElevenLabs");
  assert.deepEqual(byId.get("rerank-v4.0")?.modalities, ["rerank"]);

  const bedrock = byId.get("claude-opus-4-6")!;
  assert.equal(bedrock.owner, "Anthropic", "Bedrock routing prefixes resolve to the publisher");
  assert.equal(bedrock.pricing?.["input $/M"], 5);
});

test("fal catalog keeps routed media endpoints and attributes them to publishers", async () => {
  const models = await parseFixture(falCatalog(), "fal.json");
  const byId = new Map(models.map((model) => [model.modelId, model]));
  assert.equal(byId.get("flux-2/pro/text-to-image")?.owner, "Black Forest Labs");
  assert.deepEqual(byId.get("flux-2/pro/text-to-image")?.modalities, ["image"]);
  assert.equal(byId.get("flux-2/pro/text-to-image")?.pricing?.["fal $/unit"], 0.05);
  assert.equal(byId.get("seedance/v2/pro/image-to-video")?.owner, "ByteDance Seed");
  assert.deepEqual(byId.get("seedance/v2/pro/image-to-video")?.modalities, ["video"]);
  assert.equal(models.find((model) => model.displayName === "Tripo v3")?.owner, "Tripo AI (VAST)");
  assert.deepEqual(models.find((model) => model.displayName === "Tripo v3")?.modalities, ["3d"]);
});

test("Hugging Face parser keeps first-party weights and drops quantized re-uploads", async () => {
  const source = huggingFaceOrg({ id: "official:hf:bfl", org: "black-forest-labs", owner: "bfl" });
  const models = await parseFixture(source, "huggingface.json");
  assert.deepEqual(slugs(models), ["FLUX.2-dev", "FLUX.1-Kontext-dev"]);
  assert.equal(models[0]?.owner, "Black Forest Labs");
  assert.equal(models[0]?.capabilities["openWeights"], true);
  assert.equal(models[0]?.releaseDate, "2026-01-14");
});

test("OpenRouter parser keeps real models and drops abliterated derivatives", async () => {
  const models = await parseFixture(openRouter(), "openrouter.json");
  assert.deepEqual(slugs(models), ["kimi-k2-thinking"]);
  assert.equal(models[0]?.owner, "Moonshot AI");
  assert.deepEqual(models[0]?.modalities, ["text"], "Kimi produces text; images are only an input");
  assert.equal(models[0]?.capabilities["accepts"], "image, text");
  assert.equal(models[0]?.limits["contextTokens"], 262144);
  assert.equal(models[0]?.pricing?.["prompt $/M"], 0.6);
});

test("release feeds report only registered families and carry the published date", async () => {
  const source = officialFeed({
    id: "official:feed:openai-news",
    owner: "openai",
    kind: "official-feed",
    url: "https://openai.com/news/rss.xml",
    intervalMinutes: 20,
  });
  const models = await parseFixture(source, "release-feed.xml");
  const names = models.map((model) => model.displayName);
  assert.ok(names.includes("GPT-5.6"));
  assert.ok(names.includes("GPT Image 2"));
  assert.ok(names.includes("Sora 2 Pro"));
  assert.equal(models.every((model) => model.owner === "OpenAI"), true);
  assert.equal(models[0]?.releaseDate, "2026-07-09");
});

test("documentation pages ignore scripts, styles, and non-model prose", async () => {
  const source = officialPage({
    id: "official:page:anthropic",
    owner: "anthropic",
    kind: "official-page",
    url: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    intervalMinutes: 30,
  });
  const models = await parseFixture(source, "docs-page.html");
  const names = models.map((model) => model.displayName);
  assert.ok(names.includes("Claude Opus 4.6"));
  assert.ok(names.includes("Claude Sonnet 5"));
  assert.ok(names.includes("Claude Haiku 4.5"));
  assert.ok(!names.some((name) => name.includes("Gemini")), "script contents are not parsed");
  assert.ok(!names.some((name) => name.includes("Reasoning")), "column headers are not model names");
  assert.equal(models.every((model) => model.owner === "Anthropic"), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { FAMILIES, VENDORS, extractMentions, isDerivative, outputModalities, parseSlug, resolve } from "../src/catalog/index.ts";

test("routing namespaces are stripped without losing the publisher's slug", () => {
  const cases: Array<[string, string, string | undefined]> = [
    ["us.anthropic.claude-opus-4-6-v1:0", "claude-opus-4-6", "us/anthropic"],
    ["publishers/google/models/veo-3.1-fast-generate-001", "veo-3.1-fast-generate-001", "publishers/google/models"],
    ["accounts/fireworks/models/deepseek-v3p1", "deepseek-v3p1", "accounts/fireworks/models"],
    ["@cf/meta/llama-4-scout-17b-16e-instruct", "llama-4-scout-17b-16e-instruct", "cf/meta"],
    ["fal-ai/flux/dev", "flux/dev", "fal-ai"],
    ["openai/consistency-decoder", "consistency-decoder", "openai"],
    ["gpt-5.2-pro", "gpt-5.2-pro", undefined],
  ];
  for (const [input, canonical, namespace] of cases) {
    const parts = parseSlug(input);
    assert.equal(parts.canonical, canonical, `canonical for ${input}`);
    assert.equal(parts.namespace, namespace, `namespace for ${input}`);
  }
});

test("versions, tiers, sizes, and experts are separated rather than fused", () => {
  const qwen = parseSlug("Qwen/Qwen3-235B-A22B-Instruct-2507");
  assert.equal(qwen.base, "qwen");
  assert.equal(qwen.version, "3");
  assert.equal(qwen.size, "235B");
  assert.equal(qwen.activeParams, "22B active");

  const llama = parseSlug("llama-4-scout-17b-16e-instruct");
  assert.equal(llama.version, "4");
  assert.equal(llama.tier, "scout");
  assert.equal(llama.size, "17B");
  assert.equal(llama.experts, "16 experts");

  const claude = parseSlug("claude-opus-4-6");
  assert.equal(claude.version, "4.6");
  assert.equal(claude.tier, "opus");
});

test("release channel and identifier class are read structurally", () => {
  assert.equal(parseSlug("gemini-3.6-flash-preview").channel, "preview");
  assert.equal(parseSlug("gemini-2.0-flash-exp").channel, "experimental");
  assert.equal(parseSlug("claude-sonnet-4-5-20250929").slugClass, "snapshot");
  assert.equal(parseSlug("gpt-4o-latest").slugClass, "alias");
  assert.equal(parseSlug("stable-diffusion-3.5-large-turbo").slugClass, "model");
  assert.equal(parseSlug("Meta-Llama-3.1-8B-Instruct-GGUF").slugClass, "quantization");
  assert.equal(parseSlug("Behemoth-123B-abliterated").slugClass, "derivative");
});

test("a canonical slug is stable when parsed again", () => {
  // Observations store the canonical form, and every later run re-parses it.
  // Any erosion here would silently rename a tracked model.
  for (const input of [
    "fal-ai/flux-2/flash",
    "fal-ai/flux/dev",
    "fal-ai/flux-2/klein/4b",
    "fal-ai/minimax/hailuo-02/standard/image-to-video",
    "google/nano-banana-lite/edit",
    "openai/consistency-decoder",
    "us.anthropic.claude-opus-4-6-v1:0",
    "bartowski/Llama-3.3-70B-Instruct-GGUF",
  ]) {
    const once = parseSlug(input).canonical;
    assert.equal(parseSlug(once).canonical, once, `${input} is stable`);
    assert.equal(parseSlug(parseSlug(once).canonical).canonical, once, `${input} stays stable`);
  }
  assert.equal(parseSlug("fal-ai/flux-2/flash").canonical, "flux-2/flash");
  assert.equal(parseSlug("fal-ai/flux/dev").canonical, "flux/dev");
  assert.equal(parseSlug("openai/consistency-decoder").canonical, "consistency-decoder");
});

test("a modality is what a model produces, never what it accepts", () => {
  assert.deepEqual(outputModalities(["image-to-video"]), ["video"]);
  assert.deepEqual(outputModalities(["image-text-to-text"]), ["text"]);
  assert.deepEqual(outputModalities(["text-to-3d"]), ["3d"]);
  assert.deepEqual(outputModalities(["text", "image"]), ["image", "text"]);
});

test("quantizations and community re-uploads are never releases", () => {
  assert.equal(isDerivative(parseSlug("black-forest-labs/FLUX.2-dev-NVFP4")), true);
  assert.equal(isDerivative(parseSlug("bartowski/Qwen3-32B-GGUF")), true);
  assert.equal(isDerivative(parseSlug("black-forest-labs/FLUX.2-dev")), false);
});

test("attribution prefers the publisher over the hosting platform", () => {
  const onFal = resolve({ slug: "fal-ai/flux/dev" });
  assert.equal(onFal.vendor?.id, "bfl");
  assert.equal(onFal.familyId, "flux");
  assert.equal(onFal.attributionVerified, true);

  const onOpenRouter = resolve({ slug: "moonshotai/kimi-k2-thinking" });
  assert.equal(onOpenRouter.vendor?.id, "moonshot");

  const unknown = resolve({ slug: "lucidquery-agi-01-frontier" });
  assert.equal(unknown.vendor, undefined);
  assert.equal(unknown.attributionVerified, false);
});

test("a known publisher wins over a same-named family from another publisher", () => {
  assert.equal(resolve({ slug: "suno/chirp-v4" }).vendor?.id, "suno");
  assert.equal(resolve({ slug: "chirp-3-hd" }).vendor?.id, "google");
});

test("the more specific family claims a slug", () => {
  assert.equal(resolve({ slug: "gpt-image-1" }).familyId, "gpt-image");
  assert.equal(resolve({ slug: "gpt-5.2-pro" }).familyId, "gpt");
  assert.equal(resolve({ slug: "seed-tts-2" }).familyId, "seed-tts");
  assert.equal(resolve({ slug: "hunyuan-video-1.5" }).familyId, "hunyuan-video");
});

test("prose mentions require a version or tier and accept any separator", () => {
  const found = extractMentions(
    "We shipped GPT Image 2 and gpt-image-1-mini, plus Nano Banana 2 Pro, HunyuanVideo 1.5, and Kling 2.5 Turbo. Claude alone is not a release.",
  );
  const names = found.map((mention) => mention.name);
  assert.ok(names.includes("GPT Image 2"));
  assert.ok(names.includes("Nano Banana 2 Pro"));
  assert.ok(names.includes("HunyuanVideo 1.5"));
  assert.ok(!names.includes("Claude"), "a bare brand word must not be reported");
  assert.equal(found.find((mention) => mention.name === "GPT Image 2")?.vendorId, "openai");
});

test("prose matching does not glue table headers onto model names", () => {
  const found = extractMentions("GPT-5.6 Reasoning Deep Research");
  assert.deepEqual(found.map((mention) => mention.name), ["GPT-5.6"]);
});

test("the registry is internally consistent", () => {
  const vendorIds = new Set(VENDORS.map((vendor) => vendor.id));
  assert.equal(vendorIds.size, VENDORS.length, "vendor ids are unique");
  const familyIds = new Set(FAMILIES.map((family) => family.id));
  assert.equal(familyIds.size, FAMILIES.length, "family ids are unique");
  for (const family of FAMILIES) {
    assert.ok(vendorIds.has(family.vendorId), `${family.id} points at a registered vendor`);
    assert.ok(family.modalities.length > 0, `${family.id} declares at least one modality`);
  }
  assert.ok(VENDORS.length >= 100, "every major AI publisher is registered");
  assert.ok(FAMILIES.length >= 150, "every major model family is registered");
});

test("every generative modality has at least one registered family", () => {
  const covered = new Set(FAMILIES.flatMap((family) => family.modalities));
  for (const modality of ["text", "code", "image", "video", "audio", "speech", "music", "3d", "world", "embedding", "rerank", "moderation"]) {
    assert.ok(covered.has(modality as never), `${modality} is covered by the taxonomy`);
  }
});

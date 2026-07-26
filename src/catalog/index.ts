import type { Modality, Resolution, SlugParts } from "../types.ts";
import { FAMILIES, FAMILY_BY_ID, type Family, familiesForVendor, familyFromSlug, mentionPatterns } from "./families.ts";
import { parseSlug } from "./slug.ts";
import { VENDOR_BY_ID, type Vendor, vendorFromToken } from "./vendors.ts";

export { FAMILIES, FAMILY_BY_ID, familiesForVendor, familyFromSlug } from "./families.ts";
export type { Family } from "./families.ts";
export { channelLabel, compareVersions, isDerivative, parseSlug, stripNamespace } from "./slug.ts";
export { HUGGINGFACE_ORGS, VENDORS, VENDOR_BY_ID, vendorFromHuggingFaceOrg, vendorFromToken } from "./vendors.ts";
export type { Vendor } from "./vendors.ts";

export interface ResolveInput {
  /** Identifier exactly as the source published it. */
  slug: string;
  /** Marketing name when the source publishes one. */
  displayName?: string;
  /** Vendor id asserted by a first-party source. Highest priority. */
  assertedVendorId?: string;
  /** Modalities the source itself declared. */
  declaredModalities?: string[];
}

const MODALITY_SET = new Set<Modality>([
  "text", "code", "image", "video", "audio", "speech", "music",
  "3d", "world", "embedding", "rerank", "moderation",
]);

const MODALITY_ALIASES: Record<string, Modality> = {
  "text-generation": "text",
  "text2text-generation": "text",
  "chat": "text",
  "completion": "text",
  "responses": "text",
  "language": "text",
  "coding": "code",
  "code-generation": "code",
  "pdf": "text",
  "file": "text",
  "image-text-to-text": "image",
  "text-to-image": "image",
  "image-to-image": "image",
  "image-edit": "image",
  "image_generation": "image",
  "img": "image",
  "vision": "image",
  "text-to-video": "video",
  "image-to-video": "video",
  "video-to-video": "video",
  "video_generation": "video",
  "text-to-audio": "audio",
  "audio-to-audio": "audio",
  "audio-text-to-text": "audio",
  "text-to-speech": "speech",
  "audio_speech": "speech",
  "automatic-speech-recognition": "speech",
  "audio_transcription": "speech",
  "speech-to-text": "speech",
  "tts": "speech",
  "stt": "speech",
  "voice": "speech",
  "text-to-music": "music",
  "music-generation": "music",
  "text-to-3d": "3d",
  "image-to-3d": "3d",
  "3d-generation": "3d",
  "world-model": "world",
  "feature-extraction": "embedding",
  "sentence-similarity": "embedding",
  "embeddings": "embedding",
  "reranking": "rerank",
  "text-ranking": "rerank",
  "ocr": "text",
};

/** Maps any source-declared modality vocabulary onto the watcher's own set. */
export function canonicalModality(value: string): Modality | undefined {
  const key = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (MODALITY_SET.has(key as Modality)) return key as Modality;
  return MODALITY_ALIASES[key];
}

export function canonicalModalities(values: readonly string[] = []): Modality[] {
  return [...new Set(values.map(canonicalModality).filter((value): value is Modality => Boolean(value)))].sort();
}

/**
 * What a model *produces*, which is the only thing the watcher calls a
 * modality. A pipeline tag names its inputs before its output, so
 * `image-to-video` is a video model and `image-text-to-text` is a text model.
 * Claiming "video" for a model that merely accepts video would be wrong.
 */
export function outputModality(tag: string): Modality | undefined {
  const key = tag.trim().toLowerCase().replace(/\s+/g, "-");
  const arrow = key.lastIndexOf("-to-");
  if (arrow >= 0) return canonicalModality(key.slice(arrow + 4));
  return canonicalModality(key);
}

export function outputModalities(values: readonly string[] = []): Modality[] {
  return [...new Set(values.map(outputModality).filter((value): value is Modality => Boolean(value)))].sort();
}

function vendorFromFamily(family: Family | undefined): Vendor | undefined {
  return family ? VENDOR_BY_ID.get(family.vendorId) : undefined;
}

function familyFromDisplayName(name: string | undefined): Family | undefined {
  if (!name) return undefined;
  for (const family of mentionPatterns()) {
    if (family.mentionOnce.test(name)) return family;
  }
  return undefined;
}

/**
 * Turns a raw sighting into a definitive statement: who published it, which
 * family it belongs to, what it can do, and what kind of identifier it is.
 * Attribution is only marked verified when it came from a first-party
 * assertion, a vendor-owned namespace, or a registered family grammar.
 */
/** A family belonging to `vendorId` that this slug actually contains. */
function familyOfVendorIn(vendorId: string, canonical: string, base: string): Family | undefined {
  return familiesForVendor(vendorId).find(
    (family) => family.slug.test(canonical) || family.slug.test(base) || family.slugAnywhere.test(canonical),
  );
}

/**
 * Turns a raw sighting into a definitive statement: who published it, which
 * family it belongs to, what it can do, and what kind of identifier it is.
 *
 * Attribution order, strongest first:
 *   1. A first-party source that asserts its own vendor.
 *   2. A namespace vendor that also owns a family present in the slug —
 *      `nvidia/llama-3.3-nemotron-super` is NVIDIA's Nemotron, `suno/chirp-v4`
 *      is Suno's Chirp.
 *   3. The family the slug head belongs to — `databricks-claude-opus-4-6` and
 *      `bedrock/claude-opus-4-6` are still Anthropic's model, merely resold.
 *   4. A namespace vendor with no matching family, as a last resort.
 *
 * Hosting platforms are never treated as publishers at any step.
 */
export function resolve(input: ResolveInput): Resolution {
  const parts = parseSlug(input.slug);
  const canonical = parts.canonical.toLowerCase();
  const namespaceVendor = (parts.namespace?.split("/") ?? [])
    .map(vendorFromToken)
    .filter((vendor): vendor is Vendor => vendor !== undefined && vendor.tier !== "platform")
    .at(-1);
  const asserted = input.assertedVendorId ? VENDOR_BY_ID.get(input.assertedVendorId) : undefined;

  const headFamily = familyFromSlug(parts.canonical) ?? familyFromSlug(parts.base) ?? familyFromDisplayName(input.displayName);
  const assertedFamily = asserted ? familyOfVendorIn(asserted.id, canonical, parts.base) : undefined;
  const namespaceFamily = namespaceVendor ? familyOfVendorIn(namespaceVendor.id, canonical, parts.base) : undefined;

  const vendor = asserted ?? (namespaceFamily ? namespaceVendor : undefined) ?? vendorFromFamily(headFamily) ?? namespaceVendor;
  const family = (asserted ? (assertedFamily ?? headFamily) : (namespaceFamily ?? headFamily));

  const declared = canonicalModalities(input.declaredModalities ?? []);
  const modalities = declared.length ? declared : (family?.modalities ?? []);

  return {
    ...(vendor ? { vendor: { id: vendor.id, name: vendor.name, country: vendor.country, homepage: vendor.homepage } } : {}),
    ...(family ? { familyId: family.id, familyName: family.name } : {}),
    modalities,
    parts,
    attributionVerified: Boolean(vendor),
  };
}

export interface Mention {
  name: string;
  familyId: string;
  vendorId: string;
  modalities: Modality[];
}

/**
 * Reads complete model names out of prose (release notes, docs, feeds).
 * Only registered family grammars can match, so an arbitrary capitalised
 * phrase can never be reported as a model.
 */
export function extractMentions(text: string, vendorId?: string, limit = 400): Mention[] {
  const found = new Map<string, Mention>();
  for (const family of mentionPatterns(vendorId)) {
    // `matchAll` iterates over a clone, so the shared global regex is safe here.
    for (const match of text.matchAll(family.mention)) {
      const name = (match.groups?.["model"] ?? match[0] ?? "").replace(/\s+/g, " ").trim().replace(/[-_.]+$/, "");
      if (name.length < 3 || name.length > 80) continue;
      // A tier word alone names a position in a line-up, not a model: "Imagen
      // Pro" is the shape of a product page, whereas an actual release always
      // carries a number. Families whose complete name has no number at all
      // are the documented exception.
      if (!family.bare && !/\d/.test(name)) continue;
      // Keyed by name alone: families are visited most-specific first, so the
      // narrower family claims a name the broader one would also match.
      const key = name.toLowerCase();
      if (found.has(key)) continue;
      found.set(key, { name, familyId: family.id, vendorId: family.vendorId, modalities: family.modalities });
      if (found.size >= limit) return [...found.values()];
    }
  }
  return [...found.values()];
}

/** Stable, human-facing identity line used by every renderer. */
export function identityLine(parts: SlugParts, vendorName: string | undefined, familyName: string | undefined): string {
  const bits = [vendorName ?? "Unattributed publisher", familyName ?? parts.base];
  if (parts.version) bits.push(`v${parts.version.replace(/^v/i, "")}`);
  if (parts.tier) bits.push(parts.tier);
  return bits.join(" · ");
}

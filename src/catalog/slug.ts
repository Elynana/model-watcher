import type { ReleaseChannel, SlugClass, SlugParts } from "../types.ts";
import { QUALIFIER_TOKENS, TIER_TOKENS, familyFromSlug } from "./families.ts";
import { vendorFromToken } from "./vendors.ts";

const TIER_SET = new Set<string>(TIER_TOKENS);
const QUALIFIER_SET = new Set<string>(QUALIFIER_TOKENS);

/** Cloud, region, and routing path segments that never belong to a publisher. */
const ROUTING_SEGMENTS = new Set([
  "us", "use1", "usw2", "eu", "eu1", "euw1", "apac", "apne1", "global", "cn", "jp", "au", "ca",
  "sa", "il", "me", "models", "model", "publishers", "accounts", "deployments", "projects",
  "locations", "chat", "completions", "v1", "v2", "v1beta", "beta", "cf", "workers-ai",
  "inference", "serving", "api", "openai", "foundation-model", "imported-model",
]);

/** Quantization markers. A quantized re-upload is never a model release. */
const QUANTIZATION = /(?:^|[-_.])(gguf|awq|gptq|exl2|exl3|mlx|bnb|nf4|w4a8|w4a16|w8a8|w8a16|int2|int3|int4|int8|nvfp4|mxfp4|fp4|fp6|fp8|hqq|q[2-8]_[a-z0-9_]+|[248]bit|imatrix|autoround|smashed|quantized|quanted)(?=$|[-_.])/i;

/** Community re-publishing markers. Also never a model release. */
const DERIVATIVE = /(?:^|[-_.])(abliterated|uncensored|unslop|unaligned|decensored|roleplay|erp|nsfw|merged?|slerp|dare|ties|passthrough|frankenmerge|lora|qlora|adapter|peft|finetuned?|sft|dpo|orpo|kto|grpo|pruned|unsloth|bartowski|mradermacher|neuralmagic)(?=$|[-_.])/i;

const SNAPSHOT = /[-@_](?<date>20\d{2}-?\d{2}-?\d{2})(?=$|[-_@.])/;
const PREVIEW = /(?:^|[-_. ])(preview|early-access)(?=$|[-_. ])/i;
const EXPERIMENTAL = /(?:^|[-_. ])(experimental|exp|alpha|beta|rc\d?|nightly)(?=$|[-_. ])/i;
const DEPRECATED = /(?:^|[-_. ])(deprecated|legacy|retired|sunset)(?=$|[-_. ])/i;
const ALIAS_TOKENS = new Set(["latest", "current", "default"]);

/** `7b`, `1.5b`, `480m`, `32k` — a parameter or window size, never a version. */
const SIZE_TOKEN = /^(\d+(?:\.\d+)?)([bmk])$/i;
/** `a22b` — active parameters in a mixture-of-experts slug. */
const ACTIVE_TOKEN = /^a(\d+(?:\.\d+)?)b$/i;
/** `16e`, `128e` — expert counts. */
const EXPERT_TOKEN = /^(\d+)e$/i;
/** `k2`, `q2`, `r1`, `t1` — lettered variant markers that carry model identity. */
const VARIANT_TOKEN = /^([a-z])(\d+(?:\.\d+)?)$/i;
/** `v3p1` — Fireworks-style dotted version. */
const DOTTED_TOKEN = /^v?(\d+)p(\d+)$/i;

/**
 * Removes provider routing so that `us.anthropic.claude-opus-4-6-v1:0`,
 * `accounts/fireworks/models/deepseek-v3p1`, `@cf/meta/llama-4-scout`, and
 * `publishers/google/models/veo-3.1-generate-001` all reduce to the
 * publisher's own identifier, while `fal-ai/flux/dev` keeps its sub-route.
 */
export function stripNamespace(raw: string): { namespace?: string; rest: string } {
  let value = raw.trim().replace(/^@/, "");
  const namespace: string[] = [];

  // Vendor-qualified dotted prefixes: `us.anthropic.claude-…`, `amazon.nova-…`.
  for (let guard = 0; guard < 4; guard++) {
    const dotted = /^([a-z][a-z0-9-]*)\.(?=[a-z])/i.exec(value);
    if (!dotted?.[1]) break;
    const token = dotted[1].toLowerCase();
    if (!ROUTING_SEGMENTS.has(token) && !vendorFromToken(token)) break;
    namespace.push(dotted[1]);
    value = value.slice(dotted[0].length);
  }

  // Colon-qualified prefixes: `openai:gpt-5.2`.
  const colon = /^([a-z][a-z0-9-]*):(?=[a-z])/i.exec(value);
  if (colon?.[1]) {
    namespace.push(colon[1]);
    value = value.slice(colon[0].length);
  }

  let segments = value.split("/").filter(Boolean);

  // 1. Drop leading routing and vendor segments. A vendor segment is only
  //    dropped when something that is not purely a route modifier remains, so
  //    re-parsing an already-canonical `flux/dev` cannot erode it to `dev`.
  while (segments.length > 1) {
    const head = segments[0]!.toLowerCase();
    const tail = segments.slice(1);
    const isRouting = ROUTING_SEGMENTS.has(head);
    const isVendor = Boolean(vendorFromToken(head)) && tail.some((segment) => !isRouteSegment(segment));
    if (!isRouting && !isVendor) break;
    namespace.push(segments[0]!);
    segments = tail;
  }

  // 2. An unrecognised leading segment is a publishing organization when what
  //    follows is itself a registered family: `bartowski/Llama-3.3-70B`.
  if (segments.length > 1 && familyFromSlug(segments.slice(1).join("/"))) {
    namespace.push(segments[0]!);
    segments = segments.slice(1);
  }

  // 3. Trailing route modifiers (`/dev`, `/edit`, `/image-to-video`, `/4b`)
  //    belong to the endpoint, so keep them attached to the model they modify.
  let last = segments.length - 1;
  while (last > 0 && isRouteSegment(segments[last]!)) last--;
  segments = segments.slice(0, last + 1).concat(segments.slice(last + 1));

  const joined = segments.join("/");
  const reseller = stripResellerPrefix(joined);
  if (reseller.prefix) namespace.push(reseller.prefix);

  return {
    ...(namespace.length ? { namespace: namespace.join("/") } : {}),
    rest: reseller.rest || joined || value || raw,
  };
}

/**
 * A path segment that modifies a model rather than naming one: a size or tier
 * word, a documented qualifier, a task route such as `image-to-video`, or a
 * bare version like `v1.1`.
 */
function isRouteSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  if (familyFromSlug(lower)) return false;
  if (/-to-/.test(lower)) return true;
  if (/^v?\d/.test(lower)) return true;
  return lower.split(/[-_.]/).every((token) => TIER_SET.has(token) || QUALIFIER_SET.has(token) || ROUTE_TOKENS.has(token));
}

/** Endpoint route words that are neither tiers nor documented qualifiers. */
const ROUTE_TOKENS = new Set([
  "multi", "fill", "canny", "depth", "redux", "reference", "elements", "remix",
  "variations", "api", "sync", "async", "stream", "single", "batch", "generate",
]);

/**
 * Resellers republish a model under their own prefix: `databricks-claude-opus-4-6`
 * and `anthropic-claude-opus-4-6` are both Anthropic's `claude-opus-4-6`. The
 * prefix is only removed when what remains is itself a registered family, so
 * `claude-fable-5` and `flux-2-pro` keep their heads intact.
 */
function stripResellerPrefix(value: string): { prefix?: string; rest: string } {
  const segments = value.split("-");
  for (let take = Math.min(3, segments.length - 1); take >= 1; take--) {
    const prefix = segments.slice(0, take).join("-");
    const remainder = segments.slice(take).join("-");
    if (!remainder || !vendorFromToken(prefix) || !familyFromSlug(remainder)) continue;
    return { prefix, rest: remainder };
  }
  return { rest: value };
}

function normalizeDate(value: string): string {
  const digits = value.replace(/-/g, "");
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** Splits an identifier into comparable tokens without fusing sizes into versions. */
function tokenize(value: string): string[] {
  const parts = value.split(/[-_./@\s]+/).filter(Boolean);
  const head = parts[0];
  if (head && /^[a-z]{2,}\d/i.test(head)) {
    // `qwen3`, `gpt4o`, `o4`, `llama3` — separate the family head from its version.
    const split = /^([a-z]+)(.*)$/i.exec(head);
    if (split?.[1] && split[2]) return [split[1], split[2], ...parts.slice(1)];
  }
  return parts;
}

function versionTuple(version: string | undefined): number[] {
  if (!version) return [];
  return version
    .replace(/^v/i, "")
    .split(/[.\-_]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

/**
 * Decomposes any published identifier into definitive parts. Fields that
 * cannot be read from the string are left undefined rather than guessed.
 */
export function parseSlug(raw: string): SlugParts {
  const trimmed = raw.trim();
  const { namespace, rest } = stripNamespace(trimmed);
  // Bedrock publishes `…-v1:0`, where `-v1:0` is an API revision rather than a
  // model version. Only strip the `-v1` when the `:0` revision marker is there.
  const revision = /:\d+$/.test(rest);
  const canonical = revision ? rest.replace(/:\d+$/, "").replace(/-v\d+$/i, "") : rest;
  const lower = canonical.toLowerCase();

  const snapshotMatch = SNAPSHOT.exec(lower);
  const snapshot = snapshotMatch?.groups?.["date"] ? normalizeDate(snapshotMatch.groups["date"]) : undefined;
  const quantization = QUANTIZATION.exec(lower)?.[1]?.toLowerCase();

  const withoutSnapshot = snapshotMatch ? lower.replace(snapshotMatch[0], "") : lower;
  const tokens = tokenize(withoutSnapshot);

  const tiers: string[] = [];
  const qualifiers: string[] = [];
  const baseTokens: string[] = [];
  let version: string | undefined;
  let size: string | undefined;
  let activeParams: string | undefined;
  let experts: string | undefined;
  let isAlias = false;
  let sawDiscriminator = false;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const dotted = DOTTED_TOKEN.exec(token);
    if (dotted?.[1] && dotted[2]) {
      version ??= `${dotted[1]}.${dotted[2]}`;
      sawDiscriminator = true;
      continue;
    }
    if (/^v?\d+$/.test(token)) {
      const run = [token.replace(/^v/i, "")];
      // Join a run of short numeric tokens: `4` `6` -> `4.6`.
      while (index + 1 < tokens.length && /^\d{1,3}$/.test(tokens[index + 1]!) && run.join("").length < 6) {
        run.push(tokens[++index]!);
      }
      version ??= run.join(".");
      sawDiscriminator = true;
      continue;
    }
    const active = ACTIVE_TOKEN.exec(token);
    if (active?.[1]) {
      activeParams = `${active[1]}B active`;
      sawDiscriminator = true;
      continue;
    }
    const sized = SIZE_TOKEN.exec(token);
    if (sized?.[1] && sized[2]) {
      size = `${sized[1]}${sized[2].toUpperCase()}`;
      sawDiscriminator = true;
      continue;
    }
    const expert = EXPERT_TOKEN.exec(token);
    if (expert?.[1]) {
      experts = `${expert[1]} experts`;
      sawDiscriminator = true;
      continue;
    }
    if (TIER_SET.has(token)) {
      tiers.push(token);
      sawDiscriminator = true;
      continue;
    }
    if (ALIAS_TOKENS.has(token)) {
      isAlias = true;
      qualifiers.push(token);
      sawDiscriminator = true;
      continue;
    }
    if (QUALIFIER_SET.has(token) || token === quantization) {
      qualifiers.push(token);
      sawDiscriminator = true;
      continue;
    }
    const variant = VARIANT_TOKEN.exec(token);
    if (variant?.[1] && variant[2]) {
      // `o4`, `j2` at the head are family + version; `k2`, `q2` later are tiers.
      if (baseTokens.length === 0 && index === 0) {
        baseTokens.push(variant[1]);
        version ??= variant[2];
      } else {
        tiers.push(token);
        version ??= variant[2];
      }
      sawDiscriminator = true;
      continue;
    }
    if (!sawDiscriminator) baseTokens.push(token);
    else qualifiers.push(token);
  }

  const base = (baseTokens.join("-") || lower.split(/[-_./]/)[0] || lower).replace(/-+$/, "");
  const channel: ReleaseChannel = DEPRECATED.test(lower)
    ? "deprecated"
    : EXPERIMENTAL.test(lower)
      ? "experimental"
      : PREVIEW.test(lower)
        ? "preview"
        : isAlias
          ? "alias"
          : snapshot
            ? "snapshot"
            : "ga";
  const slugClass: SlugClass = quantization
    ? "quantization"
    : DERIVATIVE.test(lower)
      ? "derivative"
      : isAlias
        ? "alias"
        : snapshot
          ? "snapshot"
          : "model";

  return {
    canonical,
    raw: trimmed,
    ...(namespace ? { namespace } : {}),
    base,
    ...(version ? { version } : {}),
    versionParts: versionTuple(version),
    ...(tiers[0] ? { tier: tiers[0] } : {}),
    qualifiers: [...new Set([...tiers.slice(1), ...qualifiers])],
    ...(snapshot ? { snapshot } : {}),
    ...(quantization ? { quantization } : {}),
    ...(size ? { size } : {}),
    ...(activeParams ? { activeParams } : {}),
    ...(experts ? { experts } : {}),
    channel,
    slugClass,
  };
}

/** Orders two parsed slugs newest-first by version, then by snapshot date. */
export function compareVersions(a: SlugParts, b: SlugParts): number {
  const length = Math.max(a.versionParts.length, b.versionParts.length);
  for (let index = 0; index < length; index++) {
    const difference = (b.versionParts[index] ?? 0) - (a.versionParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return (b.snapshot ?? "").localeCompare(a.snapshot ?? "");
}

/** True when the slug is a re-publish or quantization, not a release. */
export function isDerivative(parts: SlugParts): boolean {
  return parts.slugClass === "derivative" || parts.slugClass === "quantization";
}

/** Unambiguous release-channel label used in every rendered output. */
export function channelLabel(channel: ReleaseChannel): string {
  return {
    ga: "generally available",
    preview: "preview",
    experimental: "experimental",
    snapshot: "dated snapshot",
    alias: "rolling alias",
    deprecated: "deprecated",
    stealth: "unannounced / stealth",
  }[channel];
}

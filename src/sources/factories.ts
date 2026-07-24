import type { Modality, ModelObservation, SourceAdapter, SourceKind, SourceState } from "../types.ts";
import { observation } from "../engine.ts";
import { canonicalModalities, extractMentions, isDerivative, outputModalities, parseSlug, resolve } from "../catalog/index.ts";
import { env, fetchDocument, parseFeed, stripHtml, toIsoDate } from "../util.ts";

export interface BaseOptions {
  id: string;
  /** Vendor id this source speaks for. Only set it for first-party sources. */
  owner?: string;
  kind: SourceKind;
  url: string;
  intervalMinutes: number;
  tracksRemovals?: boolean;
  covers?: Modality[];
}

function base(options: BaseOptions, parse: SourceAdapter["parse"]): SourceAdapter {
  return {
    ...options,
    tracksRemovals: options.tracksRemovals ?? false,
    enabled: () => true,
    fetch: (cache) => fetchDocument(options.url, cache),
    parse,
  };
}

function json<T>(body: string): T {
  return JSON.parse(body) as T;
}

/**
 * Single place where a raw sighting becomes an observation. Every adapter
 * routes through it, so vendor attribution, modality vocabulary, slug parsing,
 * and derivative suppression behave identically for all 200+ sources.
 */
export function record(options: {
  sourceUrl: string;
  slug: string;
  displayName?: string;
  assertedVendorId?: string;
  /** What the model produces. This is the only thing reported as a modality. */
  modalities?: string[];
  /** What the model accepts. Recorded as a capability, never as a modality. */
  accepts?: string[];
  capabilities?: Record<string, string | number | boolean>;
  limits?: Record<string, string | number>;
  pricing?: Record<string, string | number>;
  availability?: string[];
  releaseDate?: string;
  /** Keep quantizations and community re-uploads out of the catalog. */
  allowDerivatives?: boolean;
}): ModelObservation[] {
  const produces = outputModalities(options.modalities ?? []);
  const resolution = resolve({
    slug: options.slug,
    ...(options.displayName ? { displayName: options.displayName } : {}),
    ...(options.assertedVendorId ? { assertedVendorId: options.assertedVendorId } : {}),
    ...(produces.length ? { declaredModalities: produces } : {}),
  });
  if (!options.allowDerivatives && isDerivative(resolution.parts)) return [];

  const parts = resolution.parts;
  const accepts = canonicalModalities(options.accepts ?? []);
  const capabilities: Record<string, string | number | boolean> = { ...options.capabilities };
  if (accepts.length) capabilities["accepts"] = accepts.join(", ");
  if (parts.size) capabilities["parameters"] = parts.size;
  if (parts.activeParams) capabilities["activeParameters"] = parts.activeParams;
  if (parts.experts) capabilities["experts"] = parts.experts;
  if (parts.tier) capabilities["tier"] = parts.tier;
  if (parts.version) capabilities["version"] = parts.version;

  return [
    observation(options.sourceUrl, resolution.familyId ?? parts.base, parts.canonical, {
      ...(resolution.vendor ? { owner: resolution.vendor.name } : {}),
      displayName: options.displayName?.trim() || parts.canonical,
      modalities: resolution.modalities,
      capabilities,
      limits: options.limits ?? {},
      ...(options.pricing && Object.keys(options.pricing).length ? { pricing: options.pricing } : {}),
      availability: options.availability ?? [],
      lifecycle: parts.channel === "deprecated" ? "deprecated" : parts.channel === "preview" || parts.channel === "experimental" ? "preview" : "available",
      ...(options.releaseDate ? { releaseDate: options.releaseDate } : {}),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Structured multi-vendor catalogs
// ---------------------------------------------------------------------------

interface ModelsDevModel {
  id?: string;
  name?: string;
  family?: string;
  release_date?: string;
  knowledge?: string;
  open_weights?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
  cost?: Record<string, number>;
}

/**
 * models.dev publishes a keyless, versioned catalog spanning ~170 providers.
 * It is the widest first-party-derived source of exact text-model slugs.
 */
export function modelsDevCatalog(): SourceAdapter {
  const url = "https://models.dev/api.json";
  return base(
    { id: "catalog:models-dev", kind: "catalog", url, intervalMinutes: 20, tracksRemovals: false, covers: ["text", "code", "image", "embedding"] },
    (document) => {
      const providers = json<Record<string, { id?: string; name?: string; doc?: string; models?: Record<string, ModelsDevModel> }>>(document.body);
      const results: ModelObservation[] = [];
      for (const [providerId, provider] of Object.entries(providers)) {
        for (const model of Object.values(provider.models ?? {})) {
          if (!model.id) continue;
          const capabilities: Record<string, string | number | boolean> = {};
          if (model.reasoning !== undefined) capabilities["reasoning"] = model.reasoning;
          if (model.tool_call !== undefined) capabilities["toolCalling"] = model.tool_call;
          if (model.structured_output !== undefined) capabilities["structuredOutput"] = model.structured_output;
          if (model.attachment !== undefined) capabilities["attachments"] = model.attachment;
          if (model.open_weights !== undefined) capabilities["openWeights"] = model.open_weights;
          if (model.knowledge) capabilities["knowledgeCutoff"] = model.knowledge;
          const limits: Record<string, string | number> = {};
          if (model.limit?.context) limits["contextTokens"] = model.limit.context;
          if (model.limit?.output) limits["maxOutputTokens"] = model.limit.output;
          const pricing: Record<string, string | number> = {};
          for (const [key, value] of Object.entries(model.cost ?? {})) pricing[`${key} $/M`] = value;
          results.push(...record({
            sourceUrl: provider.doc ?? url,
            slug: model.id,
            ...(model.name ? { displayName: model.name } : {}),
            modalities: model.modalities?.output ?? [],
            accepts: model.modalities?.input ?? [],
            capabilities,
            limits,
            pricing,
            availability: [provider.name ?? providerId],
            ...(model.release_date ? { releaseDate: model.release_date } : {}),
          }));
        }
      }
      return results;
    },
  );
}

interface LiteLlmEntry {
  litellm_provider?: string;
  mode?: string;
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  output_cost_per_second?: number;
  output_cost_per_image?: number;
  supported_modalities?: string[];
  supported_output_modalities?: string[];
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_reasoning?: boolean;
  supports_web_search?: boolean;
  deprecation_date?: string;
  source?: string;
}

const LITELLM_MODES: Record<string, string[]> = {
  chat: ["text"],
  completion: ["text"],
  responses: ["text"],
  image_generation: ["image"],
  image_edit: ["image"],
  video_generation: ["video"],
  audio_speech: ["speech"],
  audio_transcription: ["speech"],
  realtime: ["speech", "text"],
  embedding: ["embedding"],
  rerank: ["rerank"],
  moderation: ["moderation"],
  ocr: ["text"],
};

/**
 * LiteLLM's price/context map is the broadest keyless catalog that covers
 * image, video, speech, embedding, and rerank slugs alongside chat models.
 */
export function liteLlmCatalog(): SourceAdapter {
  const url = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
  return base(
    { id: "catalog:litellm", kind: "catalog", url, intervalMinutes: 30, tracksRemovals: false, covers: ["text", "image", "video", "speech", "embedding", "rerank"] },
    (document) => {
      const entries = json<Record<string, LiteLlmEntry>>(document.body);
      const results: ModelObservation[] = [];
      for (const [slug, entry] of Object.entries(entries)) {
        if (slug === "sample_spec" || !entry.mode) continue;
        // Resolution-prefixed pricing keys such as `1024-x-1024/dall-e-2`
        // describe a tariff, not a distinct model.
        if (/^\d+-x-\d+\//.test(slug) || /\/(?:max|\d+)-steps\//.test(slug)) continue;
        const modalities = entry.supported_output_modalities?.length
          ? entry.supported_output_modalities
          : (LITELLM_MODES[entry.mode] ?? []);
        const capabilities: Record<string, string | number | boolean> = { mode: entry.mode };
        if (entry.supports_vision !== undefined) capabilities["vision"] = entry.supports_vision;
        if (entry.supports_function_calling !== undefined) capabilities["toolCalling"] = entry.supports_function_calling;
        if (entry.supports_reasoning !== undefined) capabilities["reasoning"] = entry.supports_reasoning;
        if (entry.supports_web_search !== undefined) capabilities["webSearch"] = entry.supports_web_search;
        const limits: Record<string, string | number> = {};
        if (entry.max_input_tokens) limits["contextTokens"] = entry.max_input_tokens;
        if (entry.max_output_tokens ?? entry.max_tokens) limits["maxOutputTokens"] = (entry.max_output_tokens ?? entry.max_tokens)!;
        const pricing: Record<string, string | number> = {};
        if (entry.input_cost_per_token) pricing["input $/M"] = Number((entry.input_cost_per_token * 1e6).toFixed(4));
        if (entry.output_cost_per_token) pricing["output $/M"] = Number((entry.output_cost_per_token * 1e6).toFixed(4));
        if (entry.output_cost_per_second) pricing["$/second"] = entry.output_cost_per_second;
        if (entry.output_cost_per_image) pricing["$/image"] = entry.output_cost_per_image;
        results.push(...record({
          sourceUrl: entry.source ?? url,
          slug,
          modalities,
          accepts: entry.supported_modalities ?? [],
          capabilities,
          limits,
          pricing,
          availability: entry.litellm_provider ? [entry.litellm_provider] : [],
        }));
      }
      return results;
    },
  );
}

interface FalModel {
  id?: string;
  title?: string;
  category?: string;
  date?: string;
  shortDescription?: string;
  licenseType?: string;
  pricingInfoOverride?: string;
}

/**
 * fal.ai hosts the widest first-party generative-media surface: image, video,
 * speech, music, and 3D endpoints, each dated and categorised.
 */
export function falCatalog(pages = 6): SourceAdapter {
  const url = "https://fal.ai/api/models?page=1&size=100";
  const adapter = base(
    { id: "platform:fal", kind: "platform", url, intervalMinutes: 20, tracksRemovals: false, covers: ["image", "video", "speech", "music", "audio", "3d"] },
    (document) => {
      const payload = json<{ items?: FalModel[] }>(document.body);
      return (payload.items ?? []).flatMap((model) => {
        if (!model.id) return [];
        const price = /\$([\d.]+)\s*(per [a-z ]+|\/ ?[a-z]+)?/i.exec(model.pricingInfoOverride ?? "");
        return record({
          sourceUrl: `https://fal.ai/models/${model.id}`,
          slug: model.id,
          ...(model.title ? { displayName: model.title } : {}),
          modalities: model.category ? [model.category] : [],
          capabilities: {
            ...(model.category ? { endpoint: model.category } : {}),
            ...(model.licenseType ? { license: model.licenseType } : {}),
          },
          ...(price?.[1] ? { pricing: { "fal $/unit": Number(price[1]) } } : {}),
          availability: ["fal.ai"],
          ...(toIsoDate(model.date) ? { releaseDate: toIsoDate(model.date)! } : {}),
        });
      });
    },
  );
  adapter.fetch = async (cache) => {
    const items: FalModel[] = [];
    let etag: string | undefined;
    for (let page = 1; page <= pages; page++) {
      const document = await fetchDocument(`https://fal.ai/api/models?page=${page}&size=100`, page === 1 ? cache : {});
      if (document.status === 304) return document;
      etag ??= document.etag;
      const payload = json<{ items?: FalModel[]; pages?: number }>(document.body);
      items.push(...(payload.items ?? []));
      if (!payload.items?.length || page >= (payload.pages ?? pages)) break;
    }
    return {
      url,
      status: 200 as const,
      body: JSON.stringify({ items }),
      ...(etag ? { etag } : {}),
      fetchedAt: new Date().toISOString(),
    };
  };
  return adapter;
}

/** OpenRouter's routing catalog: exact slugs, context, and live pricing. */
export function openRouter(): SourceAdapter {
  const url = "https://openrouter.ai/api/v1/models";
  return base(
    { id: "aggregator:openrouter", kind: "aggregator", url, intervalMinutes: 10, tracksRemovals: true, covers: ["text", "code", "image"] },
    (document) => {
      const payload = json<{
        data?: Array<{
          id?: string;
          canonical_slug?: string;
          name?: string;
          created?: number;
          context_length?: number;
          architecture?: { input_modalities?: string[]; output_modalities?: string[] };
          pricing?: Record<string, string>;
          top_provider?: { max_completion_tokens?: number };
        }>;
      }>(document.body);
      return (payload.data ?? []).flatMap((model) => {
        if (!model.id) return [];
        const pricing: Record<string, string | number> = {};
        for (const [key, value] of Object.entries(model.pricing ?? {})) {
          const numeric = Number(value);
          if (Number.isFinite(numeric) && numeric > 0) pricing[`${key} $/M`] = Number((numeric * 1e6).toFixed(4));
        }
        const limits: Record<string, string | number> = {};
        if (model.context_length) limits["contextTokens"] = model.context_length;
        if (model.top_provider?.max_completion_tokens) limits["maxOutputTokens"] = model.top_provider.max_completion_tokens;
        return record({
          sourceUrl: `https://openrouter.ai/${model.id}`,
          slug: model.canonical_slug ?? model.id,
          ...(model.name ? { displayName: model.name } : {}),
          modalities: model.architecture?.output_modalities ?? [],
          accepts: model.architecture?.input_modalities ?? [],
          limits,
          pricing,
          availability: ["OpenRouter"],
          ...(model.created ? { releaseDate: new Date(model.created * 1000).toISOString().slice(0, 10) } : {}),
        });
      });
    },
  );
}

/** Any OpenAI-shaped `/models` listing, keyless or key-gated. */
export function openAiCompatible(options: {
  id: string;
  owner?: string;
  url: string;
  kind?: SourceKind;
  availability: string;
  intervalMinutes?: number;
  apiKeyEnv?: string;
  authHeaders?: (key: string) => Record<string, string>;
  tracksRemovals?: boolean;
  covers?: Modality[];
}): SourceAdapter {
  const adapter = base(
    {
      id: options.id,
      ...(options.owner ? { owner: options.owner } : {}),
      kind: options.kind ?? (options.apiKeyEnv ? "official-api" : "platform"),
      url: options.url,
      intervalMinutes: options.intervalMinutes ?? 15,
      tracksRemovals: options.tracksRemovals ?? Boolean(options.apiKeyEnv),
      ...(options.covers ? { covers: options.covers } : {}),
    },
    (document) => {
      const payload = json<{
        data?: Array<Record<string, unknown>>;
        models?: Array<Record<string, unknown>>;
      }>(document.body);
      const rows = payload.data ?? payload.models ?? [];
      return rows.flatMap((row) => {
        const slug = (row["id"] ?? row["name"] ?? row["model"]) as string | undefined;
        if (typeof slug !== "string" || !slug) return [];
        const created = row["created"] ?? row["created_at"];
        const context = (row["context_length"] ?? row["context_window"] ?? row["max_context_length"]) as number | undefined;
        const limits: Record<string, string | number> = {};
        if (typeof context === "number" && context > 0) limits["contextTokens"] = context;
        return record({
          sourceUrl: options.url,
          slug,
          ...(typeof row["display_name"] === "string" ? { displayName: row["display_name"] } : {}),
          ...(options.owner ? { assertedVendorId: options.owner } : {}),
          limits,
          availability: [options.availability],
          ...(typeof created === "number" ? { releaseDate: new Date(created * 1000).toISOString().slice(0, 10) } : {}),
          ...(typeof created === "string" ? { releaseDate: created.slice(0, 10) } : {}),
        });
      });
    },
  );
  if (options.apiKeyEnv) {
    const keyEnv = options.apiKeyEnv;
    adapter.enabled = () => Boolean(env(keyEnv));
    adapter.fetch = (cache: Pick<SourceState, "etag" | "lastModified">) => {
      const key = env(keyEnv)!;
      const headers = options.authHeaders?.(key) ?? { authorization: `Bearer ${key}` };
      return fetchDocument(options.url, cache, { headers });
    };
  }
  return adapter;
}

/** Hugging Face organization feed: the authoritative open-weights surface. */
export function huggingFaceOrg(options: { id: string; org: string; owner?: string }): SourceAdapter {
  const url = `https://huggingface.co/api/models?author=${encodeURIComponent(options.org)}&sort=createdAt&direction=-1&limit=100&full=false`;
  return base(
    {
      id: options.id,
      ...(options.owner ? { owner: options.owner } : {}),
      kind: "official-repo",
      url,
      intervalMinutes: 45,
      tracksRemovals: false,
    },
    (document) => {
      const rows = json<Array<{ id?: string; pipeline_tag?: string; createdAt?: string; downloads?: number; likes?: number; tags?: string[] }>>(document.body);
      return rows.flatMap((model) => {
        if (!model.id) return [];
        const name = model.id.split("/").at(-1)!;
        const tagModalities = (model.tags ?? []).filter((tag) => outputModalities([tag]).length);
        const capabilities: Record<string, string | number | boolean> = { openWeights: true };
        if (model.likes) capabilities["likes"] = model.likes;
        if (model.downloads) capabilities["downloads30d"] = model.downloads;
        return record({
          sourceUrl: `https://huggingface.co/${model.id}`,
          slug: model.id,
          displayName: name,
          ...(options.owner ? { assertedVendorId: options.owner } : {}),
          modalities: [model.pipeline_tag ?? "", ...tagModalities].filter(Boolean),
          capabilities,
          availability: ["open weights"],
          ...(model.createdAt ? { releaseDate: model.createdAt.slice(0, 10) } : {}),
        });
      });
    },
  );
}

/** Ollama's public library: the local-inference view of open weights. */
export function ollamaLibrary(): SourceAdapter {
  const url = "https://ollama.com/api/tags";
  return base(
    { id: "platform:ollama", kind: "platform", url, intervalMinutes: 60, tracksRemovals: false, covers: ["text", "image", "embedding"] },
    (document) => {
      const payload = json<{ models?: Array<{ name?: string; modified_at?: string; details?: { parameter_size?: string; family?: string } }> }>(document.body);
      return (payload.models ?? []).flatMap((model) => {
        if (!model.name) return [];
        const slug = model.name.split(":")[0]!;
        return record({
          sourceUrl: `https://ollama.com/library/${slug}`,
          slug,
          capabilities: { openWeights: true, ...(model.details?.parameter_size ? { parameters: model.details.parameter_size } : {}) },
          availability: ["Ollama"],
          ...(toIsoDate(model.modified_at) ? { releaseDate: toIsoDate(model.modified_at)! } : {}),
        });
      });
    },
  );
}

/** GitHub Models marketplace catalog. */
export function githubModels(): SourceAdapter {
  const url = "https://models.github.ai/catalog/models";
  return base(
    { id: "platform:github-models", kind: "platform", url, intervalMinutes: 60, tracksRemovals: false, covers: ["text", "image", "embedding"] },
    (document) => {
      const rows = json<Array<{ id?: string; name?: string; publisher?: string; summary?: string; supported_input_modalities?: string[]; supported_output_modalities?: string[]; limits?: { max_input_tokens?: number; max_output_tokens?: number } }>>(document.body);
      return rows.flatMap((model) => {
        if (!model.id) return [];
        const limits: Record<string, string | number> = {};
        if (model.limits?.max_input_tokens) limits["contextTokens"] = model.limits.max_input_tokens;
        if (model.limits?.max_output_tokens) limits["maxOutputTokens"] = model.limits.max_output_tokens;
        return record({
          sourceUrl: `https://github.com/marketplace/models/${model.id}`,
          slug: model.id,
          ...(model.name ? { displayName: model.name } : {}),
          modalities: model.supported_output_modalities ?? [],
          accepts: model.supported_input_modalities ?? [],
          limits,
          availability: ["GitHub Models"],
        });
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Prose sources
// ---------------------------------------------------------------------------

/**
 * Reads model names out of an official page using registered family grammars
 * only. An unregistered capitalised phrase can never become a model.
 */
export function officialPage(options: BaseOptions & { restrictToOwner?: boolean }): SourceAdapter {
  return base(options, (document) => {
    const text = stripHtml(document.body);
    const mentions = extractMentions(text, options.restrictToOwner === false ? undefined : options.owner);
    return mentions.flatMap((mention) =>
      record({
        sourceUrl: document.url,
        slug: mention.name,
        displayName: mention.name,
        assertedVendorId: mention.vendorId,
        modalities: mention.modalities,
        availability: ["documented"],
      }),
    );
  });
}

/** RSS/Atom release notes. Dated evidence, so releases carry a real date. */
export function officialFeed(options: BaseOptions & { restrictToOwner?: boolean }): SourceAdapter {
  return base({ ...options, kind: "official-feed" }, (document) => {
    const results: ModelObservation[] = [];
    for (const item of parseFeed(document.body)) {
      const text = `${item.title}\n${item.summary}`;
      const mentions = extractMentions(text, options.restrictToOwner === false ? undefined : options.owner, 40);
      for (const mention of mentions) {
        results.push(...record({
          sourceUrl: item.link ?? document.url,
          slug: mention.name,
          displayName: mention.name,
          assertedVendorId: mention.vendorId,
          modalities: mention.modalities,
          availability: ["announced"],
          ...(toIsoDate(item.published) ? { releaseDate: toIsoDate(item.published)! } : {}),
        }));
      }
    }
    return results;
  });
}

/**
 * Leaderboards and arenas. These cannot establish ownership, and unmatched
 * codenames are recorded as stealth candidates rather than attributed models.
 */
export function benchmarkPage(options: BaseOptions & { codenames?: RegExp }): SourceAdapter {
  return base({ ...options, kind: "benchmark", tracksRemovals: false }, (document) => {
    const text = stripHtml(document.body);
    const results = extractMentions(text).flatMap((mention) =>
      record({
        sourceUrl: document.url,
        slug: mention.name,
        displayName: mention.name,
        assertedVendorId: mention.vendorId,
        modalities: mention.modalities,
        availability: ["benchmark listing"],
      }),
    );
    if (!options.codenames) return results;
    const seen = new Set(results.map((item) => item.modelId.toLowerCase()));
    for (const match of text.matchAll(options.codenames)) {
      const name = (match.groups?.["model"] ?? match[0] ?? "").trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const parts = parseSlug(name);
      results.push(
        observation(document.url, "stealth", parts.canonical, {
          displayName: name,
          modalities: options.covers ?? [],
          capabilities: { stealth: true },
          limits: {},
          availability: ["arena evaluation only"],
          lifecycle: "preview",
        }),
      );
    }
    return results;
  });
}

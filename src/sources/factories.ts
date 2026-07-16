import type { ModelObservation, SourceAdapter, SourceKind, SourceState } from "../types.ts";
import { observation } from "../engine.ts";
import { env, fetchDocument, stripHtml } from "../util.ts";

export interface ModelPattern {
  family: string;
  expression: RegExp;
  modalities: string[];
  capabilities?: Record<string, string | number | boolean>;
}

interface BaseOptions {
  id: string;
  owner?: string;
  kind: SourceKind;
  url: string;
  intervalMinutes: number;
  tracksRemovals?: boolean;
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

function cloneGlobal(expression: RegExp): RegExp {
  return new RegExp(expression.source, expression.flags.includes("g") ? expression.flags : `${expression.flags}g`);
}

function observationsFromText(url: string, text: string, patterns: ModelPattern[]): ModelObservation[] {
  const found = new Map<string, ModelObservation>();
  for (const pattern of patterns) {
    const expression = cloneGlobal(pattern.expression);
    for (const match of text.matchAll(expression)) {
      const name = (match.groups?.model ?? match[0] ?? "").replace(/\s+/g, " ").trim();
      if (name.length < 3 || name.length > 100) continue;
      const item = observation(url, pattern.family, name, {
        displayName: name,
        modalities: pattern.modalities,
        capabilities: pattern.capabilities ?? {},
        lifecycle: "available",
        availability: ["documented"],
      });
      found.set(`${pattern.family}:${name.toLowerCase()}`, item);
    }
  }
  return [...found.values()].slice(0, 250);
}

export function htmlCatalog(options: BaseOptions & { patterns: ModelPattern[] }): SourceAdapter {
  return base(options, (document) => observationsFromText(document.url, stripHtml(document.body), options.patterns));
}

export function benchmarkPage(options: BaseOptions & { patterns: ModelPattern[] }): SourceAdapter {
  return htmlCatalog({ ...options, kind: "benchmark", patterns: options.patterns, tracksRemovals: false });
}

const PIPELINE_MODALITIES: Record<string, string[]> = {
  "text-generation": ["text"],
  "text2text-generation": ["text"],
  "image-text-to-text": ["text", "image"],
  "text-to-image": ["image"],
  "image-to-image": ["image"],
  "text-to-video": ["video"],
  "image-to-video": ["image", "video"],
  "text-to-audio": ["audio"],
  "audio-to-audio": ["audio"],
  "text-to-3d": ["3d"],
};

function inferModalities(name: string): string[] | undefined {
  const lower = name.toLowerCase();
  if (/(?:seedance|\bwan[-_ ]|hunyuanvideo|ltx[-_ ]?video|cosmos)/.test(lower)) return ["video"];
  if (/(?:flux|stable[-_ ]?diffusion|sdxl|image[-_ ]?(?:gen|edit))/.test(lower)) return ["image"];
  if (/(?:tts|audio|musicgen|magpie)/.test(lower)) return ["audio"];
  if (/(?:mesh|text[-_ ]?to[-_ ]?3d|\b3d\b)/.test(lower)) return ["3d"];
  if (/(?:llama|qwen|mistral|deepseek|gemma|\bphi|glm|kimi|nemotron|command|aya|seed|jamba|minimax|hunyuan)/.test(lower)) return ["text"];
  return undefined;
}

function inferFamily(name: string): string {
  const cleaned = name.split("/").at(-1) ?? name;
  return cleaned.split(/[-_ ]/).filter(Boolean).slice(0, 2).join(" ") || cleaned;
}

export function huggingFaceOrg(options: { id: string; org: string; owner?: string; kind?: SourceKind }): SourceAdapter {
  const url = `https://huggingface.co/api/models?author=${encodeURIComponent(options.org)}&sort=createdAt&direction=-1&limit=100&full=false`;
  return base(
    {
      id: options.id,
      owner: options.owner,
      kind: options.kind ?? "official-repo",
      url,
      intervalMinutes: 60,
      tracksRemovals: false,
    },
    (document) => {
      const data = JSON.parse(document.body) as Array<{ id?: string; pipeline_tag?: string; createdAt?: string }>;
      return data.flatMap((model) => {
        if (!model.id) return [];
        const modalities = PIPELINE_MODALITIES[model.pipeline_tag ?? ""] ?? inferModalities(model.id);
        if (!modalities) return [];
        const name = model.id.split("/").at(-1)!;
        return [
          observation(`https://huggingface.co/${model.id}`, inferFamily(name), name, {
            displayName: name,
            modalities,
            capabilities: model.pipeline_tag ? { pipeline: model.pipeline_tag } : {},
            availability: ["open repository"],
            lifecycle: "available",
            releaseDate: model.createdAt?.slice(0, 10),
          }),
        ];
      });
    },
  );
}

export function openRouter(): SourceAdapter {
  const url = "https://openrouter.ai/api/v1/models";
  return base(
    { id: "aggregator:openrouter", kind: "aggregator", url, intervalMinutes: 10, tracksRemovals: true },
    (document) => {
      const json = JSON.parse(document.body) as {
        data?: Array<{
          id?: string;
          name?: string;
          created?: number;
          context_length?: number;
          architecture?: { input_modalities?: string[]; output_modalities?: string[] };
          pricing?: Record<string, string>;
        }>;
      };
      return (json.data ?? []).flatMap((model) => {
        if (!model.id) return [];
        const slug = model.id.split("/").at(-1)!;
        return [
          observation(`https://openrouter.ai/${model.id}`, inferFamily(slug), slug, {
            displayName: model.name ?? slug,
            modalities: [...new Set([...(model.architecture?.input_modalities ?? []), ...(model.architecture?.output_modalities ?? [])])],
            limits: model.context_length ? { contextTokens: model.context_length } : {},
            pricing: model.pricing,
            availability: ["OpenRouter"],
            lifecycle: "available",
            releaseDate: model.created ? new Date(model.created * 1000).toISOString().slice(0, 10) : undefined,
          }),
        ];
      });
    },
  );
}

export function optionalOpenAiCatalog(options: {
  id: string;
  owner: string;
  url: string;
  apiKeyEnv: string;
  authHeaders?: (key: string) => Record<string, string>;
}): SourceAdapter {
  const adapter = base(
    { id: options.id, owner: options.owner, kind: "official-api", url: options.url, intervalMinutes: 10, tracksRemovals: true },
    (document) => {
      const json = JSON.parse(document.body) as { data?: Array<{ id?: string; name?: string; created?: number }> };
      return (json.data ?? []).flatMap((model) => {
        if (!model.id) return [];
        return [observation(options.url, inferFamily(model.id), model.id, {
          displayName: model.name ?? model.id,
          modalities: [],
          availability: ["official API"],
          lifecycle: "available",
          releaseDate: model.created ? new Date(model.created * 1000).toISOString().slice(0, 10) : undefined,
        })];
      });
    },
  );
  adapter.enabled = () => Boolean(env(options.apiKeyEnv));
  adapter.fetch = (cache: Pick<SourceState, "etag" | "lastModified">) => {
    const key = env(options.apiKeyEnv)!;
    const headers = options.authHeaders?.(key) ?? { authorization: `Bearer ${key}` };
    return fetchDocument(options.url, cache, { headers });
  };
  return adapter;
}

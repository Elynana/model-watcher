import type { ModelObservation, SourceAdapter } from "../types.ts";
import { fetchDocument } from "../util.ts";
import { observation } from "../engine.ts";
import { benchmarkPage, htmlCatalog, huggingFaceOrg, openRouter, optionalOpenAiCatalog, type ModelPattern } from "./factories.ts";

const version = String.raw`\d+(?:\.\d+){0,2}(?:[- ]?(?:pro|lite|turbo|preview|mini|max|ultra|flash|master|standard|omni))?`;
const named = (family: string, modalities: string[], extras = "") => ({
  family,
  modalities,
  expression: new RegExp(String.raw`\b(?<model>${family.replace(/[- ]/g, "[- ]?")}[- ]?(?:${version}${extras}))\b`, "gi"),
});

const COMMON_PATTERNS: ModelPattern[] = [
  named("GPT", ["text"]), named("o", ["text"]), named("Sora", ["video"]), named("gpt-image", ["image"]),
  named("Claude", ["text", "image"]), named("Gemini", ["text", "image"]), named("Veo", ["video"]), named("Imagen", ["image"]),
  named("Grok", ["text"]), named("Llama", ["text"]), named("Phi", ["text"]), named("Mistral", ["text"]),
  named("DeepSeek", ["text"]), named("Kimi", ["text"]), named("GLM", ["text"]), named("Nemotron", ["text"]),
  named("Command", ["text"]), named("Jamba", ["text"]), named("Qwen", ["text"]), named("Wan", ["video"]),
  named("Hunyuan", ["text", "image", "video", "3d"]), named("FLUX", ["image"]), named("Stable Diffusion", ["image"]),
  named("Runway Gen", ["video"]), named("Ray", ["video"]), named("Pika", ["video"]), named("PixVerse", ["video"]),
  named("Ideogram", ["image"]), named("Recraft", ["image"]), named("Midjourney", ["image"]), named("Firefly", ["image"]),
  named("Suno", ["audio"]), named("Udio", ["audio"]), named("Eleven", ["audio"]), named("Stable Audio", ["audio"]),
  named("Meshy", ["3d"]), named("Tripo", ["3d"]), named("Cosmos", ["world-model"]),
];

const page = (
  id: string,
  owner: string,
  url: string,
  patterns: ModelPattern[] = COMMON_PATTERNS,
  tracksRemovals = false,
): SourceAdapter => htmlCatalog({ id, owner, kind: "official-page", url, intervalMinutes: 30, tracksRemovals, patterns });

const frontierPages: SourceAdapter[] = [
  page("official:openai-models", "OpenAI", "https://platform.openai.com/docs/models", COMMON_PATTERNS, true),
  page("official:anthropic-models", "Anthropic", "https://docs.anthropic.com/en/docs/about-claude/models/overview", COMMON_PATTERNS, true),
  page("official:google-models", "Google", "https://ai.google.dev/gemini-api/docs/models", COMMON_PATTERNS, true),
  page("official:meta-llama", "Meta", "https://www.llama.com/", COMMON_PATTERNS, true),
  page("official:microsoft-models", "Microsoft", "https://azure.microsoft.com/en-us/products/phi"),
  page("official:mistral-models", "Mistral AI", "https://docs.mistral.ai/getting-started/models/models_overview/", COMMON_PATTERNS, true),
  page("official:deepseek-models", "DeepSeek", "https://api-docs.deepseek.com/quick_start/pricing", COMMON_PATTERNS, true),
  page("official:cohere-models", "Cohere", "https://docs.cohere.com/docs/models", COMMON_PATTERNS, true),
  page("official:ai21-models", "AI21 Labs", "https://docs.ai21.com/docs/jamba-foundation-models", COMMON_PATTERNS, true),
  page("official:bytedance-seed", "ByteDance Seed", "https://seed.bytedance.com/en/models", [
    named("Seedance", ["video", "audio"]), named("Seedream", ["image"]), named("SeedEdit", ["image"]),
    named("Seed3D", ["3d"]), named("Seed", ["text", "multimodal"]),
    { family: "Seed-Music", modalities: ["audio"], expression: /\b(?<model>Seed-Music(?:\s+[A-Za-z0-9.-]+){0,2})\b/gi },
  ], true),
  page("official:vidu-model-map", "ShengShu", "https://platform.vidu.com/docs/model-map", [
    { family: "Vidu", modalities: ["video", "audio"], expression: /\b(?<model>Vidu(?:Q|S)?\s?\d+(?:\.\d+)?(?:[- ](?:pro|mix|drama|ad|turbo))?)\b/gi },
  ], true),
  page("official:kuaishou-kling", "Kuaishou", "https://ir.kuaishou.com/", [
    { family: "Kling", modalities: ["video", "audio", "image"], expression: /\b(?<model>Kling(?: AI)?\s?\d+(?:\.\d+)?(?:\s+(?:Omni|Pro|Turbo|Master|Standard))?)\b/gi },
  ]),
  page("official:minimax-models", "MiniMax", "https://www.minimax.io/news", [named("MiniMax", ["text", "audio"]), named("Hailuo", ["video"])]),
  page("official:qwen-models", "Alibaba", "https://qwenlm.github.io/"),
  page("official:runway-models", "Runway", "https://docs.dev.runwayml.com/guides/models/"),
  page("official:luma-models", "Luma AI", "https://docs.lumalabs.ai/docs/api"),
  page("official:pika-models", "Pika", "https://pika.art/"),
  page("official:pixverse-models", "PixVerse", "https://docs.platform.pixverse.ai/"),
  page("official:bfl-models", "Black Forest Labs", "https://docs.bfl.ai/"),
  page("official:stability-models", "Stability AI", "https://platform.stability.ai/docs/getting-started/models"),
  page("official:ideogram-models", "Ideogram", "https://developer.ideogram.ai/api-reference"),
  page("official:recraft-models", "Recraft", "https://www.recraft.ai/docs"),
  page("official:midjourney-updates", "Midjourney", "https://updates.midjourney.com/"),
  page("official:adobe-firefly", "Adobe", "https://developer.adobe.com/firefly-services/docs/firefly-api/"),
  page("official:leonardo-models", "Leonardo AI", "https://docs.leonardo.ai/docs/generate-images-using-image-guidance"),
  page("official:suno-news", "Suno", "https://suno.com/blog"),
  page("official:udio-news", "Udio", "https://www.udio.com/blog"),
  page("official:elevenlabs-models", "ElevenLabs", "https://elevenlabs.io/docs/models"),
  page("official:meshy-models", "Meshy", "https://docs.meshy.ai/"),
  page("official:tripo-models", "Tripo AI", "https://platform.tripo3d.ai/docs"),
  page("official:worldlabs-news", "World Labs", "https://www.worldlabs.ai/blog"),
];

const hfOrgs: Array<[string, string, string]> = [
  ["google", "Google", "google"], ["meta-llama", "Meta", "meta-llama"], ["microsoft", "Microsoft", "microsoft"],
  ["mistralai", "Mistral AI", "mistralai"], ["deepseek-ai", "DeepSeek", "deepseek-ai"],
  ["moonshotai", "Moonshot AI", "moonshotai"], ["zai-org", "Zhipu AI", "zai-org"], ["nvidia", "NVIDIA", "nvidia"],
  ["CohereLabs", "Cohere", "cohere"], ["ByteDance", "ByteDance", "bytedance"], ["Qwen", "Alibaba", "qwen"],
  ["Wan-AI", "Alibaba", "wan"], ["Tencent-Hunyuan", "Tencent", "hunyuan"],
  ["black-forest-labs", "Black Forest Labs", "bfl"], ["stabilityai", "Stability AI", "stability"],
  ["MiniMaxAI", "MiniMax", "minimax"], ["Lightricks", "Lightricks", "lightricks"],
];

const officialRepos = hfOrgs.map(([org, owner, id]) => huggingFaceOrg({ id: `official:hf:${id}`, org, owner }));

const artificialAnalysisVideo = benchmarkPage({
  id: "benchmark:artificial-analysis-video",
  kind: "benchmark",
  url: "https://artificialanalysis.ai/video/models",
  intervalMinutes: 60,
  tracksRemovals: false,
  patterns: [
    ...COMMON_PATTERNS,
    { family: "HappyHorse", modalities: ["video", "audio"], expression: /\b(?<model>HappyHorse[- ]?\d+(?:\.\d+)*)\b/gi },
    { family: "Vidu", modalities: ["video"], expression: /\b(?<model>Vidu\s+Q?\d+(?:\.\d+)?(?:\s+Pro)?)\b/gi },
    { family: "Kling", modalities: ["video"], expression: /\b(?<model>Kling\s+\d+(?:\.\d+)?(?:\s+Omni)?(?:\s+\d+p)?(?:\s+\((?:Pro|Standard)\))?)\b/gi },
  ],
});

const optionalApiDefinitions: Array<[string, string, string, string]> = [
  ["openai", "OpenAI", "https://api.openai.com/v1/models", "OPENAI_API_KEY"],
  ["xai", "xAI", "https://api.x.ai/v1/models", "XAI_API_KEY"],
  ["mistral", "Mistral AI", "https://api.mistral.ai/v1/models", "MISTRAL_API_KEY"],
  ["deepseek", "DeepSeek", "https://api.deepseek.com/models", "DEEPSEEK_API_KEY"],
  ["moonshot", "Moonshot AI", "https://api.moonshot.ai/v1/models", "MOONSHOT_API_KEY"],
  ["zai", "Zhipu AI", "https://api.z.ai/api/paas/v4/models", "ZAI_API_KEY"],
];
const optionalApis: SourceAdapter[] = optionalApiDefinitions.map(([id, owner, url, key]) =>
  optionalOpenAiCatalog({ id: `official:api:${id}`, owner, url, apiKeyEnv: key }),
);

const anthropicApi = optionalOpenAiCatalog({
  id: "official:api:anthropic",
  owner: "Anthropic",
  url: "https://api.anthropic.com/v1/models?limit=1000",
  apiKeyEnv: "ANTHROPIC_API_KEY",
  authHeaders: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
});
anthropicApi.parse = (document): ModelObservation[] => {
  const json = JSON.parse(document.body) as { data?: Array<{ id?: string; display_name?: string; created_at?: string }> };
  return (json.data ?? []).flatMap((model) => model.id ? [observation(document.url, "Claude", model.id, {
    displayName: model.display_name ?? model.id,
    modalities: ["text", "image"], availability: ["official API"], lifecycle: "available", releaseDate: model.created_at?.slice(0, 10),
  })] : []);
};

export const SOURCES: SourceAdapter[] = [
  openRouter(), artificialAnalysisVideo, ...frontierPages, ...officialRepos, anthropicApi, ...optionalApis,
];

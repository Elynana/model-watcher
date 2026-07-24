import type { Modality, ModelObservation, SourceAdapter } from "../types.ts";
import { VENDORS } from "../catalog/index.ts";
import {
  benchmarkPage,
  falCatalog,
  githubModels,
  huggingFaceOrg,
  liteLlmCatalog,
  modelsDevCatalog,
  officialFeed,
  officialPage,
  ollamaLibrary,
  openAiCompatible,
  openRouter,
  record,
} from "./factories.ts";

const modalities = (value: string): Modality[] => value.split(" ") as Modality[];

// ---------------------------------------------------------------------------
// 1. Multi-vendor structured catalogs — the definitive slug backbone
// ---------------------------------------------------------------------------

const catalogs: SourceAdapter[] = [
  modelsDevCatalog(),
  liteLlmCatalog(),
  openRouter(),
  falCatalog(),
  githubModels(),
  ollamaLibrary(),
  openAiCompatible({
    id: "platform:vercel-gateway",
    url: "https://ai-gateway.vercel.sh/v1/models",
    availability: "Vercel AI Gateway",
    intervalMinutes: 20,
    covers: modalities("text code image"),
  }),
  openAiCompatible({
    id: "platform:deepinfra",
    url: "https://api.deepinfra.com/v1/openai/models",
    availability: "DeepInfra",
    intervalMinutes: 30,
    covers: modalities("text image speech"),
  }),
  openAiCompatible({
    id: "platform:novita",
    url: "https://api.novita.ai/v3/openai/models",
    availability: "Novita AI",
    intervalMinutes: 30,
    covers: modalities("text image video"),
  }),
  openAiCompatible({
    id: "platform:chutes",
    url: "https://llm.chutes.ai/v1/models",
    availability: "Chutes",
    intervalMinutes: 60,
    covers: modalities("text"),
  }),
  openAiCompatible({
    id: "platform:nano-gpt",
    url: "https://api.nano-gpt.com/v1/models",
    availability: "NanoGPT",
    intervalMinutes: 60,
    covers: modalities("text image"),
  }),
];

// ---------------------------------------------------------------------------
// 2. First-party model APIs — highest-confidence evidence, key-gated
// ---------------------------------------------------------------------------

type ApiSeed = [id: string, vendorId: string, url: string, keyEnv: string, availability: string, covers: string];

const OPENAI_SHAPED: ApiSeed[] = [
  ["openai", "openai", "https://api.openai.com/v1/models", "OPENAI_API_KEY", "OpenAI API", "text code image video speech embedding moderation"],
  ["xai", "xai", "https://api.x.ai/v1/models", "XAI_API_KEY", "xAI API", "text code image"],
  ["mistral", "mistral", "https://api.mistral.ai/v1/models", "MISTRAL_API_KEY", "Mistral API", "text code image embedding"],
  ["deepseek", "deepseek", "https://api.deepseek.com/models", "DEEPSEEK_API_KEY", "DeepSeek API", "text code"],
  ["moonshot", "moonshot", "https://api.moonshot.ai/v1/models", "MOONSHOT_API_KEY", "Moonshot API", "text code"],
  ["zai", "zai", "https://api.z.ai/api/paas/v4/models", "ZAI_API_KEY", "Z.ai API", "text code image video"],
  ["minimax", "minimax", "https://api.minimax.io/v1/models", "MINIMAX_API_KEY", "MiniMax API", "text video speech music"],
  ["alibaba", "alibaba", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models", "DASHSCOPE_API_KEY", "Alibaba DashScope", "text code image video speech"],
  ["bytedance", "bytedance", "https://ark.ap-southeast.bytepluses.com/api/v3/models", "ARK_API_KEY", "Volcengine Ark", "text image video speech"],
  ["tencent", "tencent", "https://api.hunyuan.cloud.tencent.com/v1/models", "HUNYUAN_API_KEY", "Tencent Hunyuan API", "text code image video 3d"],
  ["baidu", "baidu", "https://qianfan.baidubce.com/v2/models", "QIANFAN_API_KEY", "Baidu Qianfan", "text image speech"],
  ["stepfun", "stepfun", "https://api.stepfun.com/v1/models", "STEPFUN_API_KEY", "StepFun API", "text image video speech"],
  ["perplexity", "perplexity", "https://api.perplexity.ai/models", "PERPLEXITY_API_KEY", "Perplexity API", "text"],
  ["groq", "groq", "https://api.groq.com/openai/v1/models", "GROQ_API_KEY", "Groq", "text speech"],
  ["cerebras", "cerebras", "https://api.cerebras.ai/v1/models", "CEREBRAS_API_KEY", "Cerebras", "text"],
  ["together", "together", "https://api.together.xyz/v1/models", "TOGETHER_API_KEY", "Together AI", "text image code"],
  ["fireworks", "fireworks", "https://api.fireworks.ai/inference/v1/models", "FIREWORKS_API_KEY", "Fireworks AI", "text image audio"],
  ["sambanova", "sambanova", "https://api.sambanova.ai/v1/models", "SAMBANOVA_API_KEY", "SambaNova", "text speech"],
  ["nebius", "nebius", "https://api.studio.nebius.com/v1/models", "NEBIUS_API_KEY", "Nebius AI Studio", "text image"],
  ["siliconflow", "siliconflow", "https://api.siliconflow.com/v1/models", "SILICONFLOW_API_KEY", "SiliconFlow", "text image video speech"],
  ["baseten", "baseten", "https://inference.baseten.co/v1/models", "BASETEN_API_KEY", "Baseten", "text speech"],
  ["upstage", "upstage", "https://api.upstage.ai/v1/models", "UPSTAGE_API_KEY", "Upstage", "text embedding"],
  ["ai21", "ai21", "https://api.ai21.com/studio/v1/models", "AI21_API_KEY", "AI21 Studio", "text"],
  ["writer", "writer", "https://api.writer.com/v1/models", "WRITER_API_KEY", "Writer API", "text"],
  ["reka", "reka", "https://api.reka.ai/v1/models", "REKA_API_KEY", "Reka API", "text image video audio"],
  ["liquid", "liquid", "https://api.liquid.ai/v1/models", "LIQUID_API_KEY", "Liquid API", "text image audio"],
  ["inception-labs", "inception-labs", "https://api.inceptionlabs.ai/v1/models", "INCEPTION_API_KEY", "Inception Labs API", "text code"],
  ["01ai", "01ai", "https://api.lingyiwanwu.com/v1/models", "YI_API_KEY", "01.AI API", "text code"],
  ["baichuan", "baichuan", "https://api.baichuan-ai.com/v1/models", "BAICHUAN_API_KEY", "Baichuan API", "text"],
  ["sarvam", "sarvam", "https://api.sarvam.ai/v1/models", "SARVAM_API_KEY", "Sarvam API", "text speech"],
  ["venice", "venice", "https://api.venice.ai/api/v1/models", "VENICE_API_KEY", "Venice AI", "text image"],
  ["aimlapi", "aimlapi", "https://api.aimlapi.com/v1/models", "AIMLAPI_API_KEY", "AI/ML API", "text image video audio"],
  ["modelscope", "modelscope", "https://api-inference.modelscope.cn/v1/models", "MODELSCOPE_API_KEY", "ModelScope", "text image video"],
];

const openAiShapedApis: SourceAdapter[] = OPENAI_SHAPED.map(([id, vendorId, url, keyEnv, availability, covers]) =>
  openAiCompatible({
    id: `official:api:${id}`,
    owner: vendorId,
    url,
    apiKeyEnv: keyEnv,
    availability,
    intervalMinutes: 10,
    tracksRemovals: true,
    covers: modalities(covers),
  }),
);

/** Anthropic publishes `data[].id` with a display name and creation date. */
const anthropicApi = openAiCompatible({
  id: "official:api:anthropic",
  owner: "anthropic",
  url: "https://api.anthropic.com/v1/models?limit=1000",
  apiKeyEnv: "ANTHROPIC_API_KEY",
  availability: "Anthropic API",
  intervalMinutes: 10,
  tracksRemovals: true,
  covers: modalities("text code"),
  authHeaders: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
});

/** Google exposes `models[]` with `supportedGenerationMethods`, not `data[]`. */
const googleApi = openAiCompatible({
  id: "official:api:google",
  owner: "google",
  url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
  apiKeyEnv: "GEMINI_API_KEY",
  availability: "Gemini API",
  intervalMinutes: 10,
  tracksRemovals: true,
  covers: modalities("text code image video audio"),
  authHeaders: (key) => ({ "x-goog-api-key": key }),
});
googleApi.parse = (document): ModelObservation[] => {
  const payload = JSON.parse(document.body) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      inputTokenLimit?: number;
      outputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    }>;
  };
  return (payload.models ?? []).flatMap((model) => {
    if (!model.name) return [];
    const limits: Record<string, string | number> = {};
    if (model.inputTokenLimit) limits["contextTokens"] = model.inputTokenLimit;
    if (model.outputTokenLimit) limits["maxOutputTokens"] = model.outputTokenLimit;
    return record({
      sourceUrl: "https://ai.google.dev/gemini-api/docs/models",
      slug: model.name,
      ...(model.displayName ? { displayName: model.displayName } : {}),
      assertedVendorId: "google",
      capabilities: model.supportedGenerationMethods?.length
        ? { methods: model.supportedGenerationMethods.join(", ") }
        : {},
      limits,
      availability: ["Gemini API"],
    });
  });
};

/** ElevenLabs returns a bare array keyed by `model_id`. */
const elevenLabsApi = openAiCompatible({
  id: "official:api:elevenlabs",
  owner: "elevenlabs",
  url: "https://api.elevenlabs.io/v1/models",
  apiKeyEnv: "ELEVENLABS_API_KEY",
  availability: "ElevenLabs API",
  intervalMinutes: 30,
  tracksRemovals: true,
  covers: modalities("speech audio music"),
  authHeaders: (key) => ({ "xi-api-key": key }),
});
elevenLabsApi.parse = (document): ModelObservation[] => {
  const rows = JSON.parse(document.body) as Array<{
    model_id?: string;
    name?: string;
    can_do_text_to_speech?: boolean;
    languages?: unknown[];
  }>;
  return rows.flatMap((model) =>
    model.model_id
      ? record({
          sourceUrl: "https://elevenlabs.io/docs/models",
          slug: model.model_id,
          ...(model.name ? { displayName: model.name } : {}),
          assertedVendorId: "elevenlabs",
          modalities: ["speech"],
          capabilities: {
            ...(model.can_do_text_to_speech !== undefined ? { textToSpeech: model.can_do_text_to_speech } : {}),
            ...(model.languages?.length ? { languages: model.languages.length } : {}),
          },
          availability: ["ElevenLabs API"],
        })
      : [],
  );
};

const mediaApis: SourceAdapter[] = [
  openAiCompatible({ id: "official:api:cohere", owner: "cohere", url: "https://api.cohere.com/v1/models?page_size=1000", apiKeyEnv: "COHERE_API_KEY", availability: "Cohere API", intervalMinutes: 15, tracksRemovals: true, covers: modalities("text embedding rerank") }),
  openAiCompatible({ id: "official:api:stability", owner: "stability", url: "https://api.stability.ai/v1/engines/list", apiKeyEnv: "STABILITY_API_KEY", availability: "Stability API", intervalMinutes: 60, covers: modalities("image video audio 3d") }),
  openAiCompatible({ id: "official:api:replicate", owner: "replicate", url: "https://api.replicate.com/v1/models", apiKeyEnv: "REPLICATE_API_TOKEN", availability: "Replicate", intervalMinutes: 30, covers: modalities("image video audio text 3d") }),
  openAiCompatible({ id: "official:api:deepgram", owner: "deepgram", url: "https://api.deepgram.com/v1/models", apiKeyEnv: "DEEPGRAM_API_KEY", availability: "Deepgram API", intervalMinutes: 60, covers: modalities("speech audio"), authHeaders: (key) => ({ authorization: `Token ${key}` }) }),
  openAiCompatible({ id: "official:api:cartesia", owner: "cartesia", url: "https://api.cartesia.ai/models", apiKeyEnv: "CARTESIA_API_KEY", availability: "Cartesia API", intervalMinutes: 60, covers: modalities("speech audio"), authHeaders: (key) => ({ "x-api-key": key, "cartesia-version": "2024-11-13" }) }),
  openAiCompatible({ id: "official:api:runway", owner: "runway", url: "https://api.dev.runwayml.com/v1/models", apiKeyEnv: "RUNWAY_API_KEY", availability: "Runway API", intervalMinutes: 30, covers: modalities("video image world"), authHeaders: (key) => ({ authorization: `Bearer ${key}`, "X-Runway-Version": "2024-11-06" }) }),
  openAiCompatible({ id: "official:api:luma", owner: "luma", url: "https://api.lumalabs.ai/dream-machine/v1/generations/models", apiKeyEnv: "LUMA_API_KEY", availability: "Luma API", intervalMinutes: 60, covers: modalities("video image 3d") }),
  openAiCompatible({ id: "official:api:ideogram", owner: "ideogram", url: "https://api.ideogram.ai/v1/models", apiKeyEnv: "IDEOGRAM_API_KEY", availability: "Ideogram API", intervalMinutes: 60, covers: modalities("image"), authHeaders: (key) => ({ "Api-Key": key }) }),
  openAiCompatible({ id: "official:api:bfl", owner: "bfl", url: "https://api.bfl.ai/v1/models", apiKeyEnv: "BFL_API_KEY", availability: "Black Forest Labs API", intervalMinutes: 60, covers: modalities("image video"), authHeaders: (key) => ({ "x-key": key }) }),
  openAiCompatible({ id: "official:api:kling", owner: "kuaishou", url: "https://api-singapore.klingai.com/v1/models", apiKeyEnv: "KLING_API_KEY", availability: "Kling API", intervalMinutes: 60, covers: modalities("video image audio") }),
  openAiCompatible({ id: "official:api:vidu", owner: "shengshu", url: "https://api.vidu.com/ent/v2/models", apiKeyEnv: "VIDU_API_KEY", availability: "Vidu API", intervalMinutes: 60, covers: modalities("video audio"), authHeaders: (key) => ({ authorization: `Token ${key}` }) }),
  openAiCompatible({ id: "official:api:pixverse", owner: "pixverse", url: "https://app-api.pixverse.ai/openapi/v2/models", apiKeyEnv: "PIXVERSE_API_KEY", availability: "PixVerse API", intervalMinutes: 60, covers: modalities("video"), authHeaders: (key) => ({ "API-KEY": key }) }),
  openAiCompatible({ id: "official:api:heygen", owner: "heygen", url: "https://api.heygen.com/v2/avatars", apiKeyEnv: "HEYGEN_API_KEY", availability: "HeyGen API", intervalMinutes: 120, covers: modalities("video"), authHeaders: (key) => ({ "x-api-key": key }) }),
  openAiCompatible({ id: "official:api:hume", owner: "hume", url: "https://api.hume.ai/v0/tts/voices?provider=HUME_AI", apiKeyEnv: "HUME_API_KEY", availability: "Hume API", intervalMinutes: 120, covers: modalities("speech audio"), authHeaders: (key) => ({ "X-Hume-Api-Key": key }) }),
  openAiCompatible({ id: "official:api:assemblyai", owner: "assemblyai", url: "https://api.assemblyai.com/v2/models", apiKeyEnv: "ASSEMBLYAI_API_KEY", availability: "AssemblyAI API", intervalMinutes: 120, covers: modalities("speech"), authHeaders: (key) => ({ authorization: key }) }),
  openAiCompatible({ id: "official:api:meshy", owner: "meshy", url: "https://api.meshy.ai/openapi/v2/models", apiKeyEnv: "MESHY_API_KEY", availability: "Meshy API", intervalMinutes: 120, covers: modalities("3d") }),
  openAiCompatible({ id: "official:api:tripo", owner: "tripo", url: "https://api.tripo3d.ai/v2/openapi/models", apiKeyEnv: "TRIPO_API_KEY", availability: "Tripo API", intervalMinutes: 120, covers: modalities("3d") }),
  openAiCompatible({ id: "official:api:voyage", owner: "voyage", url: "https://api.voyageai.com/v1/models", apiKeyEnv: "VOYAGE_API_KEY", availability: "Voyage API", intervalMinutes: 120, covers: modalities("embedding rerank") }),
  openAiCompatible({ id: "official:api:jina", owner: "jina", url: "https://api.jina.ai/v1/models", apiKeyEnv: "JINA_API_KEY", availability: "Jina API", intervalMinutes: 120, covers: modalities("embedding rerank") }),
  openAiCompatible({ id: "official:api:fal", owner: "fal", url: "https://fal.ai/api/models?page=1&size=100", apiKeyEnv: "FAL_KEY", availability: "fal.ai", intervalMinutes: 60, covers: modalities("image video speech music 3d"), authHeaders: (key) => ({ authorization: `Key ${key}` }) }),
];

const keyedApis: SourceAdapter[] = [anthropicApi, googleApi, elevenLabsApi, ...openAiShapedApis, ...mediaApis];

// ---------------------------------------------------------------------------
// 3. First-party release feeds — dated announcements
// ---------------------------------------------------------------------------

type FeedSeed = [id: string, vendorId: string | undefined, url: string, covers: string, restrictToOwner?: false];

const FEEDS: FeedSeed[] = [
  ["openai-news", "openai", "https://openai.com/news/rss.xml", "text code image video speech"],
  ["google-ai", "google", "https://blog.google/technology/ai/rss/", "text image video audio"],
  ["google-deepmind", "google", "https://deepmind.google/blog/rss.xml", "text image video world"],
  ["alibaba-qwen", "alibaba", "https://qwen.ai/rss", "text code image video audio"],
  ["deepseek-news", "deepseek", "https://api-docs.deepseek.com/news/rss.xml", "text code"],
  ["cohere-blog", "cohere", "https://cohere.com/blog/rss.xml", "text embedding rerank"],
  ["nvidia-blog", "nvidia", "https://blogs.nvidia.com/feed/", "text image video audio world"],
  ["stability-news", "stability", "https://stability.ai/news?format=rss", "image video audio 3d"],
  ["midjourney-updates", "midjourney", "https://updates.midjourney.com/rss/", "image video"],
  ["huggingface-blog", undefined, "https://huggingface.co/blog/feed.xml", "text image video audio 3d", false],
  ["replicate-changelog", undefined, "https://replicate.com/changelog/rss", "image video audio text", false],
];

const feeds: SourceAdapter[] = FEEDS.map(([id, vendorId, url, covers, restrictToOwner]) =>
  officialFeed({
    id: `official:feed:${id}`,
    ...(vendorId ? { owner: vendorId } : {}),
    kind: "official-feed",
    url,
    intervalMinutes: 20,
    covers: modalities(covers),
    ...(restrictToOwner === false ? { restrictToOwner: false } : {}),
  }),
);

// ---------------------------------------------------------------------------
// 4. First-party documentation pages — the fallback where no API exists
// ---------------------------------------------------------------------------

type PageSeed = [id: string, vendorId: string, url: string, covers: string];

const PAGES: PageSeed[] = [
  ["openai", "openai", "https://platform.openai.com/docs/models", "text code image video speech embedding"],
  ["anthropic", "anthropic", "https://docs.anthropic.com/en/docs/about-claude/models/overview", "text code"],
  ["google", "google", "https://ai.google.dev/gemini-api/docs/models", "text code image video audio"],
  ["google-veo", "google", "https://ai.google.dev/gemini-api/docs/video", "video audio"],
  ["google-imagen", "google", "https://ai.google.dev/gemini-api/docs/image-generation", "image"],
  ["meta", "meta", "https://www.llama.com/docs/model-cards-and-prompt-formats/", "text code image"],
  ["xai", "xai", "https://docs.x.ai/docs/models", "text code image"],
  ["mistral", "mistral", "https://docs.mistral.ai/getting-started/models/models_overview/", "text code image"],
  ["deepseek", "deepseek", "https://api-docs.deepseek.com/quick_start/pricing", "text code"],
  ["moonshot", "moonshot", "https://platform.moonshot.ai/docs/pricing/chat", "text code"],
  ["zai", "zai", "https://docs.z.ai/guides/overview/pricing", "text code image video"],
  ["minimax", "minimax", "https://platform.minimax.io/docs/guides/text-generation", "text video speech music"],
  ["alibaba", "alibaba", "https://www.alibabacloud.com/help/en/model-studio/models", "text code image video speech"],
  ["bytedance", "bytedance", "https://seed.bytedance.com/en/models", "text image video audio 3d"],
  ["tencent", "tencent", "https://cloud.tencent.com/document/product/1729/104753", "text code image video 3d"],
  ["baidu", "baidu", "https://ai.baidu.com/tech/ernie", "text image speech"],
  ["microsoft", "microsoft", "https://learn.microsoft.com/en-us/azure/ai-foundry/concepts/models-featured", "text code image speech"],
  ["amazon", "amazon", "https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html", "text image video speech embedding"],
  ["nvidia", "nvidia", "https://catalog.ngc.nvidia.com/models", "text image video audio world"],
  ["ibm", "ibm", "https://www.ibm.com/granite", "text code embedding"],
  ["ai21", "ai21", "https://docs.ai21.com/docs/jamba-foundation-models", "text"],
  ["cohere", "cohere", "https://docs.cohere.com/docs/models", "text embedding rerank"],
  ["perplexity", "perplexity", "https://docs.perplexity.ai/getting-started/models", "text"],
  ["stepfun", "stepfun", "https://www.stepfun.com/", "text image video speech"],
  ["kuaishou", "kuaishou", "https://app.klingai.com/global/dev/document-api", "video image audio"],
  ["shengshu", "shengshu", "https://platform.vidu.com/docs/model-map", "video audio"],
  ["runway", "runway", "https://docs.dev.runwayml.com/guides/models/", "video image world"],
  ["luma", "luma", "https://lumalabs.ai/api", "video image 3d"],
  ["pika", "pika", "https://pika-2.gitbook.io/pika-api", "video"],
  ["pixverse", "pixverse", "https://docs.platform.pixverse.ai/", "video"],
  ["bfl", "bfl", "https://docs.bfl.ai/", "image video"],
  ["stability", "stability", "https://platform.stability.ai/docs/api-reference", "image video audio 3d"],
  ["ideogram", "ideogram", "https://developer.ideogram.ai/api-reference/api-reference/generate-v3", "image"],
  ["recraft", "recraft", "https://www.recraft.ai/docs", "image"],
  ["adobe", "adobe", "https://developer.adobe.com/firefly-services/docs/firefly-api/", "image video audio"],
  ["freepik", "freepik", "https://docs.freepik.com/introduction", "image video"],
  ["lightricks", "lightricks", "https://github.com/Lightricks/LTX-Video", "video image"],
  ["moonvalley", "moonvalley", "https://www.moonvalley.com/marey", "video"],
  ["higgsfield", "higgsfield", "https://docs.higgsfield.ai/", "video image"],
  ["hedra", "hedra", "https://www.hedra.com/", "video audio"],
  ["heygen", "heygen", "https://docs.heygen.com/docs/quick-start", "video"],
  ["synthesia", "synthesia", "https://www.synthesia.io/features", "video"],
  ["topaz", "topaz", "https://www.topazlabs.com/topaz-video", "video image"],
  ["decart", "decart", "https://www.decart.ai/", "video world"],
  ["worldlabs", "worldlabs", "https://www.worldlabs.ai/blog", "world 3d"],
  ["odyssey", "odyssey", "https://odyssey.world/", "world video"],
  ["elevenlabs", "elevenlabs", "https://elevenlabs.io/docs/models", "speech audio music"],
  ["suno", "suno", "https://suno.com/blog", "music audio"],
  ["udio", "udio", "https://help.udio.com/", "music audio"],
  ["cartesia", "cartesia", "https://docs.cartesia.ai/2024-11-13/get-started/overview", "speech audio"],
  ["playai", "playai", "https://playht.com/", "speech"],
  ["hume", "hume", "https://dev.hume.ai/docs/text-to-speech-tts/overview", "speech audio"],
  ["resemble", "resemble", "https://docs.resemble.ai/", "speech audio"],
  ["deepgram", "deepgram", "https://developers.deepgram.com/docs/models-languages-overview", "speech audio"],
  ["assemblyai", "assemblyai", "https://www.assemblyai.com/docs/speech-to-text/speech-recognition", "speech"],
  ["speechmatics", "speechmatics", "https://docs.speechmatics.com/introduction/supported-languages", "speech"],
  ["fish-audio", "fish-audio", "https://docs.fish.audio/", "speech audio"],
  ["sesame", "sesame", "https://www.sesame.com/research", "speech"],
  ["rime", "rime", "https://docs.rime.ai/api-reference/models", "speech"],
  ["camb", "camb", "https://docs.camb.ai/", "speech"],
  ["meshy", "meshy", "https://docs.meshy.ai/", "3d"],
  ["tripo", "tripo", "https://platform.tripo3d.ai/docs", "3d"],
  ["hyper3d", "hyper3d", "https://developer.hyper3d.ai/", "3d"],
  ["voyage", "voyage", "https://blog.voyageai.com/", "embedding rerank"],
  ["jina", "jina", "https://jina.ai/models", "embedding rerank text"],
  ["mixedbread", "mixedbread", "https://www.mixedbread.com/blog", "embedding rerank"],
  ["nomic", "nomic", "https://www.nomic.ai/blog", "embedding"],
  ["liquid", "liquid", "https://www.liquid.ai/models", "text image audio"],
  ["reka", "reka", "https://www.reka.ai/news", "text image video audio"],
  ["writer", "writer", "https://dev.writer.com/home/models", "text"],
  ["databricks", "databricks", "https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/supported-models", "text embedding"],
  ["snowflake", "snowflake", "https://docs.snowflake.com/en/user-guide/snowflake-cortex/llm-functions", "text embedding"],
  ["allenai", "allenai", "https://allenai.org/language-models", "text code image"],
  ["tii", "tii", "https://falconllm.tii.ae/falcon-models.html", "text code image"],
  ["upstage", "upstage", "https://console.upstage.ai/docs/capabilities/chat", "text embedding"],
  ["lg", "lg", "https://www.lgresearch.ai/exaone", "text code image"],
  ["naver", "naver", "https://clovastudio.ncloud.com/docs", "text speech"],
  ["sber", "sber", "https://developers.sber.ru/docs/ru/gigachat/models", "text image"],
  ["yandex", "yandex", "https://yandex.cloud/en/docs/foundation-models/concepts/yandexgpt/models", "text speech"],
  ["aleph-alpha", "aleph-alpha", "https://docs.aleph-alpha.com/docs/tutorial/model-cards/", "text"],
  ["huawei", "huawei", "https://www.huaweicloud.com/intl/en-us/product/pangu.html", "text code image video"],
  ["skywork", "skywork", "https://skywork.ai/", "text image video world 3d"],
  ["iflytek", "iflytek", "https://www.xfyun.cn/doc/spark/Web.html", "text speech"],
  ["xiaomi", "xiaomi", "https://github.com/XiaomiMiMo", "text code audio"],
  ["ant", "ant", "https://github.com/inclusionAI", "text code"],
  ["kyutai", "kyutai", "https://kyutai.org/", "speech audio text"],
  ["sakana", "sakana", "https://sakana.ai/blog/", "text image"],
  ["nous", "nous", "https://nousresearch.com/", "text code"],
  ["arcee", "arcee", "https://www.arcee.ai/", "text code"],
];

const pages: SourceAdapter[] = PAGES.map(([id, vendorId, url, covers]) =>
  officialPage({
    id: `official:page:${id}`,
    owner: vendorId,
    kind: "official-page",
    url,
    intervalMinutes: 30,
    covers: modalities(covers),
  }),
);

// ---------------------------------------------------------------------------
// 5. Official open-weights organizations, derived from the vendor registry
// ---------------------------------------------------------------------------

const huggingFaceSources: SourceAdapter[] = VENDORS.flatMap((vendor) =>
  vendor.hfOrgs.map((org) =>
    huggingFaceOrg({ id: `official:hf:${vendor.id}:${org.toLowerCase()}`, org, owner: vendor.id }),
  ),
);

// ---------------------------------------------------------------------------
// 6. Discovery: benchmarks and arenas, including stealth codename detection
// ---------------------------------------------------------------------------

/**
 * Arena entries such as `torenia-alpha` are sponsor-blinded submissions. They
 * are recorded with no owner and no capability claims, and are labelled
 * stealth until a first-party source names them.
 */
const STEALTH_CODENAME = /\b(?<model>[a-z]{4,14}-(?:alpha|beta|omega|zero|preview|exp|test)|(?:anonymous|stealth|experimental)-[a-z0-9-]{3,20})\b/g;

const discovery: SourceAdapter[] = [
  benchmarkPage({ id: "benchmark:artificial-analysis-text", kind: "benchmark", url: "https://artificialanalysis.ai/models", intervalMinutes: 60, covers: modalities("text code") }),
  benchmarkPage({ id: "benchmark:artificial-analysis-video", kind: "benchmark", url: "https://artificialanalysis.ai/video", intervalMinutes: 60, covers: modalities("video") }),
  benchmarkPage({ id: "benchmark:artificial-analysis-image", kind: "benchmark", url: "https://artificialanalysis.ai/image", intervalMinutes: 60, covers: modalities("image") }),
  benchmarkPage({ id: "benchmark:artificial-analysis-speech", kind: "benchmark", url: "https://artificialanalysis.ai/text-to-speech", intervalMinutes: 120, covers: modalities("speech") }),
  benchmarkPage({ id: "benchmark:arena", kind: "benchmark", url: "https://lmarena.ai/leaderboard", intervalMinutes: 30, covers: modalities("text code image video"), codenames: STEALTH_CODENAME }),
  benchmarkPage({ id: "benchmark:arena-text", kind: "benchmark", url: "https://lmarena.ai/leaderboard/text", intervalMinutes: 30, covers: modalities("text code"), codenames: STEALTH_CODENAME }),
];

export const SOURCES: SourceAdapter[] = [
  ...catalogs,
  ...keyedApis,
  ...feeds,
  ...pages,
  ...huggingFaceSources,
  ...discovery,
];

export interface Coverage {
  total: number;
  enabled: number;
  byKind: Record<string, number>;
  byModality: Record<string, number>;
  vendorsCovered: number;
  vendorsTotal: number;
  vendorsWithoutFirstPartySource: string[];
}

/** Source-coverage report used by `/coverage` and by the startup log line. */
export function coverage(): Coverage {
  const byKind: Record<string, number> = {};
  const byModality: Record<string, number> = {};
  for (const source of SOURCES) {
    byKind[source.kind] = (byKind[source.kind] ?? 0) + 1;
    for (const modality of source.covers ?? []) byModality[modality] = (byModality[modality] ?? 0) + 1;
  }
  const owned = new Set(SOURCES.filter((source) => source.owner).map((source) => source.owner!));
  const tracked = VENDORS.filter((vendor) => vendor.tier !== "platform");
  return {
    total: SOURCES.length,
    enabled: SOURCES.filter((source) => source.enabled()).length,
    byKind,
    byModality,
    vendorsCovered: tracked.filter((vendor) => owned.has(vendor.id)).length,
    vendorsTotal: tracked.length,
    vendorsWithoutFirstPartySource: tracked.filter((vendor) => !owned.has(vendor.id)).map((vendor) => vendor.id),
  };
}

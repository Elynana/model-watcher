import type { Modality } from "../types.ts";

/**
 * Grammar tokens shared by every family. They exist so that a slug such as
 * `claude-opus-4-6-20260217` or a prose mention such as "Gemini 3.6 Flash
 * Preview" decomposes into the same structured parts.
 */
export const VERSION_TOKEN = String.raw`v?\d+(?:[.\-_]\d+){0,3}`;

export const TIER_TOKENS = [
  "pro", "max", "ultra", "plus", "premier", "mini", "nano", "micro", "lite", "air", "flash",
  "turbo", "fast", "standard", "small", "medium", "large", "xlarge", "xl", "xxl", "tiny",
  "heavy", "omni", "master", "advanced", "expert", "scout", "maverick", "behemoth",
  "opus", "sonnet", "haiku", "fable", "schnell", "dev", "kontext", "krea", "klein",
] as const;

export const QUALIFIER_TOKENS = [
  "preview", "experimental", "exp", "alpha", "beta", "rc", "latest", "stable", "legacy",
  "thinking", "reasoner", "reasoning", "instruct", "chat", "completion", "base", "it",
  "coder", "code", "math", "prover", "agent", "search", "deep-research", "research",
  "vision", "vl", "multimodal", "audio", "speech", "voice", "realtime", "live", "tts",
  "stt", "asr", "transcribe", "translate", "edit", "inpaint", "outpaint", "upscale",
  "distill", "moe", "dense", "sparse", "sft", "rl", "hd", "raw", "ultra-hd",
  "i2v", "t2v", "t2i", "i2i", "v2v", "s2v", "r2v", "text-to-video", "image-to-video",
] as const;

/**
 * Qualifiers that genuinely appear inside published model names. Prose
 * matching is restricted to these so a table header such as "Reasoning" or
 * "Deep Research" cannot be glued onto a model name.
 */
const MENTION_QUALIFIER_TOKENS = [
  "preview", "experimental", "exp", "alpha", "beta", "rc", "latest",
  "thinking", "instruct", "chat", "coder", "code", "math", "vision", "vl",
  "audio", "realtime", "live", "tts", "edit", "i2v", "t2v",
] as const;

const TIERS = TIER_TOKENS.join("|");
const QUALIFIERS = MENTION_QUALIFIER_TOKENS.join("|");

export interface Family {
  id: string;
  vendorId: string;
  name: string;
  modalities: Modality[];
  /** Anchored matcher for the head of a canonical slug. */
  slug: RegExp;
  /** Unanchored form of `slug`, for spotting a family inside a longer slug. */
  slugAnywhere: RegExp;
  /** Global matcher for a complete model name inside prose. */
  mention: RegExp;
  /** Non-global form of `mention`, for single-value tests. */
  mentionOnce: RegExp;
  /** Family ships downloadable weights. */
  open: boolean;
  /** Family name alone is a complete model reference (no version needed). */
  bare: boolean;
  /** Literal-prefix length; longer wins when several families match a slug. */
  specificity: number;
}

/**
 * Literal characters at the head of a family pattern. `gpt-image` (9) must
 * outrank `gpt` (3) so the more specific family claims the slug.
 */
function specificityOf(base: string): number {
  const cleaned = base
    .replace(/\(\?[!=][^()]*\)/g, "")
    .replace(/\(\?:[^()]*\)\?/g, "")
    .replace(/\(\?:[^()]*\)/g, "");
  const head = cleaned.split("|")[0] ?? cleaned;
  const literal = /^[a-z0-9._\\-]+/i.exec(head)?.[0] ?? "";
  return literal.replace(/\\/g, "").length;
}

interface Spec {
  /** Regex alternation for the family head, lowercase, no anchors. */
  base: string;
  /** Extra tier words specific to this family. */
  tiers?: string[];
  open?: boolean;
  bare?: boolean;
}

type Seed = [id: string, vendorId: string, name: string, modalities: string, spec: Spec | string];

/**
 * Publishers write the same family with different separators: `gpt-image-1`
 * in a slug, "GPT Image 2" in prose. Structural hyphens in a family pattern
 * are widened to accept any separator; hyphens inside character classes and
 * escapes are left alone.
 */
function flexibleSeparators(base: string): string {
  return base.replace(/(^|[^[\\])-(?!])/g, "$1[-_ ]?");
}

function build(id: string, vendorId: string, name: string, modalities: string, raw: Spec | string): Family {
  const spec: Spec = typeof raw === "string" ? { base: raw } : raw;
  const tiers = [...TIER_TOKENS, ...(spec.tiers ?? [])].join("|");
  const head = `(?:${flexibleSeparators(spec.base)})`;
  // A mention must carry a version number or a tier word, otherwise a bare
  // brand word in prose would be reported as a model release.
  const discriminator = spec.bare ? "" : String.raw`(?=[-_. ]?(?:\d|${tiers}\b))`;
  const body = String.raw`(?:[-_. ](?:${tiers}))*(?:[-_. ]?${VERSION_TOKEN})?(?:[-_. ](?:${tiers}))*(?:[-_. ](?:${QUALIFIERS})){0,3}(?:[-_. ](?:\d{8}|\d{4}-\d{2}-\d{2}))?`;
  const mentionSource = String.raw`\b(?<model>${head}${discriminator}${body})`;
  return {
    id,
    vendorId,
    name,
    modalities: modalities.split(" ").filter(Boolean) as Modality[],
    slug: new RegExp(String.raw`^${head}(?=$|[-_./ ]|\d)`, "i"),
    slugAnywhere: new RegExp(String.raw`(?:^|[-_./ ])${head}(?=$|[-_./ ]|\d)`, "i"),
    mention: new RegExp(mentionSource, "gi"),
    mentionOnce: new RegExp(mentionSource, "i"),
    open: spec.open ?? false,
    bare: spec.bare ?? false,
    specificity: specificityOf(spec.base),
  };
}

const SEEDS: Seed[] = [
  // ------------------------------------------------------------------ OpenAI
  ["gpt", "openai", "GPT", "text code", { base: String.raw`gpt(?!-neox|-j\b|-sw|-bert)`, tiers: ["codex", "chat", "audio", "realtime", "search", "transcribe", "tts", "oss", "image"] }],
  ["o-series", "openai", "OpenAI o-series", "text code", { base: String.raw`o[1-9]\d?` }],
  ["codex", "openai", "Codex", "code text", { base: "codex" }],
  ["gpt-image", "openai", "GPT Image", "image", { base: "gpt-image" }],
  ["dall-e", "openai", "DALL·E", "image", { base: String.raw`dall[-·]?e` }],
  ["sora", "openai", "Sora", "video audio", { base: "sora" }],
  ["whisper", "openai", "Whisper", "speech", { base: "whisper", open: true }],
  ["text-embedding", "openai", "OpenAI Embeddings", "embedding", { base: "text-embedding" }],
  ["omni-moderation", "openai", "Omni Moderation", "moderation", { base: "omni-moderation|text-moderation" }],

  // --------------------------------------------------------------- Anthropic
  ["claude", "anthropic", "Claude", "text code", { base: "claude", tiers: ["opus", "sonnet", "haiku", "fable", "instant"] }],

  // ------------------------------------------------------------------ Google
  ["gemini", "google", "Gemini", "text code image audio", { base: "gemini", tiers: ["flash", "pro", "ultra", "nano", "omni", "live", "native-audio", "computer-use", "robotics"] }],
  ["gemma", "google", "Gemma", "text code", { base: String.raw`(?:code|pali|med|shield|tx|t5|dolphin|recurrent|vao)?gemma`, open: true }],
  ["imagen", "google", "Imagen", "image", { base: "imagen" }],
  ["nano-banana", "google", "Nano Banana", "image", { base: "nano-banana", bare: true }],
  ["veo", "google", "Veo", "video audio", { base: "veo" }],
  ["lyria", "google", "Lyria", "music audio", { base: "lyria" }],
  ["chirp", "google", "Chirp", "speech", { base: "chirp" }],
  ["genie", "google", "Genie", "world video", { base: "genie" }],
  ["gemini-embedding", "google", "Gemini Embedding", "embedding", { base: "gemini-embedding|text-embedding-00|embeddinggemma" }],

  // -------------------------------------------------------------------- Meta
  ["llama", "meta", "Llama", "text code", { base: String.raw`(?:code|meta[-_])?llama`, tiers: ["scout", "maverick", "behemoth", "guard", "vision"], open: true }],
  ["emu", "meta", "Emu", "image video", { base: "emu" }],
  ["movie-gen", "meta", "Movie Gen", "video audio", { base: "movie-?gen", bare: true }],
  ["musicgen", "meta", "MusicGen / AudioCraft", "music audio", { base: "musicgen|audiocraft|audiogen", open: true, bare: true }],
  ["seamless", "meta", "SeamlessM4T", "speech", { base: "seamless", open: true }],
  ["audiobox", "meta", "Audiobox", "audio speech", { base: "audiobox|voicebox", bare: true }],

  // --------------------------------------------------------------------- xAI
  ["grok", "xai", "Grok", "text code image", { base: "grok", tiers: ["heavy", "fast", "imagine", "code"] }],
  ["aurora", "xai", "Aurora", "image", { base: "aurora(?=[-_ ]?(?:\\d|image))" }],

  // ----------------------------------------------------------------- Mistral
  ["mistral", "mistral", "Mistral", "text code", { base: String.raw`mistral|mixtral|ministral|magistral|devstral|codestral|pixtral|voxtral|saba`, tiers: ["nemo", "moderation", "ocr", "embed", "saba"], open: true }],

  // ---------------------------------------------------------------- DeepSeek
  ["deepseek", "deepseek", "DeepSeek", "text code", { base: String.raw`deepseek`, tiers: ["chat", "reasoner", "coder", "prover", "math", "vl", "r1", "v3", "v4", "ocr"], open: true }],
  ["janus", "deepseek", "Janus", "image text", { base: "janus", open: true }],

  // ----------------------------------------------------------------- Alibaba
  ["qwen", "alibaba", "Qwen", "text code", { base: String.raw`qwen|qwq|qvq|tongyi`, tiers: ["coder", "max", "plus", "turbo", "long", "next", "guard"], open: true }],
  ["qwen-image", "alibaba", "Qwen-Image", "image", { base: "qwen-image|qwenimage", open: true }],
  ["qwen-vl", "alibaba", "Qwen-VL", "image text", { base: "qwen-?\\d*-?vl|qvq", open: true }],
  ["qwen-audio", "alibaba", "Qwen-Audio / Qwen-Omni", "audio speech", { base: "qwen-?\\d*-?(?:audio|omni)|qwen-tts", open: true }],
  ["qwen-embedding", "alibaba", "Qwen Embedding / Reranker", "embedding rerank", { base: "qwen\\d*-(?:embedding|reranker)|text-embedding-v", open: true }],
  ["wan", "alibaba", "Wan", "video image", { base: String.raw`wan[-_.]?x?`, open: true }],
  ["cosyvoice", "alibaba", "CosyVoice / FunAudio", "speech audio", { base: "cosyvoice|funaudio|sensevoice|fun-asr", open: true }],
  ["gte", "alibaba", "GTE", "embedding rerank", { base: "gte", open: true }],

  // ----------------------------------------------------------------- Moonshot
  ["kimi", "moonshot", "Kimi", "text code", { base: String.raw`kimi|moonshot-v`, tiers: ["k1", "k2", "k3", "linear", "dev", "vl", "researcher"], open: true }],

  // --------------------------------------------------------------------- Z.ai
  ["glm", "zai", "GLM", "text code", { base: String.raw`(?:chat)?glm|codegeex`, tiers: ["air", "airx", "flashx", "plus", "v", "z1", "rumination"], open: true }],
  ["cogview", "zai", "CogView", "image", { base: "cogview", open: true }],
  ["cogvideo", "zai", "CogVideoX", "video", { base: "cogvideo", open: true }],

  // ----------------------------------------------------------------- MiniMax
  ["minimax", "minimax", "MiniMax", "text code", { base: String.raw`minimax|abab`, tiers: ["m1", "m2", "m3", "text", "vl"], open: true }],
  ["hailuo", "minimax", "Hailuo", "video audio", { base: "hailuo|minimax-hailuo" }],
  ["minimax-speech", "minimax", "MiniMax Speech / Music", "speech music", { base: "speech-0|music-0|minimax-(?:speech|music)" }],

  // ---------------------------------------------------------------- ByteDance
  ["doubao", "bytedance", "Doubao", "text code image video speech", { base: "doubao", tiers: ["seed", "lite", "vision", "thinking"] }],
  ["seed-llm", "bytedance", "Seed", "text code", { base: String.raw`seed(?:-oss|-thinking|-coder|-prover|-x|-vl|1[-.]?\d)`, open: true }],
  ["seedance", "bytedance", "Seedance", "video audio", { base: "seedance" }],
  ["seedream", "bytedance", "Seedream", "image", { base: "seedream" }],
  ["seededit", "bytedance", "SeedEdit", "image", { base: "seededit|seed-edit" }],
  ["seedvr", "bytedance", "SeedVR", "video", { base: "seedvr", open: true }],
  ["seed-tts", "bytedance", "Seed-TTS / Seed-Music", "speech music", { base: "seed-(?:tts|music|asr|voice)" }],
  ["seed3d", "bytedance", "Seed3D", "3d", { base: "seed-?3d" }],
  ["bagel", "bytedance", "BAGEL", "image text", { base: "bagel", open: true }],
  ["ui-tars", "bytedance", "UI-TARS", "text image", { base: "ui-tars", open: true }],

  // ------------------------------------------------------------------ Tencent
  ["hunyuan", "tencent", "Hunyuan", "text code", { base: "hunyuan", tiers: ["t1", "turbos", "a13b", "standard", "translation", "vision"], open: true }],
  ["hunyuan-video", "tencent", "HunyuanVideo", "video", { base: "hunyuan-?video", open: true }],
  ["hunyuan-image", "tencent", "Hunyuan Image", "image", { base: "hunyuan-?image|hunyuan-?dit", open: true }],
  ["hunyuan-3d", "tencent", "Hunyuan3D", "3d", { base: "hunyuan-?3d", open: true }],
  ["hunyuan-world", "tencent", "HunyuanWorld", "world 3d", { base: "hunyuan-?world", open: true }],
  ["hunyuan-audio", "tencent", "Hunyuan Audio", "speech audio music", { base: "hunyuan-?(?:audio|voice|tts|foley)", open: true }],

  // ---------------------------------------------------------------- Microsoft
  ["phi", "microsoft", "Phi", "text code", { base: "phi", open: true }],
  ["mai", "microsoft", "MAI", "text image speech", { base: String.raw`mai(?:-|\d)`, tiers: ["voice", "image", "vision"] }],
  ["florence", "microsoft", "Florence", "image text", { base: "florence", open: true }],
  ["vall-e", "microsoft", "VALL-E", "speech", { base: "vall-?e" }],
  ["muse", "microsoft", "Muse / WHAM", "world", { base: "wham|muse(?=[-_ ]?\\d)" }],
  ["bitnet", "microsoft", "BitNet", "text", { base: "bitnet", open: true }],
  ["magma", "microsoft", "Magma", "text image", { base: "magma", open: true }],

  // ------------------------------------------------------------------- Amazon
  ["nova", "amazon", "Amazon Nova", "text image video speech", { base: String.raw`(?:amazon[-.])?nova(?=[-_. ]?(?:micro|lite|pro|premier|canvas|reel|sonic|act|multimodal|\d))` }],
  ["titan", "amazon", "Amazon Titan", "text image embedding", { base: String.raw`(?:amazon[-.])?titan` }],
  ["polly", "amazon", "Amazon Polly", "speech", { base: "polly" }],

  // ------------------------------------------------------------------- NVIDIA
  ["nemotron", "nvidia", "Nemotron", "text code", { base: String.raw`(?:llama-|mistral-)?nemotron|minitron`, open: true }],
  ["cosmos", "nvidia", "Cosmos", "world video", { base: "cosmos", open: true }],
  ["edify", "nvidia", "Edify", "image video 3d", { base: "edify" }],
  ["parakeet", "nvidia", "Parakeet", "speech", { base: "parakeet", open: true }],
  ["canary", "nvidia", "Canary", "speech", { base: "canary", open: true }],
  ["fugatto", "nvidia", "Fugatto", "audio music", { base: "fugatto", bare: true }],
  ["sana", "nvidia", "Sana", "image", { base: "sana", open: true }],
  ["nv-embed", "nvidia", "NV-Embed / NeMo Retriever", "embedding rerank", { base: "nv-embed|nv-rerank|nemo-retriever|nvclip" }],
  ["groot", "nvidia", "GR00T", "world", { base: "gr00t|groot" }],

  // ------------------------------------------------------------------- Cohere
  ["command", "cohere", "Command", "text code", { base: "command", tiers: ["r", "r7b", "a", "light"], open: true }],
  ["aya", "cohere", "Aya", "text image", { base: "aya", open: true }],
  ["cohere-embed", "cohere", "Cohere Embed / Rerank", "embedding rerank", { base: "embed-(?:english|multilingual|v)|rerank-(?:english|multilingual|v)" }],

  // -------------------------------------------------------- other US / EU labs
  ["jamba", "ai21", "Jamba", "text", { base: "jamba", open: true }],
  ["jurassic", "ai21", "Jurassic", "text", { base: "j2|jurassic" }],
  ["granite", "ibm", "Granite", "text code embedding", { base: "granite", open: true }],
  ["afm-apple", "apple", "Apple Foundation Models", "text", { base: "apple-afm|afm-(?:server|on-device)|openelm", open: true }],
  ["sonar", "perplexity", "Sonar", "text", { base: "sonar", tiers: ["deep-research"] }],
  ["reka", "reka", "Reka", "text", { base: "reka", tiers: ["core", "flash", "edge", "research"], open: true }],
  ["lfm", "liquid", "Liquid Foundation Models", "text", { base: "lfm", open: true }],
  ["palmyra", "writer", "Palmyra", "text", { base: "palmyra", open: true }],
  ["dbrx", "databricks", "DBRX", "text code", { base: "dbrx", open: true, bare: true }],
  ["arctic", "snowflake", "Arctic", "text embedding", { base: "arctic|snowflake-arctic", open: true }],
  ["olmo", "allenai", "OLMo / Molmo / Tülu", "text code", { base: String.raw`olmo|olmoe|molmo|molmoact|tulu|t(?:ü|u)lu`, open: true }],
  ["pythia", "eleuther", "Pythia / GPT-NeoX", "text", { base: "pythia|gpt-neox|gpt-j", open: true }],
  ["hermes", "nous", "Hermes", "text code", { base: "(?:deep)?hermes|nous-hermes", open: true }],
  ["arcee", "arcee", "Arcee AFM / Trinity", "text code", { base: "arcee|trinity|virtuoso|caller", open: true }],
  ["intellect", "prime-intellect", "INTELLECT", "text", { base: "intellect", open: true }],
  ["mercury", "inception-labs", "Mercury", "text code", { base: "mercury", tiers: ["coder"] }],
  ["cogito", "deep-cogito", "Cogito", "text code", { base: "cogito", open: true }],
  ["malibu", "poolside", "Malibu", "code text", { base: "malibu", bare: true }],
  ["swe", "cognition", "SWE / Devin", "code text", { base: String.raw`swe-\d|devin` }],
  ["composer", "cursor", "Composer", "code text", { base: String.raw`composer(?=[-_ ]?\d)` }],
  ["xgen", "salesforce", "xGen / SFR", "text code embedding", { base: "xgen|sfr-embedding|codegen|codet5", open: true }],
  ["evollm", "sakana", "Sakana models", "text image", { base: "evollm|tinyswallow|evosdxl", open: true }],
  ["falcon", "tii", "Falcon", "text code", { base: "falcon", tiers: ["h1", "e", "mamba", "edge"], open: true }],
  ["jais", "g42", "JAIS / NANDA", "text", { base: "jais|nanda", open: true }],

  // ---------------------------------------------------------- Asia-Pacific labs
  ["ernie", "baidu", "ERNIE", "text code", { base: "ernie|wenxin", open: true }],
  ["irag", "baidu", "iRAG", "image", { base: "irag" }],
  ["spark", "iflytek", "iFlytek Spark", "text speech", { base: "spark(?:desk)?(?=[-_. ]?(?:\\d|max|lite|pro|ultra))" }],
  ["pangu", "huawei", "PanGu", "text code", { base: "(?:open)?pangu", open: true }],
  ["step", "stepfun", "Step", "text code", { base: String.raw`step(?:-|\d)`, tiers: ["r", "1o", "2", "3"], open: true }],
  ["step-audio", "stepfun", "Step-Audio", "speech audio", { base: "step-audio", open: true }],
  ["step-video", "stepfun", "Step-Video", "video", { base: "step-video", open: true }],
  ["kling", "kuaishou", "Kling", "video image audio", { base: "kling", tiers: ["omni", "motion"] }],
  ["kolors", "kuaishou", "Kolors", "image", { base: "kolors", open: true }],
  ["keye", "kuaishou", "Keye", "text image video", { base: "keye", open: true }],
  ["vidu", "shengshu", "Vidu", "video audio", { base: "vidu", tiers: ["q1", "q2", "q3", "reference", "drama", "ad"] }],
  ["ling", "ant", "Ling / Ring / Bailing", "text code", { base: "ling|ring|bailing", open: true }],
  ["mimo", "xiaomi", "MiMo", "text code", { base: "mimo", open: true }],
  ["yi", "01ai", "Yi", "text code", { base: String.raw`yi(?=[-_.]?(?:\d|large|lightning|vision|coder))`, open: true }],
  ["baichuan", "baichuan", "Baichuan", "text code", { base: "baichuan", open: true }],
  ["internlm", "shanghai-ai-lab", "InternLM / InternVL", "text code", { base: "intern(?:lm|vl|vid|video|s\\d|-s\\d)", open: true }],
  ["minicpm", "openbmb", "MiniCPM", "text code", { base: "minicpm", open: true }],
  ["skywork", "skywork", "Skywork / SkyReels / Matrix", "text image video world 3d", { base: "skywork|skyreels|matrix-game|skycaptioner", open: true }],
  ["dots", "rednote", "dots", "text code", { base: String.raw`dots\.?(?:llm|ocr|vlm)`, open: true }],
  ["solar", "upstage", "Solar", "text code embedding", { base: "solar", tiers: ["pro", "mini", "docvision"], open: true }],
  ["exaone", "lg", "EXAONE", "text code", { base: "exaone", open: true }],
  ["hyperclova", "naver", "HyperCLOVA X", "text code speech", { base: "hyperclova", open: true }],
  ["kanana", "kakao", "Kanana", "text", { base: "kanana", open: true }],
  ["rakutenai", "rakuten", "RakutenAI", "text", { base: "rakutenai", open: true }],
  ["sarashina", "sbintuitions", "Sarashina", "text", { base: "sarashina", open: true }],
  ["plamo", "pfn", "PLaMo", "text", { base: "plamo", open: true }],
  ["tsuzumi", "ntt", "tsuzumi", "text", { base: "tsuzumi" }],
  ["takane", "fujitsu", "Takane", "text", { base: "takane" }],
  ["elyza", "elyza", "ELYZA", "text", { base: "elyza", open: true }],
  ["sarvam", "sarvam", "Sarvam", "text speech", { base: "sarvam", open: true }],
  ["krutrim", "krutrim", "Krutrim", "text speech", { base: "krutrim", open: true }],

  // ------------------------------------------------------------- Europe / other
  ["pharia", "aleph-alpha", "Pharia / Luminous", "text", { base: "pharia|luminous", open: true }],
  ["modernbert", "lighton", "ModernBERT / Alfred", "embedding text", { base: "modernbert|alfred-", open: true }],
  ["moshi", "kyutai", "Moshi / Helium / Hibiki", "speech audio text", { base: "moshi|helium|hibiki", open: true }],
  ["holo", "h-company", "Holo / Runner H", "text", { base: "holo\\d|runner-h", open: true }],
  ["poro", "silo", "Poro / Viking", "text", { base: "poro|viking-\\d", open: true }],
  ["yandexgpt", "yandex", "YandexGPT", "text speech", { base: "yandexgpt|yalm" }],
  ["gigachat", "sber", "GigaChat", "text", { base: "gigachat", open: true }],
  ["kandinsky", "sber", "Kandinsky", "image video", { base: "kandinsky", open: true }],
  ["sabia", "maritaca", "Sabiá", "text", { base: "sabi(?:a|á)" }],

  // ---------------------------------------------------------------- image labs
  ["flux", "bfl", "FLUX", "image video", { base: String.raw`flux`, tiers: ["schnell", "dev", "kontext", "krea", "klein", "fill", "canny", "depth", "redux", "raw"], open: true }],
  ["stable-diffusion", "stability", "Stable Diffusion", "image", { base: String.raw`stable-diffusion|sd-?(?:xl|3|35|15|turbo)|sdxl|stable-image|stable-cascade`, open: true }],
  ["stable-video", "stability", "Stable Video Diffusion", "video", { base: "stable-video|svd", open: true }],
  ["stable-audio", "stability", "Stable Audio", "music audio", { base: "stable-audio", open: true }],
  ["stable-3d", "stability", "Stable 3D", "3d", { base: "sv3d|stable-(?:fast-)?3d|stable-point-aware|spar3d", open: true }],
  ["midjourney", "midjourney", "Midjourney", "image video", { base: "midjourney|niji", tiers: ["v", "niji"] }],
  ["ideogram", "ideogram", "Ideogram", "image", { base: "ideogram" }],
  ["recraft", "recraft", "Recraft", "image", { base: "recraft" }],
  ["leonardo", "leonardo", "Leonardo Phoenix / Lucid", "image video", { base: "leonardo|phoenix|lucid-(?:origin|realism|dream)" }],
  ["firefly", "adobe", "Adobe Firefly", "image video audio 3d", { base: "firefly" }],
  ["playground-v", "playground", "Playground", "image", { base: "playground-v", open: true }],
  ["mystic", "freepik", "Freepik Mystic", "image video", { base: "mystic|freepik" }],
  ["krea", "krea", "Krea", "image video", { base: String.raw`krea(?=[-_ ]?(?:\d|realtime|flux|video))` }],
  ["hidream", "hidream", "HiDream", "image video", { base: "hidream", open: true }],
  ["bria", "bria", "Bria", "image", { base: "bria", open: true }],

  // ---------------------------------------------------------------- video labs
  ["runway-gen", "runway", "Runway Gen", "video image", { base: String.raw`gen-?[234]|runway`, tiers: ["alpha", "turbo", "aleph", "frames", "act"] }],
  ["runway-gwm", "runway", "Runway GWM", "world video", { base: "gwm" }],
  ["ray", "luma", "Luma Ray", "video", { base: String.raw`ray(?=[-_ ]?(?:\d|flash))|dream-machine` }],
  ["photon", "luma", "Luma Photon", "image", { base: "photon" }],
  ["luma-genie", "luma", "Luma Genie", "3d", { base: "luma-genie" }],
  ["pika", "pika", "Pika", "video", { base: "pika", tiers: ["scenes", "effects", "affect"] }],
  ["pixverse", "pixverse", "PixVerse", "video", { base: "pixverse" }],
  ["ltx", "lightricks", "LTX-Video", "video image", { base: "ltx(?:v|-video)?", open: true }],
  ["mochi", "genmo", "Mochi", "video", { base: "mochi", open: true }],
  ["marey", "moonvalley", "Marey", "video", { base: "marey", bare: true }],
  ["higgsfield", "higgsfield", "Higgsfield", "video image", { base: "higgsfield|hf-soul|popcorn" }],
  ["hedra-character", "hedra", "Hedra Character", "video audio", { base: String.raw`character-\d` }],
  ["avatar-iv", "heygen", "HeyGen Avatar", "video", { base: "avatar-(?:iv|v\\d)|heygen" }],
  ["synthesia-express", "synthesia", "Synthesia Express", "video", { base: "express-\\d|synthesia" }],
  ["d-id", "d-id", "D-ID", "video", { base: "d-id" }],
  ["starlight", "topaz", "Topaz Starlight", "video image", { base: "starlight|gigapixel|topaz" }],
  ["viggle", "viggle", "Viggle", "video", { base: "viggle" }],
  ["lucy", "decart", "Decart Lucy / Oasis", "video world", { base: "lucy-\\d|oasis-?\\d|decart" }],
  ["odyssey", "odyssey", "Odyssey", "world video", { base: String.raw`odyssey(?=[-_ ]?\d)` }],
  ["marble", "worldlabs", "Marble / RTFM", "world 3d", { base: "marble|rtfm", bare: true }],

  // ---------------------------------------------------------------- audio labs
  ["eleven", "elevenlabs", "ElevenLabs", "speech audio music", { base: String.raw`eleven(?:_|-)?(?:v\d|multilingual|turbo|flash|english|monolingual|music|labs)|scribe`, tiers: ["v3", "turbo", "flash", "music"] }],
  ["suno", "suno", "Suno", "music audio", { base: "suno|chirp|bark" }],
  ["udio", "udio", "Udio", "music audio", { base: "udio" }],
  ["sonic", "cartesia", "Cartesia Sonic", "speech audio", { base: String.raw`sonic(?=[-_ ]?(?:\d|turbo|english|multilingual|preview))|cartesia` }],
  ["playdialog", "playai", "PlayAI PlayDialog", "speech", { base: "playdialog|playht|play-?\\d" }],
  ["octave", "hume", "Hume Octave / EVI", "speech audio", { base: "octave|evi-?\\d" }],
  ["chatterbox", "resemble", "Chatterbox", "speech audio", { base: "chatterbox", open: true, bare: true }],
  ["deepgram-nova", "deepgram", "Deepgram Nova / Aura", "speech audio", { base: String.raw`nova-[23]|aura(?=[-_ ]?\d)` }],
  ["universal", "assemblyai", "AssemblyAI Universal", "speech", { base: "universal-(?:\\d|streaming)|slam-\\d" }],
  ["ursa", "speechmatics", "Speechmatics Ursa", "speech", { base: "ursa" }],
  ["reverb", "rev", "Rev Reverb", "speech", { base: "reverb" }],
  ["fish-speech", "fish-audio", "Fish Speech / OpenAudio", "speech audio", { base: "fish-speech|openaudio|fish-audio", open: true }],
  ["csm", "sesame", "Sesame CSM", "speech", { base: "csm-\\d|sesame", open: true }],
  ["higgs-audio", "boson", "Higgs Audio", "speech audio", { base: "higgs-audio", open: true }],
  ["mistv", "rime", "Rime Mist / Arcana", "speech", { base: "mistv\\d|arcana|rime" }],
  ["mars", "camb", "Camb MARS / BOLI", "speech", { base: "mars-?\\d|boli" }],
  ["inworld-tts", "inworld", "Inworld TTS", "speech", { base: "inworld-tts" }],
  ["neuphonic", "neuphonic", "Neuphonic", "speech", { base: "neuphonic|neu_" }],
  ["mureka", "mureka", "Mureka", "music audio", { base: "mureka" }],
  ["beatoven", "beatoven", "Beatoven", "music", { base: "beatoven" }],

  // ------------------------------------------------------------------ 3D labs
  ["meshy", "meshy", "Meshy", "3d", { base: "meshy" }],
  ["tripo", "tripo", "Tripo", "3d", { base: "tripo(?:sr|sg|sf)?", open: true }],
  ["rodin", "hyper3d", "Hyper3D Rodin", "3d", { base: "rodin|hyper3d" }],
  ["cube", "csm", "CSM Cube", "3d world", { base: "cube-?\\d|csm-cube", open: true }],
  ["sloyd", "sloyd", "Sloyd", "3d", { base: "sloyd" }],
  ["kaedim", "kaedim", "Kaedim", "3d", { base: "kaedim" }],
  ["backflip", "backflip", "Backflip", "3d", { base: "backflip" }],

  // ------------------------------------------------------- retrieval families
  ["voyage", "voyage", "Voyage", "embedding rerank", { base: "voyage|rerank-2" }],
  ["jina", "jina", "Jina", "embedding rerank text", { base: "jina|readerlm", open: true }],
  ["mxbai", "mixedbread", "mxbai", "embedding rerank", { base: "mxbai", open: true }],
  ["bge", "baai", "BGE / Emu / Aquila", "embedding rerank image text", { base: "bge|emu\\d|aquila|altclip", open: true }],
  ["nomic-embed", "nomic", "Nomic Embed", "embedding text", { base: "nomic-embed|nomic-bert", open: true }],
  ["smollm", "huggingface", "SmolLM / SmolVLM", "text image", { base: "smol(?:lm|vlm|agents|talk)", open: true }],
];

export const FAMILIES: Family[] = SEEDS.map(([id, vendorId, name, modalities, spec]) =>
  build(id, vendorId, name, modalities, spec),
);

export const FAMILY_BY_ID = new Map(FAMILIES.map((family) => [family.id, family]));

/** Most specific head first, so `gpt-image` beats `gpt` and `seed-tts` beats `seed`. */
const SLUG_ORDER = [...FAMILIES].sort((a, b) => b.specificity - a.specificity);

export function familyFromSlug(slug: string): Family | undefined {
  const normalized = slug.toLowerCase();
  return SLUG_ORDER.find((family) => family.slug.test(normalized));
}

export function familiesForVendor(vendorId: string): Family[] {
  return FAMILIES.filter((family) => family.vendorId === vendorId);
}

/**
 * Mention patterns ordered most-specific first, so `GPT Image 2` is claimed by
 * the GPT Image family rather than by the broader GPT family.
 */
export function mentionPatterns(vendorId?: string): Family[] {
  const key = vendorId ?? "*";
  const cached = MENTION_CACHE.get(key);
  if (cached) return cached;
  const pool = vendorId ? familiesForVendor(vendorId) : FAMILIES;
  const ordered = [...pool].sort((a, b) => b.specificity - a.specificity);
  MENTION_CACHE.set(key, ordered);
  return ordered;
}

const MENTION_CACHE = new Map<string, Family[]>();

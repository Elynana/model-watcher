import type { Modality } from "../types.ts";

export interface Vendor {
  id: string;
  name: string;
  country: string;
  homepage: string;
  /** Tokens that identify this vendor inside a slug namespace or prose. */
  aliases: string[];
  /** Hugging Face organizations this vendor publishes weights under. */
  hfOrgs: string[];
  modalities: Modality[];
  tier: "frontier" | "major" | "specialist" | "platform";
}

type Seed = [
  id: string,
  name: string,
  country: string,
  homepage: string,
  aliases: string,
  hfOrgs: string,
  modalities: string,
  tier: Vendor["tier"],
];

/**
 * Every organization that publishes generative models under its own name.
 * `aliases` are matched against slug namespaces and prose; they must be
 * unambiguous, because they are the sole basis for definitive attribution.
 */
const SEEDS: Seed[] = [
  // ---------------------------------------------------------------- frontier
  ["openai", "OpenAI", "US", "https://openai.com", "openai oai chatgpt azure-openai", "openai openai-community", "text code image video audio speech embedding moderation", "frontier"],
  ["anthropic", "Anthropic", "US", "https://anthropic.com", "anthropic claude", "Anthropic", "text code", "frontier"],
  ["google", "Google DeepMind", "US", "https://deepmind.google", "google google-deepmind deepmind gemini vertex vertex-ai googleai", "google google-deepmind google-t5 timm", "text code image video audio speech music 3d world embedding", "frontier"],
  ["meta", "Meta AI", "US", "https://ai.meta.com", "meta meta-llama facebook llama fair", "meta-llama facebook", "text code image video audio speech embedding world", "frontier"],
  ["xai", "xAI", "US", "https://x.ai", "xai x-ai grok", "xai-org", "text code image video", "frontier"],
  ["mistral", "Mistral AI", "FR", "https://mistral.ai", "mistral mistralai codestral ministral magistral devstral pixtral", "mistralai", "text code image embedding moderation", "frontier"],
  ["deepseek", "DeepSeek", "CN", "https://deepseek.com", "deepseek deepseek-ai", "deepseek-ai", "text code image", "frontier"],
  ["alibaba", "Alibaba Cloud (Qwen)", "CN", "https://qwen.ai", "alibaba qwen dashscope tongyi bailian wan wanx aliyun", "Qwen Wan-AI Alibaba-NLP iic", "text code image video audio speech embedding rerank 3d", "frontier"],
  ["moonshot", "Moonshot AI", "CN", "https://moonshot.ai", "moonshot moonshotai kimi", "moonshotai", "text code", "frontier"],
  ["zai", "Z.ai (Zhipu AI)", "CN", "https://z.ai", "zai zhipu zhipuai glm chatglm bigmodel cogvideo cogview", "zai-org THUDM", "text code image video speech", "frontier"],
  ["minimax", "MiniMax", "CN", "https://minimax.io", "minimax hailuo abab", "MiniMaxAI MiniMax-AI", "text code video audio speech music", "frontier"],
  ["bytedance", "ByteDance Seed", "CN", "https://seed.bytedance.com", "bytedance seed seedance seedream seededit doubao volcengine ark", "ByteDance ByteDance-Seed", "text code image video audio speech music 3d", "frontier"],
  ["tencent", "Tencent Hunyuan", "CN", "https://hunyuan.tencent.com", "tencent hunyuan hunyuanvideo hunyuan3d", "tencent Tencent-Hunyuan tencent-hunyuan-community", "text code image video audio speech 3d world", "frontier"],

  // ------------------------------------------------------------------- major
  ["microsoft", "Microsoft", "US", "https://microsoft.com/ai", "microsoft msft phi mai azure-ai foundry vall-e maia", "microsoft", "text code image video audio speech embedding world", "major"],
  ["amazon", "Amazon", "US", "https://aws.amazon.com/ai", "amazon aws bedrock nova titan polly rekognition", "amazon amazon-agi", "text code image video audio speech embedding", "major"],
  ["nvidia", "NVIDIA", "US", "https://nvidia.com/ai", "nvidia nemotron nim cosmos edify parakeet canary fugatto riva groot", "nvidia", "text code image video audio speech music 3d world embedding rerank", "major"],
  ["cohere", "Cohere", "CA", "https://cohere.com", "cohere command aya rerank embed north", "CohereLabs CohereForAI", "text code embedding rerank", "major"],
  ["ai21", "AI21 Labs", "IL", "https://ai21.com", "ai21 jamba jurassic maestro", "ai21labs", "text code", "major"],
  ["ibm", "IBM", "US", "https://ibm.com/watsonx", "ibm watsonx granite", "ibm-granite ibm", "text code embedding", "major"],
  ["apple", "Apple", "US", "https://machinelearning.apple.com", "apple afm", "apple", "text image", "major"],
  ["baidu", "Baidu", "CN", "https://yiyan.baidu.com", "baidu ernie wenxin qianfan irag", "baidu", "text code image video speech", "major"],
  ["iflytek", "iFlytek", "CN", "https://xinghuo.xfyun.cn", "iflytek spark xinghuo xfyun", "iflytek", "text speech audio", "major"],
  ["huawei", "Huawei", "CN", "https://huaweicloud.com", "huawei pangu ascend openpangu", "IntervitensInc", "text code image video", "major"],
  ["stepfun", "StepFun", "CN", "https://stepfun.com", "stepfun step step-1 step-2 step-3", "stepfun-ai", "text code image video audio speech", "major"],
  ["kuaishou", "Kuaishou", "CN", "https://kling.ai", "kuaishou kling kwai kolors keye", "Kwai-Kolors Kwai-Keye", "video image audio", "major"],
  ["shengshu", "ShengShu Technology", "CN", "https://vidu.com", "shengshu vidu viduq", "shengshu", "video audio", "major"],
  ["ant", "Ant Group", "CN", "https://antgroup.com", "ant antgroup ling bailing inclusionai", "inclusionAI", "text code", "major"],
  ["xiaomi", "Xiaomi", "CN", "https://xiaomi.com", "xiaomi mimo", "XiaomiMiMo", "text code audio", "major"],
  ["01ai", "01.AI", "CN", "https://01.ai", "01-ai 01ai yi lingyiwanwu", "01-ai", "text code image", "major"],
  ["baichuan", "Baichuan AI", "CN", "https://baichuan-ai.com", "baichuan baichuan-inc", "baichuan-inc", "text code", "major"],
  ["shanghai-ai-lab", "Shanghai AI Laboratory", "CN", "https://internlm.org", "internlm intern shanghai-ai-lab opengvlab intern-s1", "internlm OpenGVLab", "text code image video", "major"],
  ["openbmb", "OpenBMB / ModelBest", "CN", "https://openbmb.cn", "openbmb minicpm modelbest", "openbmb", "text code image video", "major"],
  ["skywork", "Skywork AI (Kunlun)", "CN", "https://skywork.ai", "skywork kunlun matrix mureka", "Skywork", "text code image video music 3d world", "major"],
  ["rednote", "RedNote (Xiaohongshu)", "CN", "https://xiaohongshu.com", "rednote dots xiaohongshu", "rednote-hilab", "text code", "specialist"],
  ["tii", "Technology Innovation Institute", "AE", "https://falconllm.tii.ae", "tii falcon", "tiiuae", "text code image", "major"],
  ["g42", "G42 / Inception", "AE", "https://inceptioniai.org", "g42 inception jais nanda", "inceptionai core42", "text", "specialist"],

  // -------------------------------------------------------------- specialist
  ["perplexity", "Perplexity", "US", "https://perplexity.ai", "perplexity sonar pplx", "perplexity-ai", "text", "specialist"],
  ["reka", "Reka AI", "US", "https://reka.ai", "reka", "RekaAI", "text image video audio", "specialist"],
  ["liquid", "Liquid AI", "US", "https://liquid.ai", "liquid lfm liquidai", "LiquidAI", "text image audio", "specialist"],
  ["writer", "Writer", "US", "https://writer.com", "writer palmyra", "Writer", "text", "specialist"],
  ["databricks", "Databricks", "US", "https://databricks.com", "databricks dbrx", "databricks", "text code embedding", "specialist"],
  ["snowflake", "Snowflake", "US", "https://snowflake.com", "snowflake arctic cortex", "Snowflake", "text embedding", "specialist"],
  ["allenai", "Allen Institute for AI", "US", "https://allenai.org", "allenai ai2 olmo molmo tulu", "allenai", "text code image", "specialist"],
  ["eleuther", "EleutherAI", "US", "https://eleuther.ai", "eleutherai gpt-neox pythia", "EleutherAI", "text", "specialist"],
  ["nous", "Nous Research", "US", "https://nousresearch.com", "nous nousresearch hermes", "NousResearch", "text code", "specialist"],
  ["arcee", "Arcee AI", "US", "https://arcee.ai", "arcee afm trinity virtuoso maestro", "arcee-ai", "text code", "specialist"],
  ["prime-intellect", "Prime Intellect", "US", "https://primeintellect.ai", "prime-intellect intellect", "PrimeIntellect", "text", "specialist"],
  ["sakana", "Sakana AI", "JP", "https://sakana.ai", "sakana evollm tinyswallow", "SakanaAI", "text image", "specialist"],
  ["inception-labs", "Inception Labs", "US", "https://inceptionlabs.ai", "inception mercury", "InceptionAI", "text code", "specialist"],
  ["deep-cogito", "Deep Cogito", "US", "https://deepcogito.com", "cogito deepcogito", "deepcogito", "text code", "specialist"],
  ["poolside", "Poolside", "US", "https://poolside.ai", "poolside malibu", "", "code text", "specialist"],
  ["cognition", "Cognition", "US", "https://cognition.ai", "cognition devin swe-", "", "code text", "specialist"],
  ["cursor", "Cursor (Anysphere)", "US", "https://cursor.com", "cursor anysphere composer", "", "code text", "specialist"],
  ["salesforce", "Salesforce", "US", "https://salesforceairesearch.com", "salesforce xgen sfr codegen", "Salesforce", "text code embedding", "specialist"],
  ["thinking-machines", "Thinking Machines Lab", "US", "https://thinkingmachines.ai", "thinkingmachines tinker", "", "text", "specialist"],
  ["ssi", "Safe Superintelligence", "US", "https://ssi.inc", "ssi", "", "text", "specialist"],
  ["upstage", "Upstage", "KR", "https://upstage.ai", "upstage solar", "upstage", "text code embedding", "specialist"],
  ["lg", "LG AI Research", "KR", "https://lgresearch.ai", "lg exaone", "LGAI-EXAONE", "text code image", "specialist"],
  ["naver", "Naver", "KR", "https://clova.ai", "naver hyperclova clova", "naver-hyperclovax", "text code speech", "specialist"],
  ["kakao", "Kakao", "KR", "https://kakaocorp.com", "kakao kanana", "kakaocorp", "text", "specialist"],
  ["rakuten", "Rakuten", "JP", "https://global.rakuten.com", "rakuten rakutenai", "Rakuten", "text", "specialist"],
  ["sbintuitions", "SB Intuitions (SoftBank)", "JP", "https://sbintuitions.co.jp", "sbintuitions sarashina", "sbintuitions", "text", "specialist"],
  ["pfn", "Preferred Networks", "JP", "https://preferred.jp", "pfnet plamo preferred", "pfnet", "text", "specialist"],
  ["ntt", "NTT", "JP", "https://ntt.com", "ntt tsuzumi", "", "text", "specialist"],
  ["fujitsu", "Fujitsu", "JP", "https://fujitsu.com", "fujitsu takane", "", "text", "specialist"],
  ["elyza", "ELYZA", "JP", "https://elyza.ai", "elyza", "elyza", "text", "specialist"],
  ["sarvam", "Sarvam AI", "IN", "https://sarvam.ai", "sarvam", "sarvamai", "text speech", "specialist"],
  ["krutrim", "Krutrim (Ola)", "IN", "https://olakrutrim.com", "krutrim ola", "krutrim-ai-labs", "text speech", "specialist"],
  ["aleph-alpha", "Aleph Alpha", "DE", "https://aleph-alpha.com", "aleph-alpha luminous pharia", "Aleph-Alpha", "text", "specialist"],
  ["lighton", "LightOn", "FR", "https://lighton.ai", "lighton alfred modernbert", "lightonai", "text embedding", "specialist"],
  ["kyutai", "Kyutai", "FR", "https://kyutai.org", "kyutai moshi helium hibiki", "kyutai", "speech audio text", "specialist"],
  ["h-company", "H Company", "FR", "https://hcompany.ai", "hcompany holo runner", "Hcompany", "text", "specialist"],
  ["silo", "Silo AI / AMD", "FI", "https://silo.ai", "silo poro viking", "LumiOpen", "text", "specialist"],
  ["yandex", "Yandex", "RU", "https://yandex.cloud", "yandex yandexgpt yalm", "yandex", "text speech", "specialist"],
  ["sber", "Sber", "RU", "https://sber.ru", "sber gigachat kandinsky sberbank", "ai-forever sberbank-ai", "text image video", "specialist"],
  ["maritaca", "Maritaca AI", "BR", "https://maritaca.ai", "maritaca sabia", "maritaca-ai", "text", "specialist"],

  // ------------------------------------------------------ image / video labs
  ["bfl", "Black Forest Labs", "DE", "https://bfl.ai", "bfl black-forest-labs flux blackforestlabs", "black-forest-labs", "image video", "major"],
  ["stability", "Stability AI", "GB", "https://stability.ai", "stability stabilityai stable-diffusion sdxl sd3 stable-audio stable-video", "stabilityai", "image video audio music 3d", "major"],
  ["midjourney", "Midjourney", "US", "https://midjourney.com", "midjourney mj niji", "midjourney", "image video", "major"],
  ["ideogram", "Ideogram", "CA", "https://ideogram.ai", "ideogram", "ideogram-ai", "image", "specialist"],
  ["recraft", "Recraft", "US", "https://recraft.ai", "recraft", "recraft", "image", "specialist"],
  ["leonardo", "Leonardo.Ai", "AU", "https://leonardo.ai", "leonardo phoenix lucid", "Leonardo", "image video", "specialist"],
  ["adobe", "Adobe", "US", "https://adobe.com/firefly", "adobe firefly", "adobe", "image video audio 3d", "major"],
  ["playground", "Playground AI", "US", "https://playground.com", "playgroundai playground-v", "playgroundai", "image", "specialist"],
  ["freepik", "Freepik", "ES", "https://freepik.com", "freepik mystic", "freepik", "image video", "specialist"],
  ["krea", "Krea AI", "US", "https://krea.ai", "krea", "krea-ai", "image video", "specialist"],
  ["hidream", "HiDream / Vivago", "CN", "https://hidreamai.com", "hidream vivago", "HiDream-ai", "image video", "specialist"],
  ["bria", "Bria AI", "IL", "https://bria.ai", "bria", "briaai", "image", "specialist"],
  ["shakker", "Shakker Labs", "CN", "https://shakker.ai", "shakker seaart", "Shakker-Labs", "image", "specialist"],
  ["runway", "Runway", "US", "https://runwayml.com", "runway runwayml gen-3 gen-4 gwm act-two", "runwayml", "video image world audio", "major"],
  ["luma", "Luma AI", "US", "https://lumalabs.ai", "luma lumalabs ray photon genie dream-machine", "LumaAI", "video image 3d", "major"],
  ["pika", "Pika Labs", "US", "https://pika.art", "pika pikalabs pikaffects", "", "video", "specialist"],
  ["pixverse", "PixVerse (AIsphere)", "CN", "https://pixverse.ai", "pixverse", "", "video", "specialist"],
  ["lightricks", "Lightricks", "IL", "https://lightricks.com", "lightricks ltx ltxv", "Lightricks", "video image", "specialist"],
  ["genmo", "Genmo", "US", "https://genmo.ai", "genmo mochi", "genmo", "video", "specialist"],
  ["moonvalley", "Moonvalley", "CA", "https://moonvalley.com", "moonvalley marey", "", "video", "specialist"],
  ["higgsfield", "Higgsfield AI", "US", "https://higgsfield.ai", "higgsfield", "higgsfield", "video image", "specialist"],
  ["hedra", "Hedra", "US", "https://hedra.com", "hedra character-3", "", "video audio", "specialist"],
  ["heygen", "HeyGen", "US", "https://heygen.com", "heygen avatar-iv", "", "video", "specialist"],
  ["synthesia", "Synthesia", "GB", "https://synthesia.io", "synthesia express-", "", "video", "specialist"],
  ["d-id", "D-ID", "IL", "https://d-id.com", "d-id did", "", "video", "specialist"],
  ["topaz", "Topaz Labs", "US", "https://topazlabs.com", "topaz starlight gigapixel", "", "video image", "specialist"],
  ["viggle", "Viggle AI", "CA", "https://viggle.ai", "viggle", "", "video", "specialist"],
  ["captions", "Captions", "US", "https://captions.ai", "captions mirage", "", "video", "specialist"],
  ["decart", "Decart", "IL", "https://decart.ai", "decart lucy mirage oasis", "decart-ai", "video world", "specialist"],
  ["odyssey", "Odyssey", "US", "https://odyssey.world", "odyssey", "", "world video", "specialist"],
  ["worldlabs", "World Labs", "US", "https://worldlabs.ai", "worldlabs marble rtfm", "", "world 3d", "specialist"],

  // --------------------------------------------------------- audio / speech
  ["elevenlabs", "ElevenLabs", "US", "https://elevenlabs.io", "elevenlabs eleven eleven-labs scribe", "elevenlabs", "speech audio music", "major"],
  ["suno", "Suno", "US", "https://suno.com", "suno chirp bark", "suno", "music audio", "major"],
  ["udio", "Udio", "US", "https://udio.com", "udio", "", "music audio", "specialist"],
  ["cartesia", "Cartesia", "US", "https://cartesia.ai", "cartesia sonic", "cartesia-ai", "speech audio", "specialist"],
  ["playai", "PlayAI (PlayHT)", "US", "https://play.ai", "playai playht play-ht playdialog", "PlayHT", "speech", "specialist"],
  ["hume", "Hume AI", "US", "https://hume.ai", "hume octave evi", "", "speech audio", "specialist"],
  ["resemble", "Resemble AI", "CA", "https://resemble.ai", "resemble chatterbox", "ResembleAI", "speech audio", "specialist"],
  ["deepgram", "Deepgram", "US", "https://deepgram.com", "deepgram aura nova-2 nova-3", "", "speech audio", "specialist"],
  ["assemblyai", "AssemblyAI", "US", "https://assemblyai.com", "assemblyai universal-", "", "speech", "specialist"],
  ["speechmatics", "Speechmatics", "GB", "https://speechmatics.com", "speechmatics ursa", "", "speech", "specialist"],
  ["rev", "Rev AI", "US", "https://rev.ai", "revai rev-ai reverb", "revai", "speech", "specialist"],
  ["fish-audio", "Fish Audio", "CN", "https://fish.audio", "fish-audio fish-speech openaudio", "fishaudio", "speech audio", "specialist"],
  ["sesame", "Sesame AI", "US", "https://sesame.com", "sesame csm maya", "sesame", "speech", "specialist"],
  ["boson", "Boson AI", "US", "https://boson.ai", "boson higgs-audio", "bosonai", "speech audio", "specialist"],
  ["lmnt", "LMNT", "US", "https://lmnt.com", "lmnt blizzard", "", "speech", "specialist"],
  ["rime", "Rime Labs", "US", "https://rime.ai", "rime mistv arcana", "", "speech", "specialist"],
  ["neuphonic", "Neuphonic", "GB", "https://neuphonic.com", "neuphonic neu-", "neuphonic", "speech", "specialist"],
  ["camb", "Camb.ai", "AE", "https://camb.ai", "cambai camb-ai mars boli", "", "speech", "specialist"],
  ["inworld", "Inworld AI", "US", "https://inworld.ai", "inworld", "inworld-ai", "speech text", "specialist"],
  ["papla", "Papla Media", "PL", "https://papla.media", "papla", "", "speech", "specialist"],
  ["mureka", "Mureka (Kunlun)", "CN", "https://mureka.ai", "mureka", "", "music audio", "specialist"],
  ["beatoven", "Beatoven.ai", "IN", "https://beatoven.ai", "beatoven", "", "music", "specialist"],

  // ------------------------------------------------------------- 3D / world
  ["meshy", "Meshy", "US", "https://meshy.ai", "meshy", "", "3d", "specialist"],
  ["tripo", "Tripo AI (VAST)", "CN", "https://tripo3d.ai", "tripo triposr triposg tripo3d", "VAST-AI", "3d", "specialist"],
  ["hyper3d", "Hyper3D (Deemos)", "CN", "https://hyper3d.ai", "hyper3d rodin deemos", "deemos", "3d", "specialist"],
  ["csm", "Common Sense Machines", "US", "https://csm.ai", "csm cube", "csm-ai", "3d world", "specialist"],
  ["sloyd", "Sloyd", "IS", "https://sloyd.ai", "sloyd", "", "3d", "specialist"],
  ["kaedim", "Kaedim", "GB", "https://kaedim3d.com", "kaedim", "", "3d", "specialist"],
  ["spline", "Spline", "US", "https://spline.design", "spline", "", "3d", "specialist"],
  ["backflip", "Backflip AI", "US", "https://backflip.ai", "backflip", "", "3d", "specialist"],

  // ------------------------------------------------- retrieval / embeddings
  ["voyage", "Voyage AI (MongoDB)", "US", "https://voyageai.com", "voyage voyageai", "voyageai", "embedding rerank", "specialist"],
  ["jina", "Jina AI", "DE", "https://jina.ai", "jina jinaai", "jinaai", "embedding rerank text", "specialist"],
  ["mixedbread", "Mixedbread", "DE", "https://mixedbread.com", "mixedbread mxbai", "mixedbread-ai", "embedding rerank", "specialist"],
  ["baai", "BAAI", "CN", "https://baai.ac.cn", "baai bge emu aquila", "BAAI", "embedding rerank image text", "specialist"],
  ["nomic", "Nomic AI", "US", "https://nomic.ai", "nomic nomic-embed", "nomic-ai", "embedding text", "specialist"],

  // ---------------------------------------------------- platforms / routers
  ["openrouter", "OpenRouter", "US", "https://openrouter.ai", "openrouter", "", "text image", "platform"],
  ["huggingface", "Hugging Face", "US", "https://huggingface.co", "huggingface hf smollm smolvlm", "HuggingFaceTB HuggingFaceM4", "text image code embedding", "platform"],
  ["replicate", "Replicate", "US", "https://replicate.com", "replicate", "", "image video audio text 3d", "platform"],
  ["fal", "fal.ai", "US", "https://fal.ai", "fal fal-ai", "", "image video audio speech music 3d", "platform"],
  ["together", "Together AI", "US", "https://together.ai", "together togethercomputer", "togethercomputer", "text image code", "platform"],
  ["fireworks", "Fireworks AI", "US", "https://fireworks.ai", "fireworks", "fireworks-ai", "text image audio", "platform"],
  ["groq", "Groq", "US", "https://groq.com", "groq groqcloud", "", "text speech", "platform"],
  ["cerebras", "Cerebras", "US", "https://cerebras.ai", "cerebras", "cerebras", "text", "platform"],
  ["sambanova", "SambaNova", "US", "https://sambanova.ai", "sambanova", "sambanovasystems", "text", "platform"],
  ["deepinfra", "DeepInfra", "US", "https://deepinfra.com", "deepinfra", "", "text image audio", "platform"],
  ["novita", "Novita AI", "SG", "https://novita.ai", "novita", "", "text image video audio", "platform"],
  ["nebius", "Nebius AI Studio", "NL", "https://nebius.com", "nebius", "", "text image", "platform"],
  ["chutes", "Chutes (Bittensor)", "US", "https://chutes.ai", "chutes", "", "text image", "platform"],
  ["siliconflow", "SiliconFlow", "CN", "https://siliconflow.com", "siliconflow", "", "text image video audio", "platform"],
  ["baseten", "Baseten", "US", "https://baseten.co", "baseten", "", "text speech", "platform"],
  ["vercel", "Vercel AI Gateway", "US", "https://vercel.com/ai-gateway", "vercel v0", "", "text image", "platform"],
  ["cloudflare", "Cloudflare Workers AI", "US", "https://developers.cloudflare.com/workers-ai", "cloudflare workers-ai", "", "text image speech embedding", "platform"],
  ["ollama", "Ollama", "US", "https://ollama.com", "ollama", "", "text image embedding", "platform"],
  ["lmstudio", "LM Studio", "US", "https://lmstudio.ai", "lmstudio lm-studio", "lmstudio-community", "text", "platform"],
  ["github", "GitHub Models", "US", "https://github.com/marketplace/models", "github github-models copilot", "", "text image embedding", "platform"],
  ["poe", "Poe (Quora)", "US", "https://poe.com", "poe quora", "", "text image video", "platform"],
  ["aimlapi", "AI/ML API", "US", "https://aimlapi.com", "aiml aimlapi", "", "text image video audio", "platform"],
  ["clarifai", "Clarifai", "US", "https://clarifai.com", "clarifai", "", "text image", "platform"],
  ["venice", "Venice AI", "US", "https://venice.ai", "venice", "", "text image", "platform"],
  ["scaleway", "Scaleway", "FR", "https://scaleway.com", "scaleway", "", "text embedding", "platform"],
  ["ovh", "OVHcloud", "FR", "https://ovhcloud.com", "ovh ovhcloud", "", "text", "platform"],
  ["modelscope", "ModelScope", "CN", "https://modelscope.cn", "modelscope", "", "text image video audio", "platform"],
];

function toVendor(seed: Seed): Vendor {
  const [id, name, country, homepage, aliases, hfOrgs, modalities, tier] = seed;
  return {
    id,
    name,
    country,
    homepage,
    aliases: [id, ...aliases.split(" ")].filter(Boolean),
    hfOrgs: hfOrgs.split(" ").filter(Boolean),
    modalities: modalities.split(" ").filter(Boolean) as Modality[],
    tier,
  };
}

export const VENDORS: Vendor[] = SEEDS.map(toVendor);

export const VENDOR_BY_ID = new Map(VENDORS.map((vendor) => [vendor.id, vendor]));

/** alias token -> vendor. Longest alias wins when several match a namespace. */
export const VENDOR_BY_ALIAS = (() => {
  const index = new Map<string, Vendor>();
  for (const vendor of VENDORS) {
    for (const alias of vendor.aliases) {
      const key = alias.toLowerCase();
      const existing = index.get(key);
      if (!existing || existing.tier === "platform") index.set(key, vendor);
    }
  }
  return index;
})();

const ALIAS_TOKENS = [...VENDOR_BY_ALIAS.keys()].sort((a, b) => b.length - a.length);

/** Resolves a namespace, org name, or free-text owner string to a vendor. */
export function vendorFromToken(token: string | undefined): Vendor | undefined {
  if (!token) return undefined;
  const normalized = token.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const direct = VENDOR_BY_ALIAS.get(normalized);
  if (direct) return direct;
  const compact = normalized.replace(/-/g, "");
  for (const alias of ALIAS_TOKENS) {
    if (alias.replace(/-/g, "") === compact) return VENDOR_BY_ALIAS.get(alias);
  }
  return undefined;
}

/** Resolves a Hugging Face organization to its publishing vendor. */
export function vendorFromHuggingFaceOrg(org: string): Vendor | undefined {
  const lower = org.toLowerCase();
  for (const vendor of VENDORS) {
    if (vendor.hfOrgs.some((candidate) => candidate.toLowerCase() === lower)) return vendor;
  }
  return vendorFromToken(org);
}

export const HUGGINGFACE_ORGS: Array<{ org: string; vendorId: string }> = VENDORS.flatMap((vendor) =>
  vendor.hfOrgs.map((org) => ({ org, vendorId: vendor.id })),
);

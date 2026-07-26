# Model Watcher

A Discord bot and release watcher for generative AI. It tracks **every major
publisher across every generative modality** — language, code, image, video,
audio, speech, music, 3D, world models, embeddings, and reranking — and answers
with **exact model slugs** rather than prose.

Every output is definitive: a slug is quoted exactly as its publisher wrote it,
attributed to the company that actually built it, and backed by a link to the
source it was read from. Anything a source did not publish is reported as
"not published" instead of being inferred.

```
NEW MODEL · Claude Opus 4.6
Anthropic · Claude · v4.6 · opus · generally available
Slug: claude-opus-4-6
Published: 2026-02-05

Modalities   📝 text  🖼️ image      Release channel   generally available
Context      200,000 in · 128,000 out                 Pricing  input $5/M · output $25/M
Evidence     1. catalog:models-dev · catalog
```

## What it knows

| Registry | Size | Purpose |
|---|---:|---|
| Publishers | 169 | 142 model publishers plus 27 hosting platforms, each with country, home page, slug aliases, and Hugging Face organizations |
| Model families | 215 | Slug grammars per family, so `gpt-image-1` is GPT Image and `seed-tts-2` is ByteDance's Seed-TTS |
| Sources | 307 | First-party APIs, official pages and feeds, open-weights orgs, multi-vendor catalogs, and arenas |
| Modalities | 12 | text · code · image · video · audio · speech · music · 3d · world · embedding · rerank · moderation |

A first run currently seeds **7,769 distinct models from 115 publishers** — 7,064 with a
verified publisher, across all twelve modalities.

## Definitive by construction

The watcher's core is a slug parser and a publisher/family taxonomy. Together
they turn any identifier — however a reseller, cloud, or router mangles it —
into one canonical record.

| Observed identifier | Canonical slug | Publisher |
|---|---|---|
| `us.anthropic.claude-opus-4-6-v1:0` | `claude-opus-4-6` | Anthropic |
| `databricks-claude-opus-4-6` | `claude-opus-4-6` | Anthropic |
| `publishers/google/models/veo-3.1-fast-generate-001` | `veo-3.1-fast-generate-001` | Google DeepMind |
| `fal-ai/flux/dev` | `flux/dev` | Black Forest Labs |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | `llama-4-scout-17b-16e-instruct` | Meta AI |
| `nvidia/llama-3.3-nemotron-super-49b` | `llama-3.3-nemotron-super-49b` | NVIDIA |

Rules that keep output definitive:

- **Hosting is not authorship.** A platform in the namespace says where a model
  is served. `fal-ai/flux/dev` is a Black Forest Labs model.
- **Reselling is not publishing.** `databricks-claude-opus-4-6` collapses onto
  Anthropic's slug instead of announcing a second release.
- **Derivatives are not releases.** Quantizations (`-GGUF`, `-NVFP4`, `-AWQ`)
  and community re-uploads (`-abliterated`, `-merged`) never enter the catalog.
- **Pointers are not new models.** Dated snapshots (`-20260217`) and rolling
  aliases (`-latest`, `@default`) are classified as such and demoted to the
  daily digest.
- **Prose needs a grammar.** Pages and feeds are read only through registered
  family patterns, so a table header or a bare brand word can never be reported
  as a release, and a tier without a version ("Imagen Pro") names a line-up
  rather than a model.
- **An announcement is not an identifier.** A name that no source has published
  as a slug goes to the digest, never to an immediate alert. It merges into the
  real record — and is announced properly — once an identifier appears.
- **Unknown stays unknown.** An arena codename with no publisher is labelled
  unattributed, and no capability is asserted for it.

Each model carries structured parts read straight out of its slug: version,
tier, qualifiers, parameter count, active MoE parameters, expert count, dated
snapshot, quantization, release channel, and identifier class.

## Discord commands

Run the bot with a token and it registers these:

| Command | Answer |
|---|---|
| `/model <slug>` | Full record: publisher, family, version, channel, modalities, context, pricing, availability, every known slug spelling, and evidence links |
| `/slugs [vendor] [modality] [family]` | A bare, copy-pasteable slug list |
| `/vendor <name>` | One company's tracked models grouped by modality |
| `/new [hours] [modality] [vendor]` | Models first detected in a window |
| `/latest <family>` | Current head of a family, GA preferred over preview |
| `/compare <a> <b>` | Two models side by side |
| `/parse <slug>` | Decomposes any identifier, tracked or not |
| `/search <query>` | Find by slug, name, family, or publisher |
| `/stealth` | Unannounced arena codenames with no verified publisher |
| `/vendors [modality] [country]` | Every registered AI company |
| `/families [vendor]` | The model-family taxonomy |
| `/coverage` | Source health and publisher coverage |
| `/watch` · `/unwatch` | Per-channel subscriptions by publisher, modality, family, and importance |

Slug, vendor, and family options autocomplete from live state.

## Alert behaviour

- New families, versions, modality and capability changes, availability,
  pricing, limits, and lifecycle changes post immediately.
- Snapshots, aliases, back-references to older generations, blog-only
  announcements with no published identifier, and documentation-only changes
  enter a daily digest after 09:00 America/New_York.
- First runs seed silently, including the first run of a newly added source.
- Removal requires three consecutive successful absences from an authoritative
  source. A failed or empty parse can never remove a model.
- Major alerts include a locally rendered 1200×675 PNG card built from the same
  evidence as the embed.
- Channels that ran `/watch` receive only what matches their filters; a plain
  webhook receives everything.

## Setup

### 1. Delivery

Either path works, and they can run together.

**Webhook only** (no server; GitHub Actions does the polling):
create a channel webhook and set `DISCORD_WEBHOOK_URL`.

**Full bot** (slash commands and subscriptions): create an application at
<https://discord.com/developers/applications>, invite it with the `bot` and
`applications.commands` scopes, then set `DISCORD_BOT_TOKEN` and
`DISCORD_APPLICATION_ID`. Setting `DISCORD_GUILD_ID` registers commands to one
server, which applies in seconds instead of up to an hour.

```bash
pnpm bot
```

The bot needs no gateway intents — slash commands are delivered regardless — so
no privileged intent has to be enabled.

### 2. Polling

Free GitHub Actions runs the watcher on a schedule and keeps state on a
`model-watcher-state` branch. No server, database, or paid API is required.

1. Fork this repository as a **public** repository.
2. Add `DISCORD_WEBHOOK_URL` (and optionally `DISCORD_BOT_TOKEN`) under
   Settings → Secrets and variables → Actions.
3. Enable Actions and run the `model-watcher` workflow once with mode `seed`.
4. Set the repository variable `SHADOW_MODE=1` for the first 48 hours to review
   proposed messages in the logs, then set it to `0`.

| Variable | Default | Purpose |
|---|---:|---|
| `SHADOW_MODE` | `0` | `1` prints alerts without contacting Discord |
| `IMAGE_CARDS` | `1` | `0` disables PNG attachments |
| `CONCURRENCY` | `6` | Parallel source fetches, 1–16 |

### 3. Optional API keys

**None are required.** 251 of the 307 sources run without any credential,
including models.dev, LiteLLM, OpenRouter, fal.ai, Vercel AI Gateway, GitHub
Models, Ollama, DeepInfra, Novita, Chutes, NanoGPT, 134 Hugging Face
organizations, and every official page and feed.

Adding a key upgrades that one publisher to first-party API evidence, which is
faster and higher-confidence than its public pages. Only read-only model
listing is ever requested. `.env.example` lists all 57 supported keys; add the
ones you already have as repository secrets under the same names.

## Local development

Requires Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dry
```

| Command | Effect |
|---|---|
| `pnpm dry` | Polls every source, prints proposed output, saves nothing |
| `pnpm seed` | Creates a silent local baseline in `data/state` |
| `pnpm watch` | Polls only sources whose intervals are due |
| `pnpm bot` | Registers slash commands and connects the gateway |
| `pnpm bot:register` | Registers slash commands and exits |
| `pnpm test` | Catalog, engine, parser, query, render, and bot-command tests |

Useful flags: `--only=<substring>` restricts the run to matching source ids,
`--force` ignores polling intervals, `--concurrency=N` sets parallelism.

State is sharded by publisher under `data/state/models/`, so a run that changes
three slugs rewrites one small file rather than a multi-megabyte blob.

## Adding coverage

Add a publisher to `src/catalog/vendors.ts` and its families to
`src/catalog/families.ts`; attribution, modality inference, `/vendor`,
`/families`, and Hugging Face polling all follow automatically.

Add a source to `src/sources/registry.ts` using an existing factory. Prefer, in
order:

1. A first-party structured API (`openAiCompatible`).
2. An official feed (`officialFeed`) or documentation page (`officialPage`).
3. An official Hugging Face organization — declare it on the vendor instead.
4. A multi-vendor catalog or platform.
5. A benchmark or arena, which is discovery-only evidence.

Every new parser needs a saved fixture in `test/fixtures/`. Set
`tracksRemovals: true` only for sources that return a complete authoritative
catalog; rolling feeds and leaderboards must leave it false.

## Limits

- GitHub schedules are best-effort and can be delayed.
- Launches announced only on social networks are detected once they reach a
  monitored public source.
- HTML layouts change. A failing source is isolated and cannot remove models.
- A few publishers block automated requests at their CDN edge; their models
  still arrive through catalogs and platforms.
- No deterministic parser means no inferred specification. Unknown is safer
  than a fabricated fact.

## License

MIT

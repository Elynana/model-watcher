# Model Watcher

A free, deterministic generative-AI release watcher. It runs on scheduled
GitHub Actions, keeps state in a Git branch, and posts readable alerts to one
Discord incoming webhook. There is no server, database, bot token, paid API,
external summarization service, or hosted image service.

## What it watches

The source registry combines:

- Official model APIs when an optional read-only key is available.
- Public official model pages and release notes.
- Official Hugging Face organizations.
- Free discovery catalogs such as OpenRouter and Artificial Analysis.

Initial coverage includes major language-model providers and frontier creative
families such as ByteDance Seedance/Seedream, ShengShu Vidu, Kuaishou Kling,
MiniMax Hailuo, Alibaba Qwen/Wan, Tencent Hunyuan, Runway, Luma, Pika,
PixVerse, FLUX, Stability AI, Midjourney, Suno, Udio, ElevenLabs, and 3D/world
model publishers.

Discovery sources cannot establish ownership. A benchmark-only model such as
HappyHorse is labeled **EMERGING — Unknown creator** until a first-party source
verifies it.

## Alert behavior

- New families, major versions, modality/capability changes, availability,
  pricing, limits, and lifecycle changes post immediately.
- Minor aliases, regional availability, and documentation changes enter a
  daily digest after 9:00 AM America/New_York.
- First runs seed silently, including the first run of a newly added source.
- Removal requires three consecutive successful absences. Failed or empty
  source parses never create removal alerts.
- Major alerts can include a locally rendered 1200×675 PNG card. The card uses
  the same evidence-backed text as the Discord embed.

## Free GitHub setup

The repository must be public and use a standard GitHub-hosted runner. GitHub
documents standard Actions usage for public repositories as free. Larger
runners are not used.

1. Fork this repository as a **public** repository.
2. Create a Discord incoming webhook: channel settings → Integrations →
   Webhooks → New Webhook.
3. Add the URL at repository Settings → Secrets and variables → Actions →
   Secrets as `DISCORD_WEBHOOK_URL`.
4. Enable GitHub Actions.
5. Run the `model-watcher` workflow manually with mode `seed`.
6. Set the repository variable `SHADOW_MODE=1` for the first 48 hours. Inspect
   proposed messages in workflow logs, then change it to `0`.

The workflow automatically creates and maintains `model-watcher-state`. State
commits never touch the development branch.

### Optional variables

| Name | Default | Purpose |
|---|---:|---|
| `SHADOW_MODE` | `0` | `1` prints and records alerts without contacting Discord. |
| `IMAGE_CARDS` | `1` | `0` disables PNG attachments. |

### Optional free/read-only keys

The keyless source registry is the core watcher. These secrets only add faster
first-party catalog detection when you already have a suitable free key:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `XAI_API_KEY`
- `MISTRAL_API_KEY`
- `DEEPSEEK_API_KEY`
- `MOONSHOT_API_KEY`
- `ZAI_API_KEY`

Never create a paid account for this watcher. If a provider does not offer a
free read-only listing, leave its key unset and use its public official pages.

## Local development

Requires Node.js 22 and pnpm 10.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm fixtures
pnpm dry
```

Commands:

- `pnpm dry` polls all sources, prints proposed output, and saves nothing.
- `pnpm seed` creates a silent local baseline in `data/state`.
- `pnpm watch` polls only sources whose intervals are due.
- `pnpm test` runs the engine, parser, Discord, image, and timezone tests.

Copy `.env.example` to `.env` only if your shell or environment loader consumes
it; the application itself reads environment variables directly.

## Adding a source

Add a `SourceAdapter` to `src/sources/registry.ts`. Prefer, in order:

1. Public structured first-party API.
2. Official RSS/Atom feed or structured model map.
3. Stable first-party HTML page with narrow model-name patterns.
4. Official Hugging Face organization.
5. Benchmark or aggregator as discovery-only evidence.

Every new parser needs a saved fixture. Mark a source `tracksRemovals: true`
only when it returns a complete authoritative catalog; rolling feeds and
leaderboards must leave it false.

## Limits

- GitHub schedules are best-effort and can be delayed.
- Social-network-only launches are not scraped. They are detected after they
  appear on a monitored public source.
- HTML layouts change. A failing source is isolated and cannot remove models.
- No deterministic parser means no inferred specifications; unknown is safer
  than a fabricated fact.

## License

MIT

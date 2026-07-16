import type { ModelEvent, ModelSnapshot } from "./types.ts";
import { env, sleep, stableJson } from "./util.ts";
import { renderModelCard } from "./image-card.ts";

interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  url?: string;
  description: string;
  color: number;
  fields: DiscordField[];
  footer: { text: string };
  timestamp: string;
  image?: { url: string };
}

const COLORS = { emerging: 0xf1c40f, verified: 0x2ecc71, removed: 0xe74c3c } as const;

function clip(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 1))}…`;
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function formatRecord(record: Record<string, unknown> | undefined): string {
  if (!record || Object.keys(record).length === 0) return "Not published";
  return Object.entries(record)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `**${key}:** ${String(value)}`)
    .join("\n");
}

function changeSummary(event: ModelEvent): string {
  if (event.type === "added") return "First qualifying sighting of this model.";
  if (event.type === "verified") return "A first-party source now verifies an earlier emerging-model sighting.";
  if (event.type === "reintroduced") return "The model returned after previously disappearing from all tracked sources.";
  if (event.type === "removed") return "The model was absent from its source for three consecutive successful checks.";
  return `Changed: ${event.changedFields.join(", ")}.`;
}

function beforeAfter(event: ModelEvent): string | undefined {
  if (!event.before || event.type !== "updated") return undefined;
  const lines = event.changedFields.slice(0, 8).map((field) => {
    const before = stableJson(event.before?.[field as keyof ModelSnapshot]);
    const after = stableJson(event.after[field as keyof ModelSnapshot]);
    return `**${field}**\n\`${clip(before, 180)}\` → \`${clip(after, 180)}\``;
  });
  return clip(lines.join("\n"), 1024);
}

function fitFields(title: string, description: string, fields: DiscordField[]): DiscordField[] {
  let remaining = 5900 - title.length - description.length;
  const fitted: DiscordField[] = [];
  for (const field of fields) {
    if (remaining <= field.name.length + 1) break;
    const value = clip(field.value, Math.min(1024, remaining - field.name.length));
    fitted.push({ ...field, value });
    remaining -= field.name.length + value.length;
  }
  return fitted;
}

export function renderEvent(event: ModelEvent, withImage = false): DiscordEmbed {
  const model = event.after;
  const confidence = model.confidence === "verified" ? "VERIFIED" : "EMERGING";
  const removed = event.type === "removed";
  const evidence = model.evidence
    .slice(0, 8)
    .map((item, index) => `${index + 1}. [${item.sourceId}](${safeUrl(item.url) ?? "https://github.com"}) · ${item.sourceKind}`)
    .join("\n");
  const fields: DiscordField[] = [
    { name: "What happened", value: clip(changeSummary(event), 1024) },
    { name: "Modalities", value: model.modalities.length ? model.modalities.join(" · ") : "Not published", inline: true },
    { name: "Availability", value: model.availability.length ? model.availability.join(" · ") : "Not published", inline: true },
  ];
  const changes = beforeAfter(event);
  if (changes) fields.push({ name: "Before → after", value: changes });
  if (Object.keys(model.capabilities).length) fields.push({ name: "Capabilities", value: clip(formatRecord(model.capabilities), 1024) });
  if (Object.keys(model.limits).length) fields.push({ name: "Limits", value: clip(formatRecord(model.limits), 1024), inline: true });
  if (model.pricing && Object.keys(model.pricing).length) fields.push({ name: "Pricing", value: clip(formatRecord(model.pricing), 1024), inline: true });
  fields.push({ name: "Evidence", value: clip(evidence || "No active evidence", 1024) });
  if (!model.owner) {
    fields.push({ name: "Uncertainty", value: "The model creator is not verified. Discovery-source attribution is intentionally not treated as ownership." });
  }
  const url = safeUrl(model.evidence[0]?.url);
  const title = clip(`${removed ? "REMOVED" : confidence} · ${model.displayName}`, 256);
  const description = clip(`**${model.owner ?? "Unknown creator"}** · ${model.family}\n\`${model.modelId.replace(/`/g, "") }\``, 4096);
  return {
    title,
    url,
    description,
    color: removed ? COLORS.removed : COLORS[model.confidence === "verified" ? "verified" : "emerging"],
    fields: fitFields(title, description, fields).slice(0, 25),
    footer: { text: `model-watcher · event ${event.id}` },
    timestamp: event.detectedAt,
    ...(withImage ? { image: { url: "attachment://model-card.png" } } : {}),
  };
}

async function webhook(payload: Record<string, unknown>, image?: Buffer): Promise<boolean> {
  const url = env("DISCORD_WEBHOOK_URL");
  if (!url) {
    console.log("[discord preview]", JSON.stringify(payload, null, 2));
    return false;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const init: RequestInit = { method: "POST" };
    if (image) {
      const form = new FormData();
      form.append("payload_json", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      form.append("files[0]", new Blob([image], { type: "image/png" }), "model-card.png");
      init.body = form;
    } else {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(payload);
    }
    const response = await fetch(url, init);
    if (response.status === 429) {
      const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
      await sleep(Math.max(1000, (body.retry_after ?? 1) * 1000));
      continue;
    }
    if (response.ok) return true;
    const detail = clip(await response.text().catch(() => ""), 300);
    console.error(`[discord] HTTP ${response.status}: ${detail}`);
    if (response.status < 500) return false;
    await sleep(1000 * 2 ** attempt);
  }
  return false;
}

export async function sendEvent(event: ModelEvent, options: { shadow?: boolean; image?: boolean } = {}): Promise<boolean> {
  const useImage = Boolean(options.image && event.type !== "removed");
  const embed = renderEvent(event, useImage);
  if (options.shadow) {
    console.log("[shadow immediate]", JSON.stringify(embed, null, 2));
    return true;
  }
  let card: Buffer | undefined;
  if (useImage) {
    try {
      card = await renderModelCard(event);
    } catch (error) {
      console.error(`[card] ${(error as Error).message}; sending text-only embed`);
      delete embed.image;
    }
  }
  return webhook({ username: "Model Watcher", allowed_mentions: { parse: [] }, embeds: [embed] }, card);
}

function digestLines(events: ModelEvent[]): string[] {
  return [...events]
    .sort((a, b) => (a.after.owner ?? "Unknown").localeCompare(b.after.owner ?? "Unknown") || a.after.displayName.localeCompare(b.after.displayName))
    .map((event) => {
      const source = safeUrl(event.after.evidence[0]?.url);
      const name = source ? `[${event.after.displayName}](${source})` : `**${event.after.displayName}**`;
      return `• **${event.after.owner ?? "Unknown"}** · ${name} — ${event.changedFields.join(", ")}`;
    });
}

export async function sendDigest(events: ModelEvent[], options: { shadow?: boolean } = {}): Promise<boolean> {
  if (!events.length) return true;
  const lines = digestLines(events);
  const descriptions: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > 3900) {
      descriptions.push(current);
      current = line;
    } else current = current ? `${current}\n${line}` : line;
  }
  if (current) descriptions.push(current);
  const embeds = descriptions.slice(0, 10).map((description, index) => ({
    title: index === 0 ? `Daily model update digest · ${events.length} changes` : "Daily model update digest · continued",
    description,
    color: 0x5865f2,
    timestamp: new Date().toISOString(),
    footer: { text: "model-watcher · minor changes" },
  }));
  if (options.shadow) {
    console.log("[shadow digest]", JSON.stringify(embeds, null, 2));
    return true;
  }
  return webhook({ username: "Model Watcher", allowed_mentions: { parse: [] }, embeds });
}

import type { Embed } from "./bot/rest.ts";
import type { ModelEvent, Subscription, WatcherState } from "./types.ts";
import { digestEmbeds, modelEmbed } from "./render.ts";
import { renderModelCard } from "./image-card.ts";
import { env, sleep } from "./util.ts";

export { modelEmbed as renderEvent };

/** True when an event matches a channel's `/watch` filters. */
export function matchesSubscription(event: ModelEvent, subscription: Subscription): boolean {
  if (subscription.minImportance === "major" && event.importance !== "major") return false;
  const model = event.after;
  if (subscription.vendors.length && !(model.vendorId && subscription.vendors.includes(model.vendorId))) return false;
  if (subscription.families.length && !(model.familyId && subscription.families.includes(model.familyId))) return false;
  if (subscription.modalities.length && !subscription.modalities.some((modality) => model.modalities.includes(modality))) {
    return false;
  }
  return true;
}

interface Target {
  /** Incoming webhook URL, or a bot-authenticated channel endpoint. */
  url: string;
  auth?: string;
  label: string;
}

function targets(state: WatcherState, event?: ModelEvent): Target[] {
  const list: Target[] = [];
  const webhook = env("DISCORD_WEBHOOK_URL");
  if (webhook) list.push({ url: webhook, label: "webhook" });

  const token = env("DISCORD_BOT_TOKEN");
  if (token) {
    for (const subscription of Object.values(state.subscriptions ?? {})) {
      if (event && !matchesSubscription(event, subscription)) continue;
      list.push({
        url: `https://discord.com/api/v10/channels/${subscription.channelId}/messages`,
        auth: `Bot ${token}`,
        label: `channel ${subscription.channelId}`,
      });
    }
  }
  return list;
}

async function post(target: Target, payload: Record<string, unknown>, image?: Buffer): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const init: RequestInit = { method: "POST", headers: {} };
    const headers = init.headers as Record<string, string>;
    if (target.auth) headers["authorization"] = target.auth;
    if (image) {
      const form = new FormData();
      form.append("payload_json", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      form.append("files[0]", new Blob([new Uint8Array(image)], { type: "image/png" }), "model-card.png");
      init.body = form;
    } else {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(payload);
    }
    const response = await fetch(target.url, init);
    if (response.status === 429) {
      const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
      await sleep(Math.max(1000, (body.retry_after ?? 1) * 1000));
      continue;
    }
    if (response.ok) return true;
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    console.error(`[discord] ${target.label} HTTP ${response.status}: ${detail}`);
    if (response.status < 500) return false;
    await sleep(1000 * 2 ** attempt);
  }
  return false;
}

async function deliver(
  state: WatcherState,
  payload: Record<string, unknown>,
  options: { event?: ModelEvent; image?: Buffer } = {},
): Promise<boolean> {
  const list = targets(state, options.event);
  if (!list.length) {
    console.log("[discord preview]", JSON.stringify(payload, null, 2));
    return false;
  }
  const results = await Promise.all(list.map((target) => post(target, payload, options.image)));
  return results.some(Boolean);
}

export async function sendEvent(
  event: ModelEvent,
  state: WatcherState,
  options: { shadow?: boolean; image?: boolean } = {},
): Promise<boolean> {
  const useImage = Boolean(options.image && event.type !== "removed");
  const embed: Embed = modelEmbed(event.after, event, useImage);
  if (options.shadow) {
    console.log("[shadow immediate]", JSON.stringify(embed, null, 2));
    return true;
  }
  let card: Buffer | undefined;
  if (useImage) {
    try {
      card = await renderModelCard(event);
    } catch (error) {
      console.error(`[card] ${(error as Error).message}; sending a text-only embed`);
      delete embed.image;
    }
  }
  return deliver(
    state,
    { username: "Model Watcher", allowed_mentions: { parse: [] }, embeds: [embed] },
    { event, ...(card ? { image: card } : {}) },
  );
}

export async function sendDigest(
  events: ModelEvent[],
  state: WatcherState,
  options: { shadow?: boolean } = {},
): Promise<boolean> {
  if (!events.length) return true;
  const embeds = digestEmbeds(events);
  if (options.shadow) {
    console.log("[shadow digest]", JSON.stringify(embeds, null, 2));
    return true;
  }
  return deliver(state, { username: "Model Watcher", allowed_mentions: { parse: [] }, embeds });
}

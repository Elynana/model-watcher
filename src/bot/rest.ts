import { env, sleep } from "../util.ts";

const API = "https://discord.com/api/v10";

export class DiscordError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Discord HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "DiscordError";
  }
}

function token(): string {
  const value = env("DISCORD_BOT_TOKEN");
  if (!value) throw new Error("DISCORD_BOT_TOKEN is not set");
  return value;
}

/**
 * One REST call with Discord's documented rate-limit handling: honour
 * `retry_after` on 429 and back off on 5xx. Never retries a 4xx.
 */
export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "model-watcher (https://github.com/model-watcher, 2.0)",
  };
  if (options.auth !== false) headers["authorization"] = `Bot ${token()}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 429) {
      const payload = (await response.json().catch(() => ({}))) as { retry_after?: number };
      await sleep(Math.max(1000, (payload.retry_after ?? 1) * 1000));
      continue;
    }
    if (response.status >= 500) {
      await sleep(750 * 2 ** attempt);
      continue;
    }
    const text = await response.text();
    if (!response.ok) throw new DiscordError(response.status, text);
    return (text ? JSON.parse(text) : undefined) as T;
  }
  throw new Error(`Discord request gave up after retries: ${method} ${path}`);
}

export interface CommandOption {
  type: 3 | 4 | 5;
  name: string;
  description: string;
  required?: boolean;
  choices?: Array<{ name: string; value: string }>;
  autocomplete?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  options?: CommandOption[];
}

/**
 * Overwrites the bot's command set. Guild-scoped registration applies within
 * seconds and is the right choice while iterating; global takes up to an hour.
 */
export async function registerCommands(definitions: CommandDefinition[]): Promise<void> {
  const applicationId = env("DISCORD_APPLICATION_ID");
  if (!applicationId) throw new Error("DISCORD_APPLICATION_ID is not set");
  const guildId = env("DISCORD_GUILD_ID");
  const path = guildId
    ? `/applications/${applicationId}/guilds/${guildId}/commands`
    : `/applications/${applicationId}/commands`;
  await request("PUT", path, definitions);
  console.log(`[bot] registered ${definitions.length} commands ${guildId ? `to guild ${guildId}` : "globally"}`);
}

export interface Embed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
  image?: { url: string };
}

export interface InteractionResponse {
  content?: string;
  embeds?: Embed[];
  /** 64 = ephemeral: only the invoking user sees it. */
  flags?: number;
}

/** Acknowledges an interaction within Discord's three-second window. */
export async function deferReply(interactionId: string, interactionToken: string, ephemeral = false): Promise<void> {
  await request("POST", `/interactions/${interactionId}/${interactionToken}/callback`, {
    type: 5,
    data: ephemeral ? { flags: 64 } : {},
  }, { auth: false });
}

/** Replaces the deferred response with the finished payload. */
export async function editReply(applicationId: string, interactionToken: string, payload: InteractionResponse): Promise<void> {
  await request("PATCH", `/webhooks/${applicationId}/${interactionToken}/messages/@original`, payload, { auth: false });
}

export async function respondAutocomplete(
  interactionId: string,
  interactionToken: string,
  choices: Array<{ name: string; value: string }>,
): Promise<void> {
  await request("POST", `/interactions/${interactionId}/${interactionToken}/callback`, {
    type: 8,
    data: { choices: choices.slice(0, 25) },
  }, { auth: false });
}

export async function postToChannel(channelId: string, payload: InteractionResponse): Promise<void> {
  await request("POST", `/channels/${channelId}/messages`, { ...payload, allowed_mentions: { parse: [] } });
}

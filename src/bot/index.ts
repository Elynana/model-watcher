import { COMMANDS, autocomplete, handleCommand } from "./commands.ts";
import { Gateway } from "./gateway.ts";
import { deferReply, editReply, registerCommands, respondAutocomplete } from "./rest.ts";
import { loadState, saveState } from "../state.ts";
import { COLORS } from "../render.ts";
import { env } from "../util.ts";
import type { WatcherState } from "../types.ts";

/** Discord interaction types used by an application-command bot. */
const INTERACTION = { command: 2, autocomplete: 4 } as const;

interface InteractionOption {
  name: string;
  value?: string | number | boolean;
  focused?: boolean;
}

interface Interaction {
  id: string;
  token: string;
  type: number;
  application_id: string;
  channel_id?: string;
  data?: { name: string; options?: InteractionOption[] };
}

function flatten(options: InteractionOption[] | undefined): Record<string, string | number | boolean | undefined> {
  return Object.fromEntries((options ?? []).map((option) => [option.name, option.value]));
}

/**
 * The state is re-read from disk before each interaction so the bot always
 * answers from the newest watcher run without holding a stale snapshot.
 */
async function currentState(cache: { value?: WatcherState; loadedAt: number }): Promise<WatcherState> {
  if (cache.value && Date.now() - cache.loadedAt < 30_000) return cache.value;
  cache.value = await loadState();
  cache.loadedAt = Date.now();
  return cache.value;
}

async function main(): Promise<void> {
  if (!env("DISCORD_BOT_TOKEN")) throw new Error("DISCORD_BOT_TOKEN is required to run the bot");
  if (!env("DISCORD_APPLICATION_ID")) throw new Error("DISCORD_APPLICATION_ID is required to run the bot");

  if (!process.argv.includes("--no-register")) await registerCommands(COMMANDS);
  if (process.argv.includes("--register-only")) return;

  const cache: { value?: WatcherState; loadedAt: number } = { loadedAt: 0 };

  const gateway = new Gateway({
    onDispatch: async (event, data) => {
      if (event !== "INTERACTION_CREATE") return;
      const interaction = data as Interaction;

      if (interaction.type === INTERACTION.autocomplete) {
        const focused = interaction.data?.options?.find((option) => option.focused);
        const state = await currentState(cache);
        const choices = autocomplete(
          interaction.data?.name ?? "",
          focused?.name ?? "",
          String(focused?.value ?? ""),
          state,
        );
        await respondAutocomplete(interaction.id, interaction.token, choices).catch((error: unknown) => {
          console.error(`[bot] autocomplete failed: ${(error as Error).message}`);
        });
        return;
      }

      if (interaction.type !== INTERACTION.command || !interaction.data) return;
      const name = interaction.data.name;
      const started = Date.now();
      try {
        await deferReply(interaction.id, interaction.token);
        const state = await currentState(cache);
        const response = await handleCommand(name, flatten(interaction.data.options), {
          state,
          ...(interaction.channel_id ? { channelId: interaction.channel_id } : {}),
          save: async (next) => {
            await saveState(next);
            cache.value = next;
            cache.loadedAt = Date.now();
          },
        });
        await editReply(interaction.application_id, interaction.token, response);
        console.log(`[bot] /${name} answered in ${Date.now() - started}ms`);
      } catch (error) {
        console.error(`[bot] /${name} failed: ${(error as Error).message}`);
        await editReply(interaction.application_id, interaction.token, {
          embeds: [{
            title: "Command failed",
            description: "The watcher could not complete this command. Nothing was changed.",
            color: COLORS.removed,
          }],
        }).catch(() => undefined);
      }
    },
  });

  const shutdown = () => {
    console.log("[bot] shutting down");
    gateway.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await gateway.connect();
}

main().catch((error: unknown) => {
  console.error("Fatal:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

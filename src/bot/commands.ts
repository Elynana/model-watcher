import type { CommandDefinition, Embed, InteractionResponse } from "./rest.ts";
import type { Modality, Subscription, WatcherState } from "../types.ts";
import { FAMILIES, FAMILY_BY_ID, VENDORS, VENDOR_BY_ID, channelLabel, familiesForVendor, parseSlug } from "../catalog/index.ts";
import { SOURCES, coverage } from "../sources/registry.ts";
import {
  byRecency,
  familyHead,
  findModel,
  health,
  resolveVendorId,
  select,
  snapshots,
  stealthCandidates,
  vendorReport,
} from "../query.ts";
import {
  COLORS,
  code,
  compareEmbed,
  coverageEmbed,
  listEmbed,
  modelEmbed,
  modelLine,
  slugBlock,
  slugSummary,
  vendorEmbed,
} from "../render.ts";

const MODALITY_CHOICES = [
  "text", "code", "image", "video", "audio", "speech", "music", "3d", "world", "embedding", "rerank",
].map((value) => ({ name: value, value }));

const STRING = 3 as const;
const INTEGER = 4 as const;
const BOOLEAN = 5 as const;

export const COMMANDS: CommandDefinition[] = [
  {
    name: "model",
    description: "Definitive record for one model slug, with evidence.",
    options: [{ type: STRING, name: "slug", description: "Model slug or name, e.g. claude-opus-4-6", required: true, autocomplete: true }],
  },
  {
    name: "slugs",
    description: "Copy-pasteable list of exact model slugs.",
    options: [
      { type: STRING, name: "vendor", description: "Publisher, e.g. openai, Black Forest Labs", autocomplete: true },
      { type: STRING, name: "modality", description: "Output modality", choices: MODALITY_CHOICES },
      { type: STRING, name: "family", description: "Model family, e.g. claude, flux, veo", autocomplete: true },
      { type: BOOLEAN, name: "pointers", description: "Include dated snapshots and rolling aliases" },
    ],
  },
  {
    name: "vendor",
    description: "Every tracked model from one AI company, grouped by modality.",
    options: [{ type: STRING, name: "name", description: "Publisher name or id", required: true, autocomplete: true }],
  },
  {
    name: "new",
    description: "Models first detected within a time window.",
    options: [
      { type: INTEGER, name: "hours", description: "Look-back window in hours (default 24, max 720)" },
      { type: STRING, name: "modality", description: "Restrict to one modality", choices: MODALITY_CHOICES },
      { type: STRING, name: "vendor", description: "Restrict to one publisher", autocomplete: true },
    ],
  },
  {
    name: "latest",
    description: "Current head of a model family, newest version first.",
    options: [{ type: STRING, name: "family", description: "Family id, e.g. gemini, seedance, eleven", required: true, autocomplete: true }],
  },
  {
    name: "compare",
    description: "Side-by-side definitive fields for two model slugs.",
    options: [
      { type: STRING, name: "a", description: "First slug", required: true, autocomplete: true },
      { type: STRING, name: "b", description: "Second slug", required: true, autocomplete: true },
    ],
  },
  {
    name: "stealth",
    description: "Unannounced arena codenames with no verified publisher.",
  },
  {
    name: "search",
    description: "Find tracked models by slug, name, family, or publisher.",
    options: [{ type: STRING, name: "query", description: "Free text", required: true }],
  },
  {
    name: "parse",
    description: "Decompose any slug into publisher, family, version, tier, and channel.",
    options: [{ type: STRING, name: "slug", description: "Any model identifier", required: true }],
  },
  {
    name: "vendors",
    description: "Every AI company the watcher tracks.",
    options: [
      { type: STRING, name: "modality", description: "Only publishers shipping this modality", choices: MODALITY_CHOICES },
      { type: STRING, name: "country", description: "ISO country code, e.g. US, CN, FR" },
    ],
  },
  {
    name: "families",
    description: "Model-family taxonomy, optionally for one publisher.",
    options: [{ type: STRING, name: "vendor", description: "Publisher name or id", autocomplete: true }],
  },
  {
    name: "coverage",
    description: "Source health and publisher coverage report.",
  },
  {
    name: "watch",
    description: "Subscribe this channel to matching releases.",
    options: [
      { type: STRING, name: "vendor", description: "Publisher to follow", autocomplete: true },
      { type: STRING, name: "modality", description: "Modality to follow", choices: MODALITY_CHOICES },
      { type: STRING, name: "family", description: "Family to follow", autocomplete: true },
      { type: BOOLEAN, name: "minor", description: "Also deliver minor changes (default false)" },
    ],
  },
  {
    name: "unwatch",
    description: "Remove this channel's subscription.",
  },
];

export interface InteractionContext {
  state: WatcherState;
  channelId?: string;
  /** Persists subscription changes made by `/watch` and `/unwatch`. */
  save: (state: WatcherState) => Promise<void>;
}

type Options = Record<string, string | number | boolean | undefined>;

function optionValue(options: Options, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function notFound(what: string): InteractionResponse {
  return {
    embeds: [{
      title: "No definitive match",
      description: `${what}\n\nNothing is reported rather than guessing. Try ${code("/search")} for a broader lookup.`,
      color: COLORS.emerging,
    }],
  };
}

/** Routes one application-command interaction to its handler. */
export async function handleCommand(
  name: string,
  options: Options,
  context: InteractionContext,
): Promise<InteractionResponse> {
  switch (name) {
    case "model":
      return commandModel(options, context);
    case "slugs":
      return commandSlugs(options, context);
    case "vendor":
      return commandVendor(options, context);
    case "new":
      return commandNew(options, context);
    case "latest":
      return commandLatest(options, context);
    case "compare":
      return commandCompare(options, context);
    case "stealth":
      return commandStealth(context);
    case "search":
      return commandSearch(options, context);
    case "parse":
      return commandParse(options);
    case "vendors":
      return commandVendors(options);
    case "families":
      return commandFamilies(options);
    case "coverage":
      return commandCoverage(context);
    case "watch":
      return commandWatch(options, context);
    case "unwatch":
      return commandUnwatch(context);
    default:
      return notFound(`Unknown command ${code(name)}.`);
  }
}

function commandModel(options: Options, context: InteractionContext): InteractionResponse {
  const slug = optionValue(options, "slug") ?? "";
  const snapshot = findModel(context.state, slug);
  if (!snapshot) return notFound(`No tracked model matches ${code(slug)}.`);
  return { embeds: [modelEmbed(snapshot)] };
}

function commandSlugs(options: Options, context: InteractionContext): InteractionResponse {
  const vendorInput = optionValue(options, "vendor");
  const vendorId = vendorInput ? resolveVendorId(vendorInput) : undefined;
  if (vendorInput && !vendorId) return notFound(`No tracked publisher matches ${code(vendorInput)}.`);
  const familyInput = optionValue(options, "family");
  const familyId = familyInput
    ? (FAMILY_BY_ID.has(familyInput) ? familyInput : FAMILIES.find((family) => family.name.toLowerCase() === familyInput.toLowerCase())?.id)
    : undefined;
  if (familyInput && !familyId) return notFound(`No registered family matches ${code(familyInput)}.`);

  const models = select(context.state, {
    ...(vendorId ? { vendorId } : {}),
    ...(familyId ? { familyId } : {}),
    ...(options["modality"] ? { modality: options["modality"] as Modality } : {}),
    includePointers: options["pointers"] === true,
  }).sort(byRecency);

  const scope = [vendorId ? VENDOR_BY_ID.get(vendorId)?.name : undefined, familyId ? FAMILY_BY_ID.get(familyId)?.name : undefined, options["modality"] as string | undefined]
    .filter(Boolean)
    .join(" · ") || "all publishers";

  const blocks = slugBlock(models);
  return {
    content: `**${models.length} slug${models.length === 1 ? "" : "s"}** — ${scope}${models.length > 120 ? " (first 120 shown, newest first)" : ""}`,
    embeds: blocks.slice(0, 3).map((block, index) => ({
      title: index === 0 ? `Exact slugs · ${scope}` : "continued",
      description: block,
      color: COLORS.info,
    })),
  };
}

function commandVendor(options: Options, context: InteractionContext): InteractionResponse {
  const input = optionValue(options, "name") ?? "";
  const vendorId = resolveVendorId(input);
  if (!vendorId) return notFound(`No tracked publisher matches ${code(input)}.`);
  const report = vendorReport(context.state, vendorId);
  if (!report || report.total === 0) {
    const vendor = VENDOR_BY_ID.get(vendorId)!;
    return {
      embeds: [{
        title: `${vendor.name} · 0 tracked models`,
        url: vendor.homepage,
        description: [
          `**${vendor.name}** is registered (${vendor.country}) and monitored, but no model has been observed yet.`,
          `Registered families: ${familiesForVendor(vendorId).map((family) => code(family.name)).join(" ") || "none"}`,
        ].join("\n\n"),
        color: COLORS.emerging,
      }],
    };
  }
  return { embeds: [vendorEmbed(report)] };
}

function commandNew(options: Options, context: InteractionContext): InteractionResponse {
  const hours = Math.min(Math.max(Number(options["hours"] ?? 24) || 24, 1), 720);
  const vendorInput = optionValue(options, "vendor");
  const vendorId = vendorInput ? resolveVendorId(vendorInput) : undefined;
  const models = select(context.state, {
    sinceHours: hours,
    ...(vendorId ? { vendorId } : {}),
    ...(options["modality"] ? { modality: options["modality"] as Modality } : {}),
  }).sort(byRecency);

  if (!models.length) {
    return {
      embeds: [{
        title: `No new models in the last ${hours}h`,
        description: "Every tracked slug in this scope was already known before the window opened.",
        color: COLORS.info,
      }],
    };
  }
  return {
    embeds: listEmbed(
      `${models.length} new model${models.length === 1 ? "" : "s"} · last ${hours}h`,
      models.slice(0, 60).map((model) => `• **${model.owner ?? "Unattributed"}** — ${modelLine(model)}`),
      COLORS.verified,
    ),
  };
}

function commandLatest(options: Options, context: InteractionContext): InteractionResponse {
  const input = optionValue(options, "family") ?? "";
  const familyId = FAMILY_BY_ID.has(input)
    ? input
    : FAMILIES.find((family) => family.name.toLowerCase() === input.toLowerCase() || family.id === input.toLowerCase())?.id;
  if (!familyId) return notFound(`No registered family matches ${code(input)}.`);
  const models = familyHead(context.state, familyId);
  if (!models.length) return notFound(`Family ${code(familyId)} is registered but nothing has been observed yet.`);
  const head = models[0]!;
  const embeds: Embed[] = [modelEmbed(head)];
  if (models.length > 1) {
    embeds.push(...listEmbed(
      `${FAMILY_BY_ID.get(familyId)!.name} · ${models.length} tracked slugs`,
      models.slice(1, 40).map((model) => `• ${modelLine(model)}`),
    ));
  }
  return { embeds: embeds.slice(0, 4) };
}

function commandCompare(options: Options, context: InteractionContext): InteractionResponse {
  const left = findModel(context.state, optionValue(options, "a") ?? "");
  const right = findModel(context.state, optionValue(options, "b") ?? "");
  if (!left || !right) {
    return notFound(`Could not resolve ${!left ? code(String(options["a"])) : code(String(options["b"]))} to a tracked model.`);
  }
  return { embeds: [compareEmbed(left, right)] };
}

function commandStealth(context: InteractionContext): InteractionResponse {
  const models = stealthCandidates(context.state);
  if (!models.length) {
    return {
      embeds: [{
        title: "No unattributed candidates",
        description: "Every tracked slug currently has a verified publisher.",
        color: COLORS.verified,
      }],
    };
  }
  return {
    embeds: listEmbed(
      `${models.length} unattributed / stealth candidate${models.length === 1 ? "" : "s"}`,
      models.slice(0, 50).map((model) => `• ${modelLine(model)} — seen ${model.firstSeen.slice(0, 10)}`),
      COLORS.stealth,
    ).map((embed) => ({
      ...embed,
      footer: { text: "model-watcher · no publisher has claimed these slugs; no capability is asserted" },
    })),
  };
}

function commandSearch(options: Options, context: InteractionContext): InteractionResponse {
  const query = optionValue(options, "query") ?? "";
  const models = select(context.state, { query, includePointers: true }).sort(byRecency);
  if (!models.length) return notFound(`Nothing matches ${code(query)}.`);
  return {
    embeds: listEmbed(
      `${models.length} match${models.length === 1 ? "" : "es"} for “${query}”`,
      models.slice(0, 60).map((model) => `• **${model.owner ?? "Unattributed"}** — ${modelLine(model)}`),
    ),
  };
}

function commandParse(options: Options): InteractionResponse {
  const slug = optionValue(options, "slug") ?? "";
  const parts = parseSlug(slug);
  const rows: Array<[string, string]> = [
    ["canonical slug", parts.canonical],
    ["routing namespace", parts.namespace ?? "none"],
    ["family head", parts.base],
    ["version", parts.version ?? "not present"],
    ["tier", parts.tier ?? "not present"],
    ["qualifiers", parts.qualifiers.join(", ") || "none"],
    ["parameters", parts.size ?? "not present"],
    ["active parameters", parts.activeParams ?? "not present"],
    ["experts", parts.experts ?? "not present"],
    ["dated snapshot", parts.snapshot ?? "not present"],
    ["quantization", parts.quantization ?? "none"],
    ["release channel", channelLabel(parts.channel)],
    ["identifier class", parts.slugClass],
  ];
  return {
    embeds: [{
      title: `Slug decomposition · ${code(slug)}`,
      description: rows.map(([label, value]) => `**${label}:** ${value}`).join("\n"),
      color: COLORS.info,
      footer: { text: "model-watcher · parsed structurally; no field is inferred" },
    }],
  };
}

function commandVendors(options: Options): InteractionResponse {
  const modality = options["modality"] as Modality | undefined;
  const country = optionValue(options, "country")?.toUpperCase();
  const matched = VENDORS.filter((vendor) => vendor.tier !== "platform")
    .filter((vendor) => !modality || vendor.modalities.includes(modality))
    .filter((vendor) => !country || vendor.country === country)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!matched.length) return notFound("No registered publisher matches that filter.");
  return {
    embeds: listEmbed(
      `${matched.length} tracked AI publisher${matched.length === 1 ? "" : "s"}${modality ? ` · ${modality}` : ""}${country ? ` · ${country}` : ""}`,
      matched.map((vendor) => `• ${code(vendor.id)} — **${vendor.name}** (${vendor.country}) · ${vendor.modalities.join(", ")}`),
    ),
  };
}

function commandFamilies(options: Options): InteractionResponse {
  const vendorInput = optionValue(options, "vendor");
  const vendorId = vendorInput ? resolveVendorId(vendorInput) : undefined;
  if (vendorInput && !vendorId) return notFound(`No tracked publisher matches ${code(vendorInput)}.`);
  const matched = (vendorId ? familiesForVendor(vendorId) : FAMILIES).sort((a, b) => a.name.localeCompare(b.name));
  return {
    embeds: listEmbed(
      `${matched.length} registered model famil${matched.length === 1 ? "y" : "ies"}${vendorId ? ` · ${VENDOR_BY_ID.get(vendorId)!.name}` : ""}`,
      matched.map((family) => {
        const vendor = VENDOR_BY_ID.get(family.vendorId);
        return `• ${code(family.id)} — **${family.name}** · ${vendor?.name ?? family.vendorId} · ${family.modalities.join(", ")}${family.open ? " · open weights" : ""}`;
      }),
    ),
  };
}

function commandCoverage(context: InteractionContext): InteractionResponse {
  return { embeds: [coverageEmbed(coverage(), health(context.state, SOURCES.map((source) => source.id)))] };
}

async function commandWatch(options: Options, context: InteractionContext): Promise<InteractionResponse> {
  if (!context.channelId) return notFound("This command must be used inside a channel.");
  const vendorInput = optionValue(options, "vendor");
  const vendorId = vendorInput ? resolveVendorId(vendorInput) : undefined;
  if (vendorInput && !vendorId) return notFound(`No tracked publisher matches ${code(vendorInput)}.`);
  const familyInput = optionValue(options, "family");
  const familyId = familyInput && FAMILY_BY_ID.has(familyInput) ? familyInput : undefined;
  if (familyInput && !familyId) return notFound(`No registered family matches ${code(familyInput)}.`);

  const existing = context.state.subscriptions[context.channelId];
  const subscription: Subscription = {
    channelId: context.channelId,
    vendors: [...new Set([...(existing?.vendors ?? []), ...(vendorId ? [vendorId] : [])])],
    modalities: [...new Set([...(existing?.modalities ?? []), ...(options["modality"] ? [options["modality"] as Modality] : [])])],
    families: [...new Set([...(existing?.families ?? []), ...(familyId ? [familyId] : [])])],
    minImportance: options["minor"] === true ? "minor" : (existing?.minImportance ?? "major"),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  context.state.subscriptions[context.channelId] = subscription;
  await context.save(context.state);

  const scope = [
    subscription.vendors.length ? `publishers: ${subscription.vendors.map(code).join(" ")}` : "",
    subscription.modalities.length ? `modalities: ${subscription.modalities.map(code).join(" ")}` : "",
    subscription.families.length ? `families: ${subscription.families.map(code).join(" ")}` : "",
  ].filter(Boolean);

  return {
    embeds: [{
      title: "Channel subscribed",
      description: [
        scope.length ? scope.join("\n") : "Everything: no filter set, so all releases are delivered.",
        `Importance: **${subscription.minImportance === "minor" ? "major and minor" : "major only"}**`,
      ].join("\n\n"),
      color: COLORS.verified,
      footer: { text: "model-watcher · run /watch again to add filters, /unwatch to clear" },
    }],
  };
}

async function commandUnwatch(context: InteractionContext): Promise<InteractionResponse> {
  if (!context.channelId) return notFound("This command must be used inside a channel.");
  const existed = Boolean(context.state.subscriptions[context.channelId]);
  delete context.state.subscriptions[context.channelId];
  await context.save(context.state);
  return {
    embeds: [{
      title: existed ? "Subscription removed" : "No subscription here",
      description: existed
        ? "This channel will no longer receive release alerts."
        : "This channel had no subscription to remove.",
      color: COLORS.info,
    }],
  };
}

/** Autocomplete suggestions for slug, vendor, and family options. */
export function autocomplete(commandName: string, optionName: string, value: string, state: WatcherState): Array<{ name: string; value: string }> {
  const needle = value.trim().toLowerCase();
  if (optionName === "vendor" || (commandName === "vendor" && optionName === "name")) {
    return VENDORS.filter((vendor) => vendor.tier !== "platform")
      .filter((vendor) => !needle || vendor.id.includes(needle) || vendor.name.toLowerCase().includes(needle))
      .slice(0, 25)
      .map((vendor) => ({ name: `${vendor.name} (${vendor.country})`, value: vendor.id }));
  }
  if (optionName === "family") {
    return FAMILIES.filter((family) => !needle || family.id.includes(needle) || family.name.toLowerCase().includes(needle))
      .slice(0, 25)
      .map((family) => ({ name: `${family.name} — ${VENDOR_BY_ID.get(family.vendorId)?.name ?? family.vendorId}`, value: family.id }));
  }
  const models = snapshots(state)
    .filter((snapshot) => !needle || snapshot.slug.toLowerCase().includes(needle) || snapshot.displayName.toLowerCase().includes(needle))
    .sort(byRecency)
    .slice(0, 25);
  return models.map((snapshot) => ({
    name: `${snapshot.slug} — ${snapshot.owner ?? "unattributed"}`.slice(0, 100),
    value: snapshot.slug.slice(0, 100),
  }));
}

/** Exported for tests: the one-line summary used in log output. */
export { slugSummary };

import type { Coverage } from "./sources/registry.ts";
import type { Embed } from "./bot/rest.ts";
import type { HealthReport, VendorReport } from "./query.ts";
import type { Modality, ModelEvent, ModelSnapshot } from "./types.ts";
import { channelLabel, parseSlug } from "./catalog/index.ts";

export const COLORS = {
  verified: 0x2ecc71,
  emerging: 0xf1c40f,
  removed: 0xe74c3c,
  stealth: 0x9b59b6,
  info: 0x5865f2,
} as const;

const MODALITY_ICON: Record<string, string> = {
  text: "📝", code: "💻", image: "🖼️", video: "🎬", audio: "🔊", speech: "🗣️",
  music: "🎵", "3d": "🧊", world: "🌍", embedding: "🧭", rerank: "📊", moderation: "🛡️",
};

export function clip(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 1))}…`;
}

export function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Inline code that cannot break out of its own span. */
export function code(value: string): string {
  return `\`${value.replace(/`/g, "ˋ")}\``;
}

export function modalityLine(modalities: readonly string[]): string {
  if (!modalities.length) return "Not published";
  return modalities.map((modality) => `${MODALITY_ICON[modality] ?? "•"} ${modality}`).join("  ");
}

function formatRecord(record: Record<string, unknown> | undefined, limit = 8): string {
  const entries = Object.entries(record ?? {});
  if (!entries.length) return "Not published";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, limit)
    .map(([key, value]) => `**${key}:** ${String(value)}`)
    .join("\n");
}

function contextLine(snapshot: ModelSnapshot): string {
  const context = snapshot.limits["contextTokens"];
  const output = snapshot.limits["maxOutputTokens"];
  const bits: string[] = [];
  if (typeof context === "number") bits.push(`${context.toLocaleString("en-US")} in`);
  if (typeof output === "number") bits.push(`${output.toLocaleString("en-US")} out`);
  return bits.length ? bits.join(" · ") : "Not published";
}

/** One-line definitive identity: publisher, family, version, channel. */
export function identity(snapshot: ModelSnapshot): string {
  const bits = [snapshot.owner ?? "Publisher not verified", snapshot.family];
  if (snapshot.version) bits.push(`v${snapshot.version}`);
  if (snapshot.tier) bits.push(snapshot.tier);
  bits.push(channelLabel(snapshot.channel));
  return bits.join(" · ");
}

function evidenceLines(snapshot: ModelSnapshot, limit = 6): string {
  if (!snapshot.evidence.length) return "No active evidence";
  return snapshot.evidence
    .slice(0, limit)
    .map((item, index) => {
      const url = safeUrl(item.url);
      const label = `${item.sourceId} · ${item.sourceKind}`;
      return `${index + 1}. ${url ? `[${label}](${url})` : label}`;
    })
    .join("\n");
}

function fitFields(title: string, description: string, fields: NonNullable<Embed["fields"]>): NonNullable<Embed["fields"]> {
  let remaining = 5900 - title.length - description.length;
  const fitted: NonNullable<Embed["fields"]> = [];
  for (const field of fields) {
    if (remaining <= field.name.length + 1) break;
    const value = clip(field.value, Math.min(1024, remaining - field.name.length));
    fitted.push({ ...field, value });
    remaining -= field.name.length + value.length;
  }
  return fitted.slice(0, 25);
}

const EVENT_HEADLINE: Record<ModelEvent["type"], string> = {
  added: "NEW MODEL",
  verified: "NOW VERIFIED",
  reintroduced: "REINTRODUCED",
  removed: "REMOVED",
  updated: "UPDATED",
};

function changeSummary(event: ModelEvent): string {
  switch (event.type) {
    case "added":
      return `First qualifying sighting of slug ${code(event.after.slug)}.`;
    case "verified":
      return "A first-party source now verifies an earlier emerging sighting.";
    case "reintroduced":
      return "The slug returned after previously disappearing from every tracked source.";
    case "removed":
      return "The slug was absent from its authoritative source on three consecutive successful checks.";
    default:
      return `Changed fields: ${event.changedFields.join(", ")}.`;
  }
}

function beforeAfter(event: ModelEvent | undefined): string | undefined {
  if (!event?.before || event.type !== "updated") return undefined;
  const lines = event.changedFields.slice(0, 6).map((field) => {
    const before = JSON.stringify(event.before?.[field as keyof ModelSnapshot]);
    const after = JSON.stringify(event.after[field as keyof ModelSnapshot]);
    return `**${field}**\n${code(clip(before ?? "—", 150))} → ${code(clip(after ?? "—", 150))}`;
  });
  return clip(lines.join("\n"), 1024);
}

/**
 * The canonical model embed. Every statement here is either read from a
 * source or explicitly marked "not published" — nothing is inferred.
 */
export function modelEmbed(snapshot: ModelSnapshot, event?: ModelEvent, withImage = false): Embed {
  const headline = event ? EVENT_HEADLINE[event.type] : snapshot.confidence === "verified" ? "VERIFIED" : "EMERGING";
  const removed = event?.type === "removed";
  const stealth = snapshot.capabilities["stealth"] === true;
  const title = clip(`${headline} · ${snapshot.displayName}`, 256);
  const description = clip(
    [
      `**${identity(snapshot)}**`,
      `Slug: ${code(snapshot.slug)}`,
      snapshot.releaseDate ? `Published: ${snapshot.releaseDate}` : "Publication date: not published",
    ].join("\n"),
    4096,
  );

  const fields: NonNullable<Embed["fields"]> = [
    { name: "What happened", value: clip(event ? changeSummary(event) : "Current catalog record.", 1024) },
    { name: "Modalities", value: modalityLine(snapshot.modalities), inline: true },
    { name: "Release channel", value: channelLabel(snapshot.channel), inline: true },
    { name: "Context window", value: contextLine(snapshot), inline: true },
  ];

  const changes = beforeAfter(event);
  if (changes) fields.push({ name: "Before → after", value: changes });
  if (Object.keys(snapshot.capabilities).length) {
    fields.push({ name: "Capabilities", value: clip(formatRecord(snapshot.capabilities), 1024) });
  }
  if (snapshot.pricing && Object.keys(snapshot.pricing).length) {
    fields.push({ name: "Pricing", value: clip(formatRecord(snapshot.pricing, 6), 1024), inline: true });
  }
  fields.push({
    name: "Availability",
    value: clip(snapshot.availability.length ? snapshot.availability.join(" · ") : "Not published", 1024),
    inline: true,
  });
  if (snapshot.slugAliases.length > 1) {
    fields.push({
      name: "Known slug spellings",
      value: clip(snapshot.slugAliases.map(code).join("  "), 1024),
    });
  }
  fields.push({ name: "Evidence", value: clip(evidenceLines(snapshot), 1024) });
  if (!snapshot.attributionVerified) {
    fields.push({
      name: "Attribution",
      value: stealth
        ? "Sponsor-blinded arena entry. No publisher has claimed this slug, and no capability is asserted."
        : "The publisher is not verified. Discovery-source namespaces are not treated as ownership.",
    });
  }

  return {
    title,
    ...(safeUrl(snapshot.evidence[0]?.url) ? { url: safeUrl(snapshot.evidence[0]?.url)! } : {}),
    description,
    color: removed ? COLORS.removed : stealth ? COLORS.stealth : snapshot.confidence === "verified" ? COLORS.verified : COLORS.emerging,
    fields: fitFields(title, description, fields),
    footer: { text: `model-watcher · ${event ? `event ${event.id}` : `key ${snapshot.key}`}` },
    timestamp: event?.detectedAt ?? snapshot.lastChanged,
    ...(withImage ? { image: { url: "attachment://model-card.png" } } : {}),
  };
}

/** A compact one-line form used by lists and digests. */
export function modelLine(snapshot: ModelSnapshot): string {
  const url = safeUrl(snapshot.evidence[0]?.url);
  const name = url ? `[${snapshot.displayName}](${url})` : `**${snapshot.displayName}**`;
  const marks = [snapshot.version ? `v${snapshot.version}` : "", snapshot.tier ?? "", snapshot.channel === "ga" ? "" : snapshot.channel]
    .filter(Boolean)
    .join(" ");
  return `${code(snapshot.slug)} — ${name}${marks ? ` · ${marks}` : ""}`;
}

/** Splits long bodies across the 4096-character embed description limit. */
export function paginate(lines: string[], limit = 3900): string[] {
  const pages: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > limit) {
      if (current) pages.push(current);
      current = line;
    } else current = current ? `${current}\n${line}` : line;
  }
  if (current) pages.push(current);
  return pages.length ? pages : ["Nothing to show."];
}

export function listEmbed(title: string, lines: string[], color: number = COLORS.info): Embed[] {
  return paginate(lines).slice(0, 4).map((description, index) => ({
    title: index === 0 ? clip(title, 256) : clip(`${title} · continued`, 256),
    description,
    color,
    footer: { text: "model-watcher · every slug is copied verbatim from its source" },
  }));
}

export function vendorEmbed(report: VendorReport): Embed {
  const fields = [...report.byModality.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 12)
    .map(([modality, models]) => ({
      name: `${MODALITY_ICON[modality] ?? "•"} ${modality} · ${models.length}`,
      value: clip(models.slice(0, 8).map((model) => code(model.slug)).join("\n") || "None tracked", 1024),
      inline: true,
    }));
  return {
    title: clip(`${report.vendorName} · ${report.total} tracked models`, 256),
    url: report.homepage,
    description: [
      `Country of origin: **${report.country}**`,
      `Newest tracked slugs:`,
      ...report.newest.slice(0, 6).map((model) => `• ${modelLine(model)}`),
    ].join("\n"),
    color: COLORS.info,
    fields: fields.slice(0, 25),
    footer: { text: "model-watcher · counts exclude dated snapshots and rolling aliases" },
  };
}

export function compareEmbed(a: ModelSnapshot, b: ModelSnapshot): Embed {
  const row = (label: string, left: string, right: string) => [
    { name: label, value: clip(left, 1024), inline: true },
    { name: "​", value: clip(right, 1024), inline: true },
    { name: "​", value: "​", inline: true },
  ];
  return {
    title: clip(`${a.displayName} vs ${b.displayName}`, 256),
    description: `${code(a.slug)} vs ${code(b.slug)}`,
    color: COLORS.info,
    fields: [
      ...row("Publisher", a.owner ?? "Not verified", b.owner ?? "Not verified"),
      ...row("Modalities", modalityLine(a.modalities), modalityLine(b.modalities)),
      ...row("Context", contextLine(a), contextLine(b)),
      ...row("Channel", channelLabel(a.channel), channelLabel(b.channel)),
      ...row("Published", a.releaseDate ?? "Not published", b.releaseDate ?? "Not published"),
      ...row("Pricing", formatRecord(a.pricing, 4), formatRecord(b.pricing, 4)),
    ].slice(0, 25),
    footer: { text: "model-watcher · fields absent from both sources are marked not published" },
  };
}

export function coverageEmbed(report: Coverage, healthReport: HealthReport): Embed {
  const kinds = Object.entries(report.byKind)
    .sort(([, a], [, b]) => b - a)
    .map(([kind, count]) => `**${kind}:** ${count}`)
    .join("\n");
  const modalities = Object.entries(report.byModality)
    .sort(([, a], [, b]) => b - a)
    .map(([modality, count]) => `${MODALITY_ICON[modality] ?? "•"} ${modality}: ${count}`)
    .join("\n");
  const failing = healthReport.failing.slice(0, 10).map((item) => `${code(item.id)} ×${item.failures}`).join("\n");
  return {
    title: "Watcher coverage",
    description: [
      `**${report.total}** sources configured, **${report.enabled}** enabled in this environment.`,
      `**${report.vendorsCovered}/${report.vendorsTotal}** publishers have a dedicated first-party source.`,
      `**${healthReport.models}** models tracked, **${healthReport.verified}** first-party verified, across **${healthReport.vendorsSeen}** publishers.`,
    ].join("\n"),
    color: healthReport.failing.length > report.total / 4 ? COLORS.emerging : COLORS.verified,
    fields: [
      { name: "Sources by kind", value: clip(kinds || "None", 1024), inline: true },
      { name: "Modality coverage", value: clip(modalities || "None", 1024), inline: true },
      { name: `Failing sources (${healthReport.failing.length})`, value: clip(failing || "None", 1024) },
      ...(report.vendorsWithoutFirstPartySource.length
        ? [{
            name: "Publishers without a first-party source",
            value: clip(report.vendorsWithoutFirstPartySource.map(code).join(" "), 1024),
          }]
        : []),
    ],
    footer: { text: "model-watcher · a failing source is isolated and can never remove a model" },
  };
}

/** Groups minor events into one dated digest. */
export function digestEmbeds(events: ModelEvent[]): Embed[] {
  const lines = [...events]
    .sort(
      (a, b) =>
        (a.after.owner ?? "Unknown").localeCompare(b.after.owner ?? "Unknown") ||
        a.after.displayName.localeCompare(b.after.displayName),
    )
    .map((event) => `• **${event.after.owner ?? "Unattributed"}** — ${modelLine(event.after)} · ${event.changedFields.join(", ")}`);
  return paginate(lines).slice(0, 10).map((description, index) => ({
    title: index === 0 ? `Daily model digest · ${events.length} changes` : "Daily model digest · continued",
    description,
    color: COLORS.info,
    timestamp: new Date().toISOString(),
    footer: { text: "model-watcher · minor changes" },
  }));
}

/** Plain, copy-pasteable slug block for `/slugs`. */
export function slugBlock(models: ModelSnapshot[], limit = 120): string[] {
  const slugs = models.slice(0, limit).map((model) => model.slug);
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const slug of slugs) {
    if (size + slug.length + 1 > 3800) {
      chunks.push(current.join("\n"));
      current = [];
      size = 0;
    }
    current.push(slug);
    size += slug.length + 1;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks.length ? chunks.map((chunk) => `\`\`\`\n${chunk}\n\`\`\``) : ["```\n(no matching slugs)\n```"];
}

/** Sorts a modality list into a stable, human-friendly order. */
export function orderModalities(modalities: readonly string[]): Modality[] {
  const order: Modality[] = ["text", "code", "image", "video", "audio", "speech", "music", "3d", "world", "embedding", "rerank", "moderation"];
  return order.filter((modality) => modalities.includes(modality));
}

/** Convenience for callers that only hold a slug string. */
export function slugSummary(slug: string): string {
  const parts = parseSlug(slug);
  return [
    `canonical ${code(parts.canonical)}`,
    parts.namespace ? `namespace ${code(parts.namespace)}` : "",
    parts.version ? `version ${parts.version}` : "",
    parts.tier ? `tier ${parts.tier}` : "",
    `channel ${channelLabel(parts.channel)}`,
    `class ${parts.slugClass}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

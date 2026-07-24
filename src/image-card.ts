import sharp from "sharp";
import type { ModelEvent } from "./types.ts";
import { channelLabel } from "./catalog/index.ts";

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

const HEADLINE: Record<ModelEvent["type"], string> = {
  added: "NEW MODEL",
  verified: "NOW VERIFIED",
  reintroduced: "REINTRODUCED",
  removed: "REMOVED",
  updated: "UPDATED",
};

/**
 * A 1200×675 card whose focal point is the exact slug, because the slug is
 * the one thing a reader needs to act on. Every value shown also appears in
 * the accompanying embed, backed by the same evidence.
 */
export async function renderModelCard(event: ModelEvent): Promise<Buffer> {
  const model = event.after;
  const verified = model.confidence === "verified";
  const stealth = model.capabilities["stealth"] === true;
  const accent = stealth ? "#b07de8" : verified ? "#37d67a" : "#f6c344";
  const headline = event.type === "updated" ? `UPDATED · ${event.changedFields.slice(0, 3).join(", ")}` : HEADLINE[event.type];
  const modalities = model.modalities.length ? model.modalities.join("  •  ") : "Modalities not published";
  const facts = [
    model.version ? `v${model.version}` : "",
    model.tier ?? "",
    channelLabel(model.channel),
    typeof model.limits["contextTokens"] === "number" ? `${Number(model.limits["contextTokens"]).toLocaleString("en-US")} ctx` : "",
    model.releaseDate ?? "",
  ]
    .filter(Boolean)
    .join("   •   ");

  const svg = `
    <svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#202a44"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="675" rx="32" fill="url(#bg)"/>
      <rect x="0" y="0" width="14" height="675" fill="${accent}"/>
      <text x="72" y="88" fill="${accent}" font-size="26" font-family="Arial, sans-serif" font-weight="700" letter-spacing="3">${xml(truncate(headline.toUpperCase(), 46))}</text>
      <text x="72" y="176" fill="#8f9bb3" font-size="24" font-family="Arial, sans-serif" letter-spacing="2">${xml(truncate(model.owner ?? "PUBLISHER NOT VERIFIED", 44).toUpperCase())}</text>
      <text x="72" y="256" fill="#ffffff" font-size="58" font-family="Arial, sans-serif" font-weight="700">${xml(truncate(model.displayName, 32))}</text>
      <rect x="72" y="298" width="1056" height="76" rx="12" fill="#0b101d" stroke="#39445c"/>
      <text x="96" y="346" fill="${accent}" font-size="32" font-family="Consolas, 'Courier New', monospace">${xml(truncate(model.slug, 48))}</text>
      <text x="72" y="430" fill="#dce4f2" font-size="27" font-family="Arial, sans-serif">${xml(truncate(modalities, 66))}</text>
      <text x="72" y="482" fill="#9eabc2" font-size="23" font-family="Arial, sans-serif">${xml(truncate(facts || "No published specifications", 88))}</text>
      <rect x="72" y="535" width="230" height="58" rx="29" fill="${accent}" fill-opacity="0.15" stroke="${accent}"/>
      <text x="187" y="573" fill="${accent}" text-anchor="middle" font-size="22" font-family="Arial, sans-serif" font-weight="700">${stealth ? "UNATTRIBUTED" : verified ? "VERIFIED" : "EMERGING"}</text>
      <text x="1128" y="573" fill="#7f8ba3" text-anchor="end" font-size="20" font-family="Arial, sans-serif">MODEL WATCHER</text>
      <text x="72" y="634" fill="#647089" font-size="18" font-family="Arial, sans-serif">Every field above is read from the linked evidence in the Discord message.</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

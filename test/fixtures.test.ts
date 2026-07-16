import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { htmlCatalog, huggingFaceOrg, openRouter } from "../src/sources/factories.ts";

test("deterministic HTML parser extracts frontier video families", async () => {
  const body = await readFile(new URL("./fixtures/frontier.html", import.meta.url), "utf8");
  const source = htmlCatalog({
    id: "fixture",
    kind: "official-page",
    owner: "Fixture Lab",
    url: "https://example.com/models",
    intervalMinutes: 30,
    patterns: [
      { family: "Seedance", modalities: ["video"], expression: /(?<model>Seedance\s+\d+(?:\.\d+)*)/gi },
      { family: "Seedream", modalities: ["image"], expression: /(?<model>Seedream\s+\d+(?:\.\d+)*(?:\s+Lite)?)/gi },
      { family: "Vidu", modalities: ["video"], expression: /(?<model>ViduQ\d+(?:\s+Pro)?)/gi },
      { family: "Kling", modalities: ["video"], expression: /(?<model>Kling\s+\d+(?:\.\d+)*(?:\s+Omni)?)/gi },
      { family: "Hailuo", modalities: ["video"], expression: /(?<model>Hailuo\s+\d+(?:\.\d+)*)/gi },
      { family: "HappyHorse", modalities: ["video"], expression: /(?<model>HappyHorse-\d+(?:\.\d+)*)/gi },
    ],
  });
  const models = source.parse({ url: source.url, status: 200, body, fetchedAt: new Date().toISOString() });
  assert.deepEqual(models.map((model) => model.displayName), [
    "Seedance 2.0", "Seedream 5.0 Lite", "ViduQ3 Pro", "Kling 3.0 Omni", "Hailuo 2.3", "HappyHorse-1.1",
  ]);
});

test("Hugging Face parser keeps generative models and filters unrelated pipelines", async () => {
  const body = await readFile(new URL("./fixtures/huggingface.json", import.meta.url), "utf8");
  const source = huggingFaceOrg({ id: "official:hf:nvidia", org: "NVIDIA", owner: "NVIDIA" });
  const models = source.parse({ url: source.url, status: 200, body, fetchedAt: new Date().toISOString() });
  assert.deepEqual(models.map((model) => model.displayName), ["Nemotron-4-Ultra", "Cosmos-3"]);
  assert.deepEqual(models.map((model) => model.modalities), [["text"], ["video"]]);
});

test("OpenRouter parser preserves modalities, context, pricing, and discovery-only ownership", async () => {
  const body = await readFile(new URL("./fixtures/openrouter.json", import.meta.url), "utf8");
  const source = openRouter();
  const models = source.parse({ url: source.url, status: 200, body, fetchedAt: new Date().toISOString() });
  assert.equal(models.length, 1);
  assert.equal(models[0]?.owner, undefined);
  assert.deepEqual(models[0]?.modalities, ["text", "image"]);
  assert.equal(models[0]?.limits.contextTokens, 262144);
});

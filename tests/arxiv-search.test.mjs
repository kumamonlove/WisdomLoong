import assert from "node:assert/strict";
import test from "node:test";
import { searchArxiv } from "../lib/arxiv-search.ts";

test("falls back to an arXiv-indexed provider when the official API is rate limited", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let officialCalls = 0;
  let fallbackCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://export.arxiv.org/")) {
      officialCalls += 1;
      return new Response("rate limited", { status: 429 });
    }
    fallbackCalls += 1;
    return Response.json([{
      paper: {
        id: "1706.03762",
        title: "Attention Is All You Need",
        summary: "Transformer abstract",
        publishedAt: "2017-06-12T17:57:34.000Z",
        authors: [{ name: "Ashish Vaswani" }],
      },
    }]);
  };

  const results = await searchArxiv(`Attention Is All You Need ${Date.now()}`);

  assert.equal(results[0]?.externalId, "1706.03762");
  assert.equal(results[0]?.sourceUrl, "https://arxiv.org/abs/1706.03762");
  assert.deepEqual(results[0]?.authors, ["Ashish Vaswani"]);
  assert.equal(officialCalls, 1);
  assert.equal(fallbackCalls, 1);
});

test("coalesces concurrent identical searches", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    if (String(input).includes("export.arxiv.org")) return new Response("unavailable", { status: 503 });
    return Response.json([{
      paper: {
        id: "2405.10314",
        title: "OpenVLA",
        summary: "A vision-language-action model.",
        publishedAt: "2024-05-16T00:00:00.000Z",
        authors: [{ name: "Moo Jin Kim" }],
      },
    }]);
  };
  const query = `OpenVLA concurrent ${Date.now()}`;

  const batches = await Promise.all(Array.from({ length: 100 }, () => searchArxiv(query)));

  assert.equal(batches.filter((results) => results[0]?.externalId === "2405.10314").length, 100);
  assert.equal(calls, 2);
});

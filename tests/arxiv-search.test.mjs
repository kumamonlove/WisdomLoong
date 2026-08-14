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
  assert.equal(calls, 1);
});

test("uses DataCite arXiv DOI metadata when live search providers fail", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("export.arxiv.org")) return new Response("rate limited", { status: 429 });
    if (url.includes("huggingface.co")) return new Response("unavailable", { status: 503 });
    if (url.includes("api.datacite.org")) {
      return Response.json({
        data: [{
          id: "10.48550/arxiv.2405.12213",
          attributes: {
            doi: "10.48550/arxiv.2405.12213",
            titles: [{ title: "Octo: An Open-Source Generalist Robot Policy" }],
            creators: [{ name: "Octo Model Team" }],
            published: "2024-05-20",
            descriptions: [{ descriptionType: "Abstract", description: "A generalist robot policy." }],
          },
        }],
      });
    }
    throw new Error(`unexpected provider call: ${url}`);
  };

  const results = await searchArxiv(`Octo metadata fallback ${Date.now()}`);

  assert.equal(results[0]?.externalId, "2405.12213");
  assert.equal(results[0]?.abstract, "A generalist robot policy.");
  assert.deepEqual(results[0]?.authors, ["Octo Model Team"]);
});

test("uses OpenAlex when both primary arXiv providers are unavailable", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("export.arxiv.org")) return new Response("rate limited", { status: 429 });
    if (url.includes("huggingface.co")) return new Response("unavailable", { status: 503 });
    return Response.json({
      results: [{
        display_name: "Code as Policies: Language Model Programs for Embodied Control",
        publication_date: "2022-09-16",
        authorships: [{ author: { display_name: "Jacky Liang" } }],
        locations: [{ landing_page_url: "http://arxiv.org/abs/2209.07753" }],
        abstract_inverted_index: { Language: [0], models: [1], write: [2], robot: [3], code: [4] },
      }],
    });
  };

  const results = await searchArxiv(`Code as Policies outage ${Date.now()}`);

  assert.equal(results[0]?.externalId, "2209.07753");
  assert.equal(results[0]?.abstract, "Language models write robot code");
  assert.deepEqual(results[0]?.authors, ["Jacky Liang"]);
  assert.ok(calls.some((url) => url.includes("api.openalex.org")));
});

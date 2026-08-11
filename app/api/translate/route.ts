import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  academicTranslationSystemPrompt,
  getAcademicTranslationConfig,
} from "@/lib/academic-translation";

export const runtime = "nodejs";

type TranslationResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

type TranslationStreamChunk = {
  choices?: { delta?: { content?: string }; message?: { content?: string } }[];
};

type BatchTranslationItem = { index?: number; translation?: string };

const translationCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 100;

function cacheTranslation(key: string, translation: string) {
  if (translationCache.has(key)) translationCache.delete(key);
  translationCache.set(key, translation);
  if (translationCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = translationCache.keys().next().value;
    if (oldestKey) translationCache.delete(oldestKey);
  }
}

function parseBatchTranslations(content: string, expectedIndexes: number[]) {
  const unfenced = content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const arrayStart = unfenced.indexOf("[");
  const arrayEnd = unfenced.lastIndexOf("]");
  if (arrayStart < 0 || arrayEnd <= arrayStart) throw new Error("batch translation is not JSON");
  const parsed = JSON.parse(unfenced.slice(arrayStart, arrayEnd + 1)) as BatchTranslationItem[];
  const translations = new Map<number, string>();
  for (const item of parsed) {
    const index = Number(item.index);
    const translation = item.translation?.trim();
    if (Number.isInteger(index) && translation) translations.set(index, translation);
  }
  if (expectedIndexes.some((index) => !translations.has(index))) {
    throw new Error("batch translation result is incomplete");
  }
  return translations;
}

async function translateBatch(
  texts: string[],
  config: ReturnType<typeof getAcademicTranslationConfig>,
) {
  const results = new Array<string>(texts.length);
  const missing: { index: number; text: string }[] = [];
  for (const [index, text] of texts.entries()) {
    const cacheKey = `${config.model}\n${text}`;
    const cached = translationCache.get(cacheKey);
    if (cached) {
      cacheTranslation(cacheKey, cached);
      results[index] = cached;
    } else {
      missing.push({ index, text });
    }
  }
  if (missing.length === 0) return results;

  const upstreamBody = JSON.stringify({
    model: config.model,
    temperature: 0,
    stream: false,
    max_tokens: Math.min(6_000, Math.max(512, Math.ceil(missing.reduce((sum, item) => sum + item.text.length, 0) * 1.25))),
    messages: [
      {
        role: "system",
        content: `${academicTranslationSystemPrompt} You will receive a JSON array of independent excerpts. Translate every excerpt independently. Return only a JSON array with exactly one object per input, preserving each index, in this format: [{"index":0,"translation":"..."}]. Do not merge, omit, reorder, summarize, or add commentary.`,
      },
      { role: "user", content: JSON.stringify(missing) },
    ],
  });
  const requestTranslation = () => fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: upstreamBody,
    signal: AbortSignal.timeout(45_000),
  });
  let response = await requestTranslation();
  if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
    await response.body?.cancel().catch(() => undefined);
    response = await requestTranslation();
  }
  const data = (await response.json().catch(() => ({}))) as TranslationResponse;
  if (!response.ok) throw new Error(`batch translation gateway failed (${response.status}): ${data.error?.message ?? "unknown error"}`);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("batch translation returned an empty result");
  const translated = parseBatchTranslations(content, missing.map((item) => item.index));
  for (const item of missing) {
    const translation = translated.get(item.index)!;
    results[item.index] = translation;
    cacheTranslation(`${config.model}\n${item.text}`, translation);
  }
  return results;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = (await request.json()) as { text?: string; texts?: unknown };
  if (body.texts !== undefined) {
    if (!Array.isArray(body.texts)) {
      return NextResponse.json({ error: "批量翻译内容格式不正确" }, { status: 400 });
    }
    const texts = body.texts.map((item) => typeof item === "string" ? item.trim() : "");
    const totalLength = texts.reduce((sum, item) => sum + item.length, 0);
    if (texts.length === 0 || texts.length > 12 || texts.some((item) => !item || item.length > 12_000) || totalLength > 12_000) {
      return NextResponse.json({ error: "每批最多 12 条且总长度不得超过 12000 个字符" }, { status: 400 });
    }
    const config = getAcademicTranslationConfig();
    if (!config.apiKey) {
      return NextResponse.json({ error: "论文翻译尚未配置 API Key，请联系管理员" }, { status: 503 });
    }
    try {
      const translations = await translateBatch(texts, config);
      return NextResponse.json({ translations }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      console.error("Batch paper translation failed", error);
      return NextResponse.json({ error: "批量翻译服务暂时不可用，请稍后重试" }, { status: 502 });
    }
  }
  const text = body.text?.trim();
  if (!text || text.length > 12_000) {
    return NextResponse.json(
      { error: "请选择或粘贴 1–12000 个字符的论文原文" },
      { status: 400 },
    );
  }

  const { apiKey, baseUrl, model } = getAcademicTranslationConfig();
  if (!apiKey) {
    return NextResponse.json(
      { error: "论文翻译尚未配置 API Key，请联系管理员" },
      { status: 503 },
    );
  }

  const cacheKey = `${model}\n${text}`;
  const cached = translationCache.get(cacheKey);
  if (cached) {
    cacheTranslation(cacheKey, cached);
    return new Response(cached, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Translation-Cache": "hit",
      },
    });
  }

  try {
    const upstreamBody = JSON.stringify({
      model,
      temperature: 0,
      stream: true,
      max_tokens: Math.min(6_000, Math.max(256, Math.ceil(text.length * 1.25))),
      messages: [
        {
          role: "system",
          content: academicTranslationSystemPrompt,
        },
        { role: "user", content: text },
      ],
    });
    const requestTranslation = () => fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: upstreamBody,
      signal: AbortSignal.timeout(150_000),
    });
    let response = await requestTranslation();
    if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      response = await requestTranslation();
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as TranslationResponse;
      console.error("Translation gateway failed", response.status, data.error?.message);
      return NextResponse.json(
        { error: "翻译网关响应异常，请稍后重试" },
        { status: 502 },
      );
    }

    if (!response.body) throw new Error("empty translation response");

    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      const data = (await response.json()) as TranslationResponse;
      const translation = data.choices?.[0]?.message?.content?.trim();
      if (!translation) throw new Error("invalid translation response");
      cacheTranslation(cacheKey, translation);
      return new Response(translation, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Translation-Cache": "miss",
        },
      });
    }

    const upstreamReader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    let translation = "";
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await upstreamReader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const data = JSON.parse(payload) as TranslationStreamChunk;
                const content = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content ?? "";
                if (!content) continue;
                translation += content;
                controller.enqueue(encoder.encode(content));
              } catch {
                // Ignore gateway keep-alive or non-JSON event lines.
              }
            }
          }
          const normalized = translation.trim();
          if (!normalized) throw new Error("empty streamed translation");
          cacheTranslation(cacheKey, normalized);
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          upstreamReader.releaseLock();
        }
      },
      cancel() {
        void upstreamReader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Translation-Cache": "miss",
      },
    });
  } catch (error) {
    console.error("Paper translation failed", error);
    return NextResponse.json(
      { error: "翻译服务暂时不可用，请稍后重试" },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

type TranslationResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

type TranslationStreamChunk = {
  choices?: { delta?: { content?: string }; message?: { content?: string } }[];
};

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

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim();
  if (!text || text.length > 12_000) {
    return NextResponse.json(
      { error: "请选择或粘贴 1–12000 个字符的论文原文" },
      { status: 400 },
    );
  }

  const apiKey = process.env.TRANSLATION_API_KEY ?? process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "论文翻译尚未配置 API Key，请联系管理员" },
      { status: 503 },
    );
  }

  const baseUrl = (
    process.env.TRANSLATION_BASE_URL ??
    process.env.DASHSCOPE_BASE_URL ??
    "https://api.silra.cn/v1"
  ).replace(/\/$/, "");
  const model = process.env.TRANSLATION_MODEL ?? "deepseek-chat";
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
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        stream: true,
        max_tokens: Math.min(6_000, Math.max(256, Math.ceil(text.length * 1.25))),
        messages: [
          {
            role: "system",
            content: "Translate academic papers into precise, fluent Simplified Chinese. Preserve equations, symbols, variables, citations, model and dataset names, and standard English abbreviations. Keep technical terminology consistent. Return only the translation.",
          },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
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

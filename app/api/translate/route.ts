import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

type TranslationResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

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

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "论文翻译尚未配置百炼 API Key，请联系管理员" },
      { status: 503 },
    );
  }

  const baseUrl = (
    process.env.DASHSCOPE_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DASHSCOPE_TRANSLATION_MODEL ?? "qwen-mt-plus",
        messages: [{ role: "user", content: text }],
        translation_options: {
          source_lang: "auto",
          target_lang: "Chinese",
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = (await response.json()) as TranslationResponse;
    const translation = data.choices?.[0]?.message?.content?.trim();
    if (!response.ok || !translation) {
      console.error("DashScope translation failed", response.status, data.error?.message);
      throw new Error("invalid translation response");
    }
    return NextResponse.json({ translation });
  } catch (error) {
    console.error("Paper translation failed", error);
    return NextResponse.json(
      { error: "翻译服务暂时不可用，请稍后重试" },
      { status: 502 },
    );
  }
}

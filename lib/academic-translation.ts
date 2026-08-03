type TranslationResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

export const academicTranslationSystemPrompt =
  "Translate academic papers into precise, fluent Simplified Chinese. Preserve equations, symbols, variables, citations, model and dataset names, and standard English abbreviations. Keep technical terminology consistent. Return only the translation.";

export function getAcademicTranslationConfig() {
  return {
    apiKey: process.env.TRANSLATION_API_KEY ?? process.env.DASHSCOPE_API_KEY,
    baseUrl: (
      process.env.TRANSLATION_BASE_URL ??
      process.env.DASHSCOPE_BASE_URL ??
      "https://api.silra.cn/v1"
    ).replace(/\/$/, ""),
    model: process.env.TRANSLATION_MODEL ?? "deepseek-chat",
  };
}

export async function translateAcademicText(text: string) {
  const normalizedText = text.trim();
  if (!normalizedText) return "";

  const { apiKey, baseUrl, model } = getAcademicTranslationConfig();
  if (!apiKey) throw new Error("translation API key is not configured");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      stream: false,
      max_tokens: Math.min(6_000, Math.max(256, Math.ceil(normalizedText.length * 1.25))),
      messages: [
        { role: "system", content: academicTranslationSystemPrompt },
        { role: "user", content: normalizedText },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const data = (await response.json().catch(() => ({}))) as TranslationResponse;
  if (!response.ok) {
    throw new Error(`translation gateway failed (${response.status}): ${data.error?.message ?? "unknown error"}`);
  }

  const translation = data.choices?.[0]?.message?.content?.trim();
  if (!translation) throw new Error("translation gateway returned an empty result");
  return translation;
}

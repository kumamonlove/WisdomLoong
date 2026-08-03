import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cacheDirectory = process.env.PDF_CACHE_DIR || "/srv/wisdomloong/pdf-cache";
const systemPrompt =
  "Translate academic papers into precise, fluent Simplified Chinese. Preserve equations, symbols, variables, citations, model and dataset names, and standard English abbreviations. Keep technical terminology consistent. Return only the translation.";
const abstractHeading = /(?:^|\s)(?:abstract|summary)\s*(?:[—–:\-]\s*)?/i;
const followingHeading = /\s+(?:(?:(?:i|1)\s*[.\-:]?\s*)?i\s*n\s*t\s*r\s*o\s*d\s*u\s*c\s*t\s*i\s*o\s*n|i\s*n\s*d\s*e\s*x\s+t\s*e\s*r\s*m\s*s?|k\s*e\s*y\s*w\s*o\s*r\s*d\s*s?|c\s*c\s*s\s+c\s*o\s*n\s*c\s*e\s*p\s*t\s*s?)\b/i;

function normalizeExtractedText(text) {
  return text
    .replace(/\u00ad/g, "")
    .replace(/([A-Za-z])[-‐]\s+([a-z])/g, "$1$2")
    .replace(/\b([A-Z])\s+([A-Z]{2,})\b/g, "$1$2")
    .replace(/\s*([∗*])\s*/g, "$1")
    .replace(/(\d)\.\s+(\d)/g, "$1.$2")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

export function findAbstractInText(text) {
  const searchable = text.slice(0, 30_000);
  const start = abstractHeading.exec(searchable);
  if (!start) return "";
  const remainder = searchable.slice(start.index + start[0].length);
  const end = followingHeading.exec(remainder);
  const candidate = normalizeExtractedText(remainder.slice(0, end?.index ?? 6_000));
  return candidate.length >= 80 ? candidate.slice(0, 6_000) : "";
}

async function extractAbstract(pdfPath) {
  const { stdout } = await execFileAsync(
    "pdftotext",
    ["-f", "1", "-l", "3", "-raw", "-enc", "UTF-8", pdfPath, "-"],
    { maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
  );
  return findAbstractInText(stdout);
}

async function translate(text) {
  const apiKey = process.env.TRANSLATION_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("translation API key is not configured");
  const baseUrl = (
    process.env.TRANSLATION_BASE_URL ||
    process.env.DASHSCOPE_BASE_URL ||
    "https://api.silra.cn/v1"
  ).replace(/\/$/, "");
  const model = process.env.TRANSLATION_MODEL || "deepseek-chat";
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
      max_tokens: Math.min(6_000, Math.max(256, Math.ceil(text.length * 1.25))),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`translation gateway failed (${response.status})`);
  const result = data.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error("translation gateway returned an empty result");
  return result;
}

async function psql(command, variables = {}) {
  const args = ["-u", "postgres", "psql", "--dbname=wisdomloong", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"];
  for (const [key, value] of Object.entries(variables)) args.push(`--set=${key}=${value}`);
  args.push("--command", command);
  return (await execFileAsync("sudo", args, { maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
}

async function missingArticles() {
  const json = await psql(`SELECT COALESCE(JSON_AGG(ROW_TO_JSON(item)), '[]'::json)
    FROM (
      SELECT id, title, abstract
      FROM articles
      WHERE abstract = '' OR abstract_zh = ''
      ORDER BY id
    ) item`);
  return JSON.parse(json || "[]");
}

async function saveArticle(articleId, abstract, abstractZh) {
  await psql(
    `UPDATE articles
     SET abstract = CASE WHEN abstract = '' THEN CONVERT_FROM(DECODE(:'abstract_b64', 'base64'), 'UTF8') ELSE abstract END,
         abstract_zh = CASE WHEN abstract_zh = '' THEN CONVERT_FROM(DECODE(:'abstract_zh_b64', 'base64'), 'UTF8') ELSE abstract_zh END
     WHERE id = :'article_id'::integer`,
    {
      article_id: String(articleId),
      abstract_b64: Buffer.from(abstract).toString("base64"),
      abstract_zh_b64: Buffer.from(abstractZh).toString("base64"),
    },
  );
}

async function main() {
  if (process.argv[2] === "--extract") {
    const pdfPath = process.argv[3];
    if (!pdfPath) throw new Error("PDF path is required");
    console.log(await extractAbstract(pdfPath));
    return;
  }

  const articles = await missingArticles();
  console.log(`Abstract backfill candidates: ${articles.length}`);
  for (const article of articles) {
    let abstract = String(article.abstract || "").trim();
    try {
      if (!abstract) {
        const pdfPath = `${cacheDirectory}/${article.id}.pdf`;
        await access(pdfPath);
        abstract = await extractAbstract(pdfPath);
        if (!abstract) {
          console.warn(`Abstract not found: article ${article.id} (${article.title})`);
          continue;
        }
      }
      const abstractZh = await translate(abstract);
      await saveArticle(article.id, abstract, abstractZh);
      console.log(`Abstract backfilled: article ${article.id} (${article.title})`);
    } catch (error) {
      console.warn(`Abstract backfill skipped: article ${article.id} (${article.title}): ${error instanceof Error ? error.message : error}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

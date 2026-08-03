import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api";

const abstractHeading = /(?:^|\s)(?:abstract|summary)\s*(?:[—–:\-]\s*)?/i;
// Small-caps fonts are often exposed by PDF.js as "I NTRODUCTION", so allow
// whitespace between heading letters while keeping the section boundary strict.
const followingHeading = /\s+(?:(?:(?:i|1)\s*[.\-:]?\s*)?i\s*n\s*t\s*r\s*o\s*d\s*u\s*c\s*t\s*i\s*o\s*n|i\s*n\s*d\s*e\s*x\s+t\s*e\s*r\s*m\s*s?|k\s*e\s*y\s*w\s*o\s*r\s*d\s*s?|c\s*c\s*s\s+c\s*o\s*n\s*c\s*e\s*p\s*t\s*s?)\b/i;

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return "str" in item;
}

function normalizeExtractedText(text: string) {
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

const monthNumbers = new Map([
  ["january", 1], ["jan", 1], ["february", 2], ["feb", 2],
  ["march", 3], ["mar", 3], ["april", 4], ["apr", 4], ["may", 5],
  ["june", 6], ["jun", 6], ["july", 7], ["jul", 7],
  ["august", 8], ["aug", 8], ["september", 9], ["sept", 9], ["sep", 9],
  ["october", 10], ["oct", 10], ["november", 11], ["nov", 11],
  ["december", 12], ["dec", 12],
]);

function validIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 || year > new Date().getUTCFullYear() + 1 ||
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
  ) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function findPublishedAtInText(text: string) {
  const searchable = text.slice(0, 12_000);
  const iso = /\b(19\d{2}|20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/.exec(searchable);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const monthFirst = new RegExp(
    `\\b(${[...monthNumbers.keys()].join("|")})\\.?\\s+([0-2]?\\d|3[01])(?:st|nd|rd|th)?[,]?\\s+(19\\d{2}|20\\d{2})\\b`,
    "i",
  ).exec(searchable);
  if (monthFirst) {
    return validIsoDate(Number(monthFirst[3]), monthNumbers.get(monthFirst[1].toLowerCase()) ?? 0, Number(monthFirst[2]));
  }

  const dayFirst = new RegExp(
    `\\b([0-2]?\\d|3[01])(?:st|nd|rd|th)?\\s+(${[...monthNumbers.keys()].join("|")})\\.?[,]?\\s+(19\\d{2}|20\\d{2})\\b`,
    "i",
  ).exec(searchable);
  if (dayFirst) {
    return validIsoDate(Number(dayFirst[3]), monthNumbers.get(dayFirst[2].toLowerCase()) ?? 0, Number(dayFirst[1]));
  }

  return "";
}

function findPublishedAtInPdfMetadata(value: unknown) {
  if (typeof value !== "string") return "";
  const match = /^D:(19\d{2}|20\d{2})(\d{2})(\d{2})/.exec(value);
  return match ? validIsoDate(Number(match[1]), Number(match[2]), Number(match[3])) : "";
}

export function findAbstractInText(text: string) {
  const searchable = text.slice(0, 30_000);
  const start = abstractHeading.exec(searchable);
  if (!start) return "";

  const contentStart = start.index + start[0].length;
  const remainder = searchable.slice(contentStart);
  const end = followingHeading.exec(remainder);
  const candidate = normalizeExtractedText(remainder.slice(0, end?.index ?? 6_000));

  if (candidate.length < 80) return "";
  return candidate.slice(0, 6_000);
}

export async function extractPdfFrontMatter(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  });

  try {
    const document = await loadingTask.promise;
    const pages: string[] = [];
    const pageLimit = Math.min(3, document.numPages);

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter(isTextItem)
          .map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`)
          .join(""),
      );
      page.cleanup();
    }

    const text = pages.join("\n");
    const metadata = await document.getMetadata().catch(() => null);
    const info = metadata?.info as unknown as Record<string, unknown> | undefined;
    const result = {
      abstract: findAbstractInText(text),
      publishedAt: findPublishedAtInText(pages[0] ?? "") || findPublishedAtInPdfMetadata(info?.CreationDate),
    };
    await document.destroy();
    return result;
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function extractPdfAbstract(buffer: Buffer) {
  return (await extractPdfFrontMatter(buffer)).abstract;
}

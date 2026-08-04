"use client";

import { useRouter } from "next/navigation";
import {
  Fragment,
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type CSSProperties,
} from "react";
import { articleCategories, normalizeTags } from "@/lib/knowledge-types";
import type { ReaderArticle } from "@/lib/knowledge";
import { ReadingNoteLikeButton } from "@/app/review-actions";
import { ArticleMetadataEditor } from "@/app/article-metadata-editor";
import { MathTitle } from "@/app/math-title";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

type ArxivResult = {
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: string;
  publisher: string;
  sourceUrl: string;
  externalId: string;
};

async function responseJson(response: Response) {
  const data = (await response.json()) as { error?: string; [key: string]: unknown };
  if (!response.ok) {
    throw new Error(data.error ?? "操作失败，请稍后重试");
  }
  return data;
}

function useExistingTags() {
  const [existingTags, setExistingTags] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/articles/tags")
      .then(responseJson)
      .then((data) => {
        if (active) setExistingTags(data.tags as string[]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return existingTags;
}

function ArxivLookup({
  addToReadingList,
  onImported,
}: {
  addToReadingList: boolean;
  onImported?: (article: ReaderArticle) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArxivResult[]>([]);
  const [publisher, setPublisher] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const existingTags = useExistingTags();

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/arxiv?title=${encodeURIComponent(query)}`);
      const data = await responseJson(response);
      const nextResults = data.results as ArxivResult[];
      setResults(nextResults);
      if (nextResults.length === 0) {
        setMessage("arXiv 没有找到匹配文章，请尝试更完整或更准确的英文标题。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "检索失败");
    } finally {
      setBusy(false);
    }
  }

  async function importArticle(article: ArxivResult) {
    if (tags.length === 0) {
      setMessage("请至少添加一个文章标签。");
      return;
    }
    setImportingId(article.externalId);
    setMessage("");
    try {
      const response = await fetch("/api/articles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...article,
          publisher: publisher.trim() || article.publisher,
          tags,
          addToReadingList,
        }),
      });
      const data = await responseJson(response);
      const articleId = Number(data.articleId);
      const abstractMessage = data.abstractTranslated
        ? "英文摘要和中文摘要已自动保存。"
        : article.abstract
          ? "英文摘要已保存；中文摘要翻译暂未完成，后台将自动重试。"
          : "这篇文章没有可用摘要。";
      setMessage(`文章已推荐到团队文章库，可以开始阅读。${abstractMessage}`);
      onImported?.({
        id: articleId,
        title: article.title,
        abstract: article.abstract,
        abstractZh: String(data.abstractZh ?? ""),
        authors: article.authors,
        publisher: publisher.trim() || article.publisher,
        category: "Ego第一人称",
        tags,
        publishedAt: article.publishedAt,
        sourceUrl: article.sourceUrl,
        lastReadPage: null,
        lastReadPositionY: null,
        isRead: false,
        savedAnnotations: [],
        ownReview: null,
      });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="lookup-panel">
      <form className="lookup-form" onSubmit={search}>
        <label>
          文章名称
          <div>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入 arXiv 论文标题"
              required
              type="search"
              value={query}
            />
            <button disabled={busy} type="submit">
              {busy ? "正在连接…" : "自动查找"}
            </button>
          </div>
        </label>
        <label>
          发布机构（选填）
          <input
            onChange={(event) => setPublisher(event.target.value)}
            value={publisher}
          />
        </label>
      </form>
      <div className="tag-editor">
        <span>文章标签（至少 1 个；新标签会自动进入知识图谱）</span>
        {existingTags.some((tag) => !tags.includes(tag)) && (
          <div className="existing-tag-picker">
            <small>点击添加已有标签</small>
            <div>
              {existingTags
                .filter((tag) => !tags.includes(tag))
                .map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTags((current) => normalizeTags([...current, tag]))}
                    type="button"
                  >
                    ＋ {tag}
                  </button>
                ))}
            </div>
          </div>
        )}
        <div className="tag-editor-row">
          <div className="editable-tags">
            {tags.map((tag) => (
              <button
                aria-label={`移除标签 ${tag}`}
                key={tag}
                onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                type="button"
              >
                {tag} ×
              </button>
            ))}
          </div>
          <input
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== ",") return;
              event.preventDefault();
              setTags((current) => normalizeTags([...current, tagDraft]));
              setTagDraft("");
            }}
            placeholder="输入标签后按 Enter"
            value={tagDraft}
          />
          <button
            onClick={() => {
              setTags((current) => normalizeTags([...current, tagDraft]));
              setTagDraft("");
            }}
            type="button"
          >
            添加
          </button>
        </div>
      </div>

      {message && <p className="workflow-message" role="status">{message}</p>}

      {results.length > 0 && (
        <div className="lookup-results">
          {results.map((article) => (
            <article key={article.externalId}>
              <div>
                <span>{article.externalId}</span>
                <span>
                  {(publisher.trim() || article.publisher) !== "机构待补充"
                    ? `${publisher.trim() || article.publisher} · `
                    : ""}
                  {article.publishedAt}
                </span>
              </div>
              <h3><MathTitle title={article.title} /></h3>
              <p className="lookup-authors">{article.authors.join(", ")}</p>
              <p className="lookup-abstract">{article.abstract}</p>
              <footer>
                <a href={article.sourceUrl} rel="noreferrer" target="_blank">
                  查看 arXiv ↗
                </a>
                <button
                  disabled={importingId !== null}
                  onClick={() => importArticle(article)}
                  type="button"
                >
                  {importingId === article.externalId
                    ? "正在导入…"
                    : addToReadingList
                      ? "推荐给团队"
                      : "推荐并开始阅读"}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReadingListImporter({
  onImported,
}: {
  onImported?: (article: ReaderArticle) => void;
}) {
  const [method, setMethod] = useState<"arxiv" | "pdf">("arxiv");

  return (
    <div className="reading-list-importer">
      <div className="import-method-switch" role="tablist" aria-label="选择导入方式">
        <button
          aria-selected={method === "arxiv"}
          className={method === "arxiv" ? "active" : ""}
          onClick={() => setMethod("arxiv")}
          role="tab"
          type="button"
        >
          从 arXiv 获取
          <small>输入标题，自动下载并缓存</small>
        </button>
        <button
          aria-selected={method === "pdf"}
          className={method === "pdf" ? "active" : ""}
          onClick={() => setMethod("pdf")}
          role="tab"
          type="button"
        >
          上传本地 PDF
          <small>拖入已经下载好的论文</small>
        </button>
      </div>
      {method === "arxiv"
        ? <ArxivLookup addToReadingList={false} onImported={onImported} />
        : <PdfDropImporter onImported={onImported} />}
    </div>
  );
}

function PdfDropImporter({
  onImported,
}: {
  onImported?: (article: ReaderArticle) => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [publisher, setPublisher] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const existingTags = useExistingTags();

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      setMessage("请选择 PDF 文件。");
      return;
    }
    setFile(nextFile);
    setTitle((current) => current || nextFile.name.replace(/\.pdf$/i, ""));
    setMessage("");
  }

  function addTag() {
    setTags((current) => normalizeTags([...current, tagDraft]));
    setTagDraft("");
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("请先拖入或选择一份 PDF。");
      return;
    }
    if (tags.length === 0) {
      setMessage("请至少添加一个文章标签。");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title);
      form.set("tags", JSON.stringify(tags));
      if (publisher.trim()) form.set("publisher", publisher.trim());
      if (publishedAt) form.set("publishedAt", publishedAt);

      const response = await fetch("/api/articles/upload", {
        method: "POST",
        body: form,
      });
      const data = await responseJson(response);
      const abstractMessage = data.abstractTranslated
        ? "已自动识别英文摘要并生成中文摘要。"
        : data.abstractExtracted
          ? "已识别英文摘要；中文摘要翻译暂未完成，后台将自动重试。"
          : "未在 PDF 前 3 页识别到明确摘要，文章仍已正常保存。";
      const dateMessage = data.publishedAtExtracted
        ? ` 同时从 PDF 识别到日期 ${String(data.publishedAt)}。`
        : "";
      setMessage(`PDF 已保存到团队文章库；${abstractMessage}${dateMessage}`);
      onImported?.({
        id: Number(data.articleId),
        title,
        abstract: String(data.abstract ?? ""),
        abstractZh: String(data.abstractZh ?? ""),
        authors: [],
        publisher: publisher.trim() || "机构待补充",
        category: articleCategories.find((item) => tags.includes(item)) ?? articleCategories[0],
        tags,
        publishedAt: String(data.publishedAt ?? "") || null,
        sourceUrl: `/api/articles/${Number(data.articleId)}/pdf`,
        lastReadPage: null,
        lastReadPositionY: null,
        isRead: false,
        savedAnnotations: [],
        ownReview: null,
      });
      setFile(null);
      setTitle("");
      setPublishedAt("");
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pdf-drop-importer" onSubmit={upload}>
      <p className="pdf-download-hint">
        适用于 arXiv 搜索不到的文章：请先从论文官网或其他来源下载 PDF，再拖动导入。
      </p>
      <button
        className={`pdf-drop-zone${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
        onClick={() => fileInput.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          chooseFile(event.dataTransfer.files[0]);
        }}
        type="button"
      >
        <span aria-hidden="true">{file ? "✓" : "⇧"}</span>
        <strong>{file ? file.name : "把 PDF 拖到这里"}</strong>
        <small>
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB · 点击可重新选择`
            : "或点击选择文件，最大 50 MB"}
        </small>
      </button>
      <input
        accept="application/pdf,.pdf"
        className="visually-hidden"
        onChange={(event) => chooseFile(event.target.files?.[0])}
        ref={fileInput}
        type="file"
      />

      <div className="pdf-upload-fields">
        <label>
          文章名称
          <input
            onChange={(event) => setTitle(event.target.value)}
            placeholder="选择 PDF 后自动填写，也可以修改"
            required
            value={title}
          />
        </label>
        <label>
          论文日期（选填）
          <input
            onChange={(event) => setPublishedAt(event.target.value)}
            type="date"
            value={publishedAt}
          />
        </label>
        <label>
          发布机构（选填）
          <input
            onChange={(event) => setPublisher(event.target.value)}
            placeholder="例如 Stanford University"
            value={publisher}
          />
        </label>
      </div>

      <div className="tag-editor">
        <span>文章标签（至少 1 个；新标签会自动进入知识图谱）</span>
        {existingTags.some((tag) => !tags.includes(tag)) && (
          <div className="existing-tag-picker">
            <small>点击添加已有标签</small>
            <div>
              {existingTags
                .filter((tag) => !tags.includes(tag))
                .map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTags((current) => normalizeTags([...current, tag]))}
                    type="button"
                  >
                    ＋ {tag}
                  </button>
                ))}
            </div>
          </div>
        )}
        <div className="tag-editor-row">
          <div className="editable-tags">
            {tags.map((tag) => (
              <button
                aria-label={`移除标签 ${tag}`}
                key={tag}
                onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                type="button"
              >
                {tag} ×
              </button>
            ))}
          </div>
          <input
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== ",") return;
              event.preventDefault();
              addTag();
            }}
            placeholder="输入标签后按 Enter"
            value={tagDraft}
          />
          <button onClick={addTag} type="button">添加</button>
        </div>
      </div>

      {message && <p className="workflow-message" role="status">{message}</p>}
      <button className="pdf-upload-submit" disabled={busy || !file || tags.length === 0} type="submit">
        {busy ? "正在上传并添加…" : "推荐给团队"}
      </button>
    </form>
  );
}

type AnnotationRect = { x: number; y: number; width: number; height: number };
type ReadingNote = {
  page: number;
  quote: string;
  translation: string;
  content: string;
  rect?: AnnotationRect | null;
};
type ReadingBookmark = { page: number; positionY: number };
type CommunityAnnotation = ReadingNote & {
  id: number;
  reviewId: number;
  author: string;
};
type CommunityReview = {
  id: number;
  author: string;
  content: string;
  rating: number;
  reviewType: "long";
  mustRead: boolean;
  likeCount: number;
  likedByViewer: boolean;
  noteFileName: string | null;
  noteSource: "generated" | "uploaded" | null;
  attachments: { id: number; reviewId: number; note: string }[];
};

const pdfjsResourceOptions = {
  cMapPacked: true,
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  useSystemFonts: true,
  wasmUrl: "/pdfjs/wasm/",
};

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取 PDF 文件"));
    reader.readAsDataURL(file);
  });
}

function canvasLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = "";
    for (const character of paragraph || " ") {
      const next = line + character;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

async function generateReadingNotePdf({
  pdfUrl,
  title,
  author,
  notes,
}: {
  pdfUrl: string;
  title: string;
  author: string;
  notes: ReadingNote[];
}) {
  const framedNotes = notes.filter((note) => note.rect);
  if (!pdfUrl || framedNotes.length === 0) throw new Error("请先为至少一条批注画截图框");
  const [{ jsPDF }, pdfjs] = await Promise.all([import("jspdf"), import("pdfjs-dist")]);
  const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = `${workerUrl}?v=1.14.30`;
  const pdfDocument = await pdfjs.getDocument({ url: pdfUrl, ...pdfjsResourceOptions }).promise;
  const output = new jsPDF({ unit: "px", format: [1240, 1754], compress: true, hotfixes: ["px_scaling"] });
  let outputPage = 0;

  function addCanvas(canvas: HTMLCanvasElement) {
    if (outputPage > 0) output.addPage([1240, 1754], "portrait");
    output.addImage(canvas, "JPEG", 0, 0, 1240, 1754, undefined, "FAST");
    outputPage += 1;
  }

  try {
    for (const [index, note] of framedNotes.entries()) {
      const pdfPage = await pdfDocument.getPage(note.page);
      const viewport = pdfPage.getViewport({ scale: 2 });
      const source = window.document.createElement("canvas");
      source.width = Math.ceil(viewport.width);
      source.height = Math.ceil(viewport.height);
      const sourceContext = source.getContext("2d");
      if (!sourceContext) throw new Error("无法创建截图画布");
      await pdfPage.render({ canvas: source, canvasContext: sourceContext, viewport }).promise;
      const rect = note.rect!;
      const cropX = Math.max(0, Math.floor(source.width * rect.x / 100));
      const cropY = Math.max(0, Math.floor(source.height * rect.y / 100));
      const cropWidth = Math.max(1, Math.min(source.width - cropX, Math.ceil(source.width * rect.width / 100)));
      const cropHeight = Math.max(1, Math.min(source.height - cropY, Math.ceil(source.height * rect.height / 100)));

      const pageCanvas = window.document.createElement("canvas");
      pageCanvas.width = 1240;
      pageCanvas.height = 1754;
      const context = pageCanvas.getContext("2d");
      if (!context) throw new Error("无法排版读书笔记");
      context.fillStyle = "#f8f6ef";
      context.fillRect(0, 0, 1240, 1754);
      context.fillStyle = "#d65f40";
      context.fillRect(0, 0, 24, 1754);
      context.fillStyle = "#181816";
      context.font = "700 40px sans-serif";
      const titleLines = canvasLines(context, title, 1080).slice(0, 3);
      titleLines.forEach((line, lineIndex) => context.fillText(line, 80, 105 + lineIndex * 52));
      let y = 105 + titleLines.length * 52 + 28;
      context.fillStyle = "#766f62";
      context.font = "24px sans-serif";
      context.fillText(`${author} · 批注 ${index + 1} · 原文第 ${note.page} 页`, 80, y);
      y += 45;

      const imageMaxWidth = 1080;
      const imageMaxHeight = 720;
      const scale = Math.min(imageMaxWidth / cropWidth, imageMaxHeight / cropHeight, 1.8);
      const imageWidth = cropWidth * scale;
      const imageHeight = cropHeight * scale;
      context.fillStyle = "#ffffff";
      context.fillRect(70, y - 10, imageWidth + 20, imageHeight + 20);
      context.drawImage(source, cropX, cropY, cropWidth, cropHeight, 80, y, imageWidth, imageHeight);
      y += imageHeight + 58;
      context.fillStyle = "#d65f40";
      context.font = "700 22px sans-serif";
      context.fillText("批注", 80, y);
      y += 42;
      context.fillStyle = "#181816";
      context.font = "28px sans-serif";
      const lines = canvasLines(context, note.content, 1080);
      const firstPageCapacity = Math.max(1, Math.floor((1660 - y) / 43));
      lines.slice(0, firstPageCapacity).forEach((line, lineIndex) => context.fillText(line, 80, y + lineIndex * 43));
      addCanvas(pageCanvas);

      let remaining = lines.slice(firstPageCapacity);
      while (remaining.length > 0) {
        const continuation = window.document.createElement("canvas");
        continuation.width = 1240;
        continuation.height = 1754;
        const continuationContext = continuation.getContext("2d")!;
        continuationContext.fillStyle = "#f8f6ef";
        continuationContext.fillRect(0, 0, 1240, 1754);
        continuationContext.fillStyle = "#d65f40";
        continuationContext.fillRect(0, 0, 24, 1754);
        continuationContext.fillStyle = "#181816";
        continuationContext.font = "700 30px sans-serif";
        continuationContext.fillText(`批注 ${index + 1}（续）`, 80, 100);
        continuationContext.font = "28px sans-serif";
        const chunk = remaining.slice(0, 35);
        chunk.forEach((line, lineIndex) => continuationContext.fillText(line, 80, 165 + lineIndex * 43));
        addCanvas(continuation);
        remaining = remaining.slice(chunk.length);
      }
    }
  } finally {
    await pdfDocument.destroy();
  }

  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  return new File([output.output("blob")], `${safeTitle}-读书笔记.pdf`, { type: "application/pdf" });
}

const annotationColors = ["#277da1", "#7b5ea7", "#2a8c6b", "#c06a32", "#b14366", "#56733f"];

function annotationColor(author: string) {
  let hash = 0;
  for (const character of author) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return annotationColors[Math.abs(hash) % annotationColors.length];
}

function annotationDraftStorageKey(articleId: number) {
  return `wisdomloong-annotation-draft-${articleId}`;
}

function rectanglesOverlap(first: AnnotationRect, second: AnnotationRect) {
  return first.x < second.x + second.width && first.x + first.width > second.x &&
    first.y < second.y + second.height && first.y + first.height > second.y;
}

function arxivPageUrl(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    if (!["arxiv.org", "www.arxiv.org"].includes(parsed.hostname)) return null;
    const id = parsed.pathname.match(/^\/(?:abs|pdf)\/([^/]+?)(?:\.pdf)?$/)?.[1];
    return id ? `https://arxiv.org/abs/${id}` : null;
  } catch {
    return null;
  }
}

async function downloadPdfData(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`PDF download failed (${response.status})`);
      const total = Number(response.headers.get("content-length")) || 0;
      if (!response.body) {
        const data = new Uint8Array(await response.arrayBuffer());
        onProgress(data.byteLength, data.byteLength);
        return data;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        if (loaded > 100 * 1024 * 1024) throw new Error("PDF is larger than 100 MB");
        onProgress(loaded, total);
      }
      const data = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (new TextDecoder("ascii").decode(data.subarray(0, 5)) !== "%PDF-") {
        throw new Error("Downloaded file is not a PDF");
      }
      onProgress(loaded, loaded);
      return data;
    } catch (error) {
      lastError = error;
      if (signal.aborted || attempt === 3) break;
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 450));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("PDF download failed");
}

function ContinuousPdfPage({
  pdfDocument,
  page,
  eager,
  zoom,
  onLoad,
  onVisible,
  onTextSelect,
  children,
}: {
  pdfDocument: PDFDocumentProxy;
  page: number;
  eager: boolean;
  zoom: number;
  onLoad: () => void;
  onVisible: (page: number) => void;
  onTextSelect: (text: string, page: number) => void;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null);
  const [pageSize, setPageSize] = useState(() => ({
    width: 816 * zoom / 100,
    height: 1056 * zoom / 100,
  }));
  const [nearViewport, setNearViewport] = useState(eager);
  const [pageError, setPageError] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    void pdfDocument.getPage(page).then((nextPage) => {
      if (cancelled) return;
      setPageError(false);
      setPdfPage(nextPage);
    }).catch(() => {
      if (!cancelled) setPageError(true);
    });
    return () => { cancelled = true; };
  }, [pdfDocument, page, nearViewport, renderAttempt]);

  useEffect(() => {
    if (!pdfPage) {
      setPageSize({ width: 816 * zoom / 100, height: 1056 * zoom / 100 });
      return;
    }
    const viewport = pdfPage.getViewport({ scale: (zoom / 100) * (96 / 72) });
    setPageSize({ width: viewport.width, height: viewport.height });
  }, [pdfPage, zoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scrollRoot = container.closest(".pdf-page-scroll");
    const preloadObserver = new IntersectionObserver(([entry]) => {
      setNearViewport(entry.isIntersecting);
    }, { root: scrollRoot, rootMargin: "1200px 0px" });
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= 0.3) onVisible(page);
    }, { root: scrollRoot, threshold: 0.3 });
    preloadObserver.observe(container);
    visibilityObserver.observe(container);
    return () => {
      preloadObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, [onVisible, page]);

  useEffect(() => {
    if (!pdfPage || !nearViewport) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: { cancel: () => void } | undefined;
    void (async () => {
      try {
        setPageError(false);
        const viewport = pdfPage.getViewport({ scale: (zoom / 100) * (96 / 72) });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const requestedPixelRatio = window.devicePixelRatio || 1;
        const pixelRatio = Math.max(1, Math.min(
          requestedPixelRatio,
          Math.sqrt(10_000_000 / Math.max(1, viewport.width * viewport.height)),
        ));
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas unavailable");
        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await renderTask.promise;
        if (!cancelled) onLoad();
        const textContainer = textLayerRef.current;
        if (textContainer && !cancelled) {
          try {
            textContainer.replaceChildren();
            textContainer.style.setProperty("--total-scale-factor", String(viewport.scale));
            const pdfjs = await import("pdfjs-dist");
            textLayer = new pdfjs.TextLayer({
              textContentSource: await pdfPage.getTextContent(),
              container: textContainer,
              viewport,
            });
            await (textLayer as InstanceType<typeof pdfjs.TextLayer>).render();
          } catch (error) {
            if (!cancelled && (error as Error).name !== "AbortException") {
              console.warn("PDF text layer unavailable", error);
            }
          }
        }
      } catch (error) {
        if (!cancelled && (error as Error).name !== "RenderingCancelledException") {
          setPageError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      textLayerRef.current?.replaceChildren();
    };
  }, [pdfPage, nearViewport, zoom, onLoad, renderAttempt]);

  return (
    <div className="pdf-page-canvas continuous-page" data-page={page} ref={containerRef} style={{ width: pageSize.width || undefined, height: pageSize.height || undefined }}>
      <canvas ref={canvasRef} />
      <div
        className="textLayer pdf-text-layer"
        onPointerUp={() => {
          const selection = window.getSelection();
          const text = selection?.toString().trim() ?? "";
          if (text) onTextSelect(text, page);
        }}
        ref={textLayerRef}
      />
      {pageError && nearViewport && (
        <div className="pdf-page-error" role="alert">
          <strong>第 {page} 页渲染失败</strong>
          <button onClick={() => setRenderAttempt((value) => value + 1)} type="button">重新加载这一页</button>
        </div>
      )}
      {children}
    </div>
  );
}

function PdfContinuousCanvas({
  url,
  zoom,
  initialPage,
  initialPositionY,
  onLoad,
  onError,
  onVisiblePage,
  onDocumentReady,
  onProgress,
  onTextSelect,
  onZoom,
  children,
}: {
  url: string;
  zoom: number;
  initialPage: number;
  initialPositionY: number;
  onLoad: () => void;
  onError: () => void;
  onVisiblePage: (page: number) => void;
  onDocumentReady: (pageCount: number) => void;
  onProgress: (loaded: number, total: number) => void;
  onTextSelect: (text: string, page: number) => void;
  onZoom: (delta: number) => void;
  children: (page: number) => ReactNode;
}) {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const initialPositionRef = useRef({ page: initialPage, positionY: initialPositionY });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const zoomPdf = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      onZoom(event.deltaY < 0 ? 10 : -10);
    };
    element.addEventListener("wheel", zoomPdf, { passive: false });
    return () => element.removeEventListener("wheel", zoomPdf);
  }, [onZoom]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 210_000);
    setPdfDocument(null);
    void (async () => {
      try {
        const data = await downloadPdfData(url, onProgress, controller.signal);
        window.clearTimeout(timeout);
        if (cancelled) return;
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        pdfjs.GlobalWorkerOptions.workerSrc = `${workerUrl}?v=1.14.30`;
        loadingTask = pdfjs.getDocument({
          data,
          ...pdfjsResourceOptions,
          isEvalSupported: false,
        });
        const document = await loadingTask.promise;
        if (!cancelled) {
          setPdfDocument(document);
          onDocumentReady(document.numPages);
        }
      } catch {
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
      void loadingTask?.destroy();
    };
  }, [url, onError, onDocumentReady, onProgress]);

  useEffect(() => {
    if (!pdfDocument) return;
    const frame = window.requestAnimationFrame(() => {
      const scroll = scrollRef.current;
      const target = scroll?.querySelector<HTMLElement>(
        `.continuous-page[data-page="${initialPositionRef.current.page}"]`,
      );
      if (!scroll || !target) return;
      const scrollBounds = scroll.getBoundingClientRect();
      const pageBounds = target.getBoundingClientRect();
      const nextTop = scroll.scrollTop + pageBounds.top - scrollBounds.top +
        pageBounds.height * initialPositionRef.current.positionY / 100 - 40;
      scroll.scrollTo({ top: Math.max(0, nextTop) });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pdfDocument]);

  return (
    <div className="pdf-page-scroll is-continuous" ref={scrollRef}>
      {pdfDocument && Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1).map((page) => (
        <ContinuousPdfPage
          eager={page <= 2 || Math.abs(page - initialPositionRef.current.page) <= 1}
          key={page}
          onLoad={onLoad}
          onTextSelect={onTextSelect}
          onVisible={onVisiblePage}
          page={page}
          pdfDocument={pdfDocument}
          zoom={zoom}
        >
          {children(page)}
        </ContinuousPdfPage>
      ))}
    </div>
  );
}

export function ReviewComposer({
  articles,
  username,
  initialArticleId,
  initialPartnerNoteReviewId,
  startFocused = false,
  translationEnabled = false,
}: {
  articles: ReaderArticle[];
  username: string;
  initialArticleId?: number;
  initialPartnerNoteReviewId?: number;
  startFocused?: boolean;
  translationEnabled?: boolean;
}) {
  const router = useRouter();
  const startingArticleId = initialArticleId ?? articles[0]?.id ?? 0;
  const startingArticle = articles.find((article) => article.id === startingArticleId);
  const startingReview = startingArticle?.ownReview;
  const [availableArticles, setAvailableArticles] = useState(articles);
  const [articleId, setArticleId] = useState(startingArticleId);
  const [expandedArticleId, setExpandedArticleId] = useState<number | null>(startingArticleId || null);
  const [articleSearch, setArticleSearch] = useState("");
  const [articleTag, setArticleTag] = useState("全部");
  const [articleChronology, setArticleChronology] = useState<"latest" | "classic">("latest");
  const [articleFocusRevision, setArticleFocusRevision] = useState(0);
  const [showAllArticleTags, setShowAllArticleTags] = useState(false);
  const [rating, setRating] = useState<number | null>(startingReview?.rating ?? null);
  const [mustRead, setMustRead] = useState(startingReview?.mustRead ?? false);
  const [content, setContent] = useState(startingReview?.content ?? "");
  const [page, setPage] = useState(
    articles.find((article) => article.id === initialArticleId)?.lastReadPage ??
      articles[0]?.lastReadPage ??
      1,
  );
  const [zoom, setZoom] = useState(100);
  const [fitWidthEnabled, setFitWidthEnabled] = useState(false);
  const [focusMode, setFocusMode] = useState(startFocused);
  const [contextTab, setContextTab] = useState<"annotations" | "translate" | "community" | "publish">("annotations");
  const [communityReviews, setCommunityReviews] = useState<CommunityReview[]>([]);
  const [communityAnnotations, setCommunityAnnotations] = useState<CommunityAnnotation[]>([]);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [articlePdfReady, setArticlePdfReady] = useState(false);
  const [annotationsEnabled, setAnnotationsEnabled] = useState(true);
  const [activeAnnotationId, setActiveAnnotationId] = useState<number | null>(null);
  const [notePdfFile, setNotePdfFile] = useState<File | null>(null);
  const [notePdfSource, setNotePdfSource] = useState<"generated" | "uploaded">("generated");
  const [notePdfPreviewUrl, setNotePdfPreviewUrl] = useState("");
  const [generatingNotePdf, setGeneratingNotePdf] = useState(false);
  const [partnerNoteReviewId, setPartnerNoteReviewId] = useState<number | null>(initialPartnerNoteReviewId ?? null);
  const [partnerNoteError, setPartnerNoteError] = useState(false);
  const [localCache, setLocalCache] = useState<{
    status: "idle" | "loading" | "ready" | "unsupported" | "error" | "timeout";
    progress: number;
  }>(startingArticleId
    ? { status: "loading", progress: 1 }
    : { status: "idle", progress: 0 });
  const [displayedPdfProgress, setDisplayedPdfProgress] = useState(startingArticleId ? 1 : 0);
  const [localPdfUrl, setLocalPdfUrl] = useState(
    startingArticleId ? `/api/articles/${startingArticleId}/pdf` : "",
  );
  const [localPdfName, setLocalPdfName] = useState("");
  const [readerDragging, setReaderDragging] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [quoteDraft, setQuoteDraft] = useState("");
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translationFontSize, setTranslationFontSize] = useState(14);
  const [notes, setNotes] = useState<ReadingNote[]>(
    (startingArticle?.savedAnnotations ?? startingReview?.annotations ?? []).filter((note) => note.rect),
  );
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [bookmark, setBookmark] = useState<ReadingBookmark | null>(startingArticle?.lastReadPage
    ? { page: startingArticle.lastReadPage, positionY: startingArticle.lastReadPositionY ?? 0 }
    : null);
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const [placingBookmark, setPlacingBookmark] = useState(false);
  const [drawingAnnotation, setDrawingAnnotation] = useState(false);
  const [annotationStart, setAnnotationStart] = useState<{ x: number; y: number } | null>(null);
  const [annotationRect, setAnnotationRect] = useState<AnnotationRect | null>(null);
  const [annotationPage, setAnnotationPage] = useState(page);
  const [busy, setBusy] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfRenderAttempt, setPdfRenderAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const readerFileInput = useRef<HTMLInputElement>(null);
  const notePdfInput = useRef<HTMLInputElement>(null);
  const notePdfPreviewRef = useRef("");
  const sessionPdfUrls = useRef(new Map<number, string>());
  const articlePageBeforeNote = useRef(page);
  const pdfFrameRef = useRef<HTMLDivElement>(null);
  const currentArticleIdRef = useRef(articleId);
  const articleFocusRequest = useRef<number | null>(null);
  const annotationSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const annotationSaveRevisions = useRef(new Map<number, number>());
  currentArticleIdRef.current = articleId;

  const selectedArticle = availableArticles.find((item) => item.id === articleId);
  const activePartnerNote = communityReviews.find((review) => review.id === partnerNoteReviewId && review.noteFileName) ?? null;
  const viewingPartnerNote = partnerNoteReviewId !== null;
  const activeNoteAuthor = activePartnerNote?.author ??
    (selectedArticle?.ownReview?.id === partnerNoteReviewId ? username : "成员");
  const activeReaderPdfUrl = viewingPartnerNote
    ? `/api/reading-notes/${partnerNoteReviewId}/pdf`
    : localPdfUrl;
  const selectedArxivPage = selectedArticle
    ? arxivPageUrl(selectedArticle.sourceUrl)
    : null;
  const hasReadingNote = Boolean(notePdfFile || selectedArticle?.ownReview?.noteFileName);
  const searchableTags = useMemo(
    () => ["全部", ...new Set(availableArticles.flatMap((article) => article.tags))],
    [availableArticles],
  );
  const filteredArticles = useMemo(() => {
    const terms = articleSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return availableArticles.filter((article) => {
      if (articleTag !== "全部" && !article.tags.includes(articleTag)) return false;
      const haystack = [article.title, article.publisher, article.authors.join(" "), article.tags.join(" ")]
        .join(" ")
        .toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    }).sort((left, right) => {
      const leftDate = left.publishedAt ?? "";
      const rightDate = right.publishedAt ?? "";
      if (!leftDate) return rightDate ? 1 : right.id - left.id;
      if (!rightDate) return -1;
      return articleChronology === "latest"
        ? rightDate.localeCompare(leftDate) || right.id - left.id
        : leftDate.localeCompare(rightDate) || left.id - right.id;
    });
  }, [articleChronology, articleSearch, articleTag, availableArticles]);
  const visibleSearchableTags = showAllArticleTags
    ? searchableTags
    : [
        ...searchableTags.slice(0, 6),
        ...(articleTag !== "全部" && !searchableTags.slice(0, 6).includes(articleTag) ? [articleTag] : []),
      ];
  const incompleteAbstractIds = useMemo(
    () => availableArticles
      .filter((article) => !article.abstract || !article.abstractZh)
      .map((article) => article.id)
      .join(","),
    [availableArticles],
  );
  const currentPageAnnotations = useMemo(
    () => viewingPartnerNote ? [] : communityAnnotations.filter((item) => item.page === page),
    [communityAnnotations, page, viewingPartnerNote],
  );
  const currentAnnotationLayout = useMemo(() => currentPageAnnotations.map((annotation, index, items) => ({
    annotation,
    number: index + 1,
    overlapIndex: annotation.rect
      ? items.slice(0, index).filter((item) => item.rect && rectanglesOverlap(annotation.rect!, item.rect)).length
      : 0,
  })), [currentPageAnnotations]);
  const handlePdfZoom = useCallback((delta: number) => {
    setFitWidthEnabled(false);
    setZoom((value) => Math.max(30, Math.min(250, value + delta)));
  }, []);
  const fitPdfToWidth = useCallback(() => {
    const frame = pdfFrameRef.current;
    const scroll = frame?.querySelector<HTMLElement>(".pdf-page-scroll");
    const visiblePage = frame?.querySelector<HTMLElement>(`.continuous-page[data-page="${page}"]`)
      ?? frame?.querySelector<HTMLElement>(".continuous-page");
    if (!scroll || !visiblePage) return;
    const pageWidth = visiblePage.getBoundingClientRect().width;
    const availableWidth = scroll.clientWidth;
    if (pageWidth <= 0 || availableWidth <= 0) return;
    setZoom((current) => Math.max(30, Math.min(250, Math.round(current * availableWidth / pageWidth))));
  }, [page]);
  const enableFitWidth = useCallback(() => {
    setFitWidthEnabled(true);
    window.requestAnimationFrame(fitPdfToWidth);
  }, [fitPdfToWidth]);
  const handlePdfDocumentReady = useCallback((pageCount: number) => {
    setPdfPageCount(pageCount);
  }, []);
  const handlePdfProgress = useCallback((loaded: number, total: number) => {
    if (partnerNoteReviewId !== null) return;
    const progress = total > 0
      ? Math.max(1, Math.min(99, Math.round(loaded / total * 100)))
      : 1;
    setLocalCache((current) => current.status === "ready"
      ? current
      : { status: "loading", progress: Math.max(current.progress, progress) });
  }, [partnerNoteReviewId]);

  function setAnnotationVisibility(enabled: boolean) {
    setAnnotationsEnabled(enabled);
    window.localStorage.setItem("wisdomloong-annotations-enabled", String(enabled));
    if (!enabled) {
      setActiveAnnotationId(null);
    }
  }

  const persistAnnotationDrafts = useCallback((targetArticleId: number, nextNotes: ReadingNote[]) => {
    const revision = (annotationSaveRevisions.current.get(targetArticleId) ?? 0) + 1;
    annotationSaveRevisions.current.set(targetArticleId, revision);
    const payload = JSON.stringify({ annotations: nextNotes });
    setAvailableArticles((current) => current.map((article) =>
      article.id === targetArticleId ? { ...article, savedAnnotations: nextNotes } : article
    ));
    try {
      window.localStorage.setItem(annotationDraftStorageKey(targetArticleId), JSON.stringify(nextNotes));
    } catch {
      // The server save below remains authoritative if browser storage is full.
    }
    if (currentArticleIdRef.current === targetArticleId) setAnnotationSaveStatus("saving");

    annotationSaveQueue.current = annotationSaveQueue.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch(`/api/articles/${targetArticleId}/annotation-draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: payload.length < 60_000,
        });
        await responseJson(response);
        if (annotationSaveRevisions.current.get(targetArticleId) === revision) {
          window.localStorage.removeItem(annotationDraftStorageKey(targetArticleId));
        }
        if (
          currentArticleIdRef.current === targetArticleId &&
          annotationSaveRevisions.current.get(targetArticleId) === revision
        ) {
          setAnnotationSaveStatus("saved");
        }
      })
      .catch(() => {
        if (
          currentArticleIdRef.current === targetArticleId &&
          annotationSaveRevisions.current.get(targetArticleId) === revision
        ) {
          setAnnotationSaveStatus("error");
        }
      });
  }, []);

  function navigateToPosition(target: ReadingBookmark, behavior: ScrollBehavior = "smooth") {
    const normalizedPage = Math.min(
      pdfPageCount || Number.MAX_SAFE_INTEGER,
      Math.max(1, Math.floor(target.page) || 1),
    );
    setPage(normalizedPage);
    window.requestAnimationFrame(() => {
      const scroll = pdfFrameRef.current?.querySelector<HTMLElement>(".pdf-page-scroll");
      const targetPage = scroll?.querySelector<HTMLElement>(
        `.continuous-page[data-page="${normalizedPage}"]`,
      );
      if (!scroll || !targetPage) return;
      const scrollBounds = scroll.getBoundingClientRect();
      const pageBounds = targetPage.getBoundingClientRect();
      const nextTop = scroll.scrollTop + pageBounds.top - scrollBounds.top +
        pageBounds.height * Math.max(0, Math.min(100, target.positionY)) / 100 - 40;
      scroll.scrollTo({ top: Math.max(0, nextTop), behavior });
    });
  }

  function navigateToPage(nextPage: number) {
    navigateToPosition({ page: nextPage, positionY: 0 });
  }

  async function saveBookmarkAt(pageNumber: number, positionY: number) {
    if (!articleId || viewingPartnerNote) return;
    const previousBookmark = bookmark;
    const nextBookmark = {
      page: Math.max(1, Math.floor(pageNumber)),
      positionY: Math.max(0, Math.min(100, positionY)),
    };
    setBookmark(nextBookmark);
    setPlacingBookmark(false);
    setBookmarkSaving(true);
    try {
      const response = await fetch(`/api/articles/${articleId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextBookmark),
      });
      await responseJson(response);
      setBookmark(nextBookmark);
      setAvailableArticles((current) => current.map((article) => article.id === articleId
        ? {
            ...article,
            lastReadPage: nextBookmark.page,
            lastReadPositionY: nextBookmark.positionY,
          }
        : article));
      setMessage(`书签已保存：第 ${nextBookmark.page} 页，页内 ${Math.round(nextBookmark.positionY)}% 位置。`);
    } catch (error) {
      setBookmark(previousBookmark);
      setPlacingBookmark(true);
      setMessage(error instanceof Error ? error.message : "书签保存失败");
    } finally {
      setBookmarkSaving(false);
    }
  }

  async function deleteBookmark() {
    if (!bookmark || !articleId || bookmarkSaving) return;
    if (!window.confirm("确定删除这个阅读书签吗？")) return;
    const previousBookmark = bookmark;
    setBookmark(null);
    setBookmarkSaving(true);
    try {
      const response = await fetch(`/api/articles/${articleId}/progress`, { method: "DELETE" });
      await responseJson(response);
      setAvailableArticles((current) => current.map((article) => article.id === articleId
        ? { ...article, lastReadPage: null, lastReadPositionY: null }
        : article));
      setMessage("书签已删除。");
    } catch (error) {
      setBookmark(previousBookmark);
      setMessage(error instanceof Error ? error.message : "书签删除失败");
    } finally {
      setBookmarkSaving(false);
    }
  }

  useEffect(() => {
    setAvailableArticles((current) => articles.map((article) =>
      current.find((item) => item.id === article.id) ?? article
    ));
  }, [articles]);

  useEffect(() => {
    if (!incompleteAbstractIds) return;
    let cancelled = false;

    const refreshAbstracts = () => {
      fetch(`/api/articles/abstracts?ids=${incompleteAbstractIds}`, { cache: "no-store" })
        .then(responseJson)
        .then((data) => {
          if (cancelled) return;
          const updates = new Map(
            ((data.articles as { id: number; abstract: string; abstractZh: string }[]) ?? [])
              .map((article) => [article.id, article]),
          );
          setAvailableArticles((current) => current.map((article) => {
            const update = updates.get(article.id);
            return update ? { ...article, abstract: update.abstract, abstractZh: update.abstractZh } : article;
          }));
        })
        .catch(() => undefined);
    };

    refreshAbstracts();
    const timer = window.setInterval(refreshAbstracts, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [incompleteAbstractIds]);

  useEffect(() => {
    if (!articleId || !focusMode) return;
    const recordPresence = () => void fetch(`/api/articles/${articleId}/recent`, {
      method: "POST", keepalive: true,
    }).catch(() => undefined);
    recordPresence();
    const timer = window.setInterval(recordPresence, 60_000);
    return () => window.clearInterval(timer);
  }, [articleId, focusMode]);

  useEffect(() => {
    if (focusMode || expandedArticleId !== articleId || articleFocusRequest.current !== articleId) return;
    const timer = window.setTimeout(() => {
      const card = document.querySelector<HTMLElement>(`[data-article-library-id="${articleId}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
      card?.focus({ preventScroll: true });
      articleFocusRequest.current = null;
    }, 80);
    return () => window.clearTimeout(timer);
  }, [articleFocusRevision, articleId, expandedArticleId, focusMode]);

  useEffect(() => {
    const saved = window.localStorage.getItem("wisdomloong-annotations-enabled");
    if (saved === "false") {
      setAnnotationsEnabled(false);
      setDrawingAnnotation(false);
    }
  }, []);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("wisdomloong-translation-font-size"));
    if (Number.isFinite(saved) && saved >= 12 && saved <= 22) {
      setTranslationFontSize(saved);
    }
  }, []);

  useEffect(() => {
    if (!articleId) return;
    const rawDraft = window.localStorage.getItem(annotationDraftStorageKey(articleId));
    if (!rawDraft) return;
    try {
      const recovered = JSON.parse(rawDraft) as ReadingNote[];
      if (!Array.isArray(recovered)) return;
      const validNotes = recovered.filter((note) => note?.content?.trim() && note.rect);
      setNotes(validNotes);
      persistAnnotationDrafts(articleId, validNotes);
    } catch {
      window.localStorage.removeItem(annotationDraftStorageKey(articleId));
    }
  }, [articleId, persistAnnotationDrafts]);

  useEffect(() => {
    if (!articleId) return;
    let cancelled = false;
    setDiscussionLoading(true);
    setCommunityAnnotations([]);
    setAnnotationsLoading(false);
    fetch(`/api/articles/${articleId}/discussion?includeAnnotations=0`)
      .then(responseJson)
      .then((data) => {
        if (cancelled) return;
        setCommunityReviews((data.reviews as CommunityReview[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setCommunityReviews([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDiscussionLoading(false);
      });
    return () => { cancelled = true; };
  }, [articleId]);

  useEffect(() => {
    if (!articleId || !articlePdfReady || viewingPartnerNote) return;
    let cancelled = false;
    setAnnotationsLoading(true);
    fetch(`/api/articles/${articleId}/discussion?includeAnnotations=1`)
      .then(responseJson)
      .then((data) => {
        if (!cancelled) setCommunityAnnotations((data.annotations as CommunityAnnotation[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setCommunityAnnotations([]);
      })
      .finally(() => {
        if (!cancelled) setAnnotationsLoading(false);
      });
    return () => { cancelled = true; };
  }, [articleId, articlePdfReady, viewingPartnerNote]);

  useEffect(() => {
    setPdfPageCount(0);
  }, [activeReaderPdfUrl]);

  useEffect(() => {
    if (!fitWidthEnabled) return;
    const frame = pdfFrameRef.current;
    const scroll = frame?.querySelector<HTMLElement>(".pdf-page-scroll");
    if (!scroll) return;
    const frameId = window.requestAnimationFrame(fitPdfToWidth);
    const observer = new ResizeObserver(fitPdfToWidth);
    observer.observe(scroll);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [fitWidthEnabled, fitPdfToWidth, activeReaderPdfUrl]);

  useEffect(() => {
    if (localCache.status === "ready") {
      setDisplayedPdfProgress(100);
      return;
    }
    if (localCache.status !== "loading") {
      setDisplayedPdfProgress(0);
      return;
    }
    const timer = window.setInterval(() => {
      setDisplayedPdfProgress((current) => {
        if (current >= localCache.progress) return current;
        const step = Math.max(1, Math.ceil((localCache.progress - current) / 7));
        return Math.min(localCache.progress, current + step);
      });
    }, 45);
    return () => window.clearInterval(timer);
  }, [localCache]);

  useEffect(() => () => {
    sessionPdfUrls.current.forEach((url) => URL.revokeObjectURL(url));
    sessionPdfUrls.current.clear();
    if (notePdfPreviewRef.current) URL.revokeObjectURL(notePdfPreviewRef.current);
  }, []);

  function selectArticle(id: number) {
    const article = availableArticles.find((item) => item.id === id);
    setArticleId(id);
    setExpandedArticleId(id);
    articleFocusRequest.current = id;
    setArticleFocusRevision((value) => value + 1);
    setPdfLoading(true);
    setArticlePdfReady(false);
    setPage(article?.lastReadPage ?? 1);
    setRating(article?.ownReview?.rating ?? null);
    setMustRead(article?.ownReview?.mustRead ?? false);
    setContent(article?.ownReview?.content ?? "");
    setNotes((article?.savedAnnotations ?? article?.ownReview?.annotations ?? []).filter((note) => note.rect));
    setAnnotationSaveStatus("saved");
    setBookmark(article?.lastReadPage
      ? { page: article.lastReadPage, positionY: article.lastReadPositionY ?? 0 }
      : null);
    setPlacingBookmark(false);
    setDrawingAnnotation(false);
    setAnnotationStart(null);
    setAnnotationRect(null);
    setActiveAnnotationId(null);
    setPartnerNoteReviewId(null);
    setPartnerNoteError(false);
    setMessage("");
    if (notePdfPreviewRef.current) URL.revokeObjectURL(notePdfPreviewRef.current);
    notePdfPreviewRef.current = "";
    setNotePdfFile(null);
    setNotePdfPreviewUrl("");
    setContextTab("annotations");
    const sessionUrl = sessionPdfUrls.current.get(id);
    setLocalPdfUrl(sessionUrl ?? `/api/articles/${id}/pdf`);
    setLocalPdfName(sessionUrl ? "本地 PDF" : "");
    setDisplayedPdfProgress(sessionUrl ? 100 : 1);
    setLocalCache(sessionUrl
      ? { status: "ready", progress: 100 }
      : { status: "loading", progress: 1 });
    setFocusMode(false);
  }

  function beginReading() {
    if (!selectedArticle) return;
    if (!localPdfUrl) {
      setLocalPdfUrl(`/api/articles/${selectedArticle.id}/pdf`);
      setDisplayedPdfProgress(1);
      setLocalCache({ status: "loading", progress: 1 });
    }
    setArticlePdfReady(false);
    setCommunityAnnotations([]);
    setPdfLoading(true);
    setFocusMode(true);
  }

  function beginReadingArticle(id: number) {
    if (id === articleId) {
      beginReading();
      return;
    }
    selectArticle(id);
    setFocusMode(true);
  }

  function openPartnerNote(review: CommunityReview) {
    if (!review.noteFileName) return;
    if (!viewingPartnerNote) articlePageBeforeNote.current = page;
    setPartnerNoteReviewId(review.id);
    setPartnerNoteError(false);
    setPdfLoading(true);
    setPage(1);
    setFocusMode(true);
    setDrawingAnnotation(false);
    setPlacingBookmark(false);
    setAnnotationStart(null);
    setAnnotationRect(null);
    setMessage(`正在阅读 ${review.author} 的读书笔记。`);
  }

  function returnToArticle() {
    setPartnerNoteReviewId(null);
    setPartnerNoteError(false);
    setArticlePdfReady(false);
    setCommunityAnnotations([]);
    setPdfLoading(true);
    setPage(Math.max(1, articlePageBeforeNote.current));
    setMessage("已返回论文原文。");
  }

  function useReaderPdf(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      setMessage("请选择 PDF 文件。");
      return;
    }
    const previousUrl = sessionPdfUrls.current.get(articleId);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const objectUrl = URL.createObjectURL(nextFile);
    sessionPdfUrls.current.set(articleId, objectUrl);
    setLocalPdfUrl(objectUrl);
    setLocalPdfName(nextFile.name);
    setLocalCache({ status: "ready", progress: 100 });
    setArticlePdfReady(false);
    setCommunityAnnotations([]);
    setPdfLoading(true);
    setMessage(`已在阅读器中打开本地文件 ${nextFile.name}，文件不会上传。`);
  }

  function retryPdfDownload() {
    setDisplayedPdfProgress(1);
    setLocalCache({ status: "loading", progress: 1 });
    setArticlePdfReady(false);
    setCommunityAnnotations([]);
    setPdfLoading(true);
    setPdfRenderAttempt((value) => value + 1);
    if (!localPdfName) {
      setLocalPdfUrl(`/api/articles/${articleId}/pdf?retry=${Date.now()}`);
    }
  }

  const handlePdfPageLoad = useCallback(() => {
    setPdfLoading(false);
    setPartnerNoteError(false);
    if (partnerNoteReviewId === null) {
      setArticlePdfReady(true);
      setLocalCache({ status: "ready", progress: 100 });
    }
  }, [partnerNoteReviewId]);
  const handlePdfPageError = useCallback(() => {
    if (partnerNoteReviewId !== null) {
      setPartnerNoteError(true);
      setPdfLoading(false);
      return;
    }
    setArticlePdfReady(false);
    setCommunityAnnotations([]);
    setLocalCache({ status: "error", progress: 0 });
    setPdfLoading(true);
  }, [partnerNoteReviewId]);

  function annotationPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
  }

  function updateAnnotationRect(event: ReactPointerEvent<HTMLDivElement>) {
    if (!annotationStart) return;
    const point = annotationPoint(event);
    setAnnotationRect({
      x: Math.min(annotationStart.x, point.x),
      y: Math.min(annotationStart.y, point.y),
      width: Math.abs(point.x - annotationStart.x),
      height: Math.abs(point.y - annotationStart.y),
    });
  }

  function startDrawingAnnotation() {
    setPlacingBookmark(false);
    setDrawingAnnotation(true);
    setAnnotationRect(null);
    setAnnotationPage(page);
    setContextTab("annotations");
    setMessage("请在当前 PDF 页面上拖动画框；位置会随页码一起保存并分享给伙伴。");
  }

  function addCurrentAnnotation() {
    if (!annotationRect || !noteDraft.trim()) return;
    const nextNotes = [...notes, {
      page: annotationPage,
      quote: quoteDraft.trim(),
      translation: translation.trim(),
      content: noteDraft.trim(),
      rect: annotationRect,
    }];
    setNotes(nextNotes);
    persistAnnotationDrafts(articleId, nextNotes);
    setNoteDraft("");
    setQuoteDraft("");
    setTranslation("");
    setAnnotationRect(null);
  }

  function deleteAnnotation(index: number) {
    const nextNotes = notes.filter((_, itemIndex) => itemIndex !== index);
    setNotes(nextNotes);
    persistAnnotationDrafts(articleId, nextNotes);
  }

  function reuseCommunityAnnotationPosition(annotation: CommunityAnnotation) {
    if (!annotation.rect) return;
    setDrawingAnnotation(false);
    setAnnotationStart(null);
    setAnnotationRect({ ...annotation.rect });
    setAnnotationPage(annotation.page);
    setContextTab("annotations");
    setMessage(`已复用 ${annotation.author} 在第 ${annotation.page} 页的批注位置，请填写你的批注。`);
  }

  async function readClipboard() {
    try {
      const value = await navigator.clipboard.readText();
      setQuoteDraft(value);
      setTranslation("");
      if (!value.trim()) setMessage("剪贴板里没有可翻译的文字。");
    } catch {
      setMessage("无法读取剪贴板，请直接粘贴论文原文。");
    }
  }

  async function translateQuote() {
    if (!quoteDraft.trim()) return;
    setTranslating(true);
    setMessage("");
    setTranslation("");
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quoteDraft }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "翻译失败");
      }
      if (!response.body) throw new Error("翻译服务没有返回内容");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = "";
      let lastPaint = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
        const now = performance.now();
        if (now - lastPaint >= 50) {
          setTranslation(result);
          lastPaint = now;
        }
      }
      result += decoder.decode();
      if (!result.trim()) throw new Error("翻译服务没有返回内容");
      setTranslation(result.trim());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "翻译失败");
    } finally {
      setTranslating(false);
    }
  }

  function changeTranslationFontSize(delta: number) {
    setTranslationFontSize((current) => {
      const next = Math.max(12, Math.min(22, current + delta));
      window.localStorage.setItem("wisdomloong-translation-font-size", String(next));
      return next;
    });
  }

  function resetTranslationFontSize() {
    setTranslationFontSize(14);
    window.localStorage.setItem("wisdomloong-translation-font-size", "14");
  }

  function useSelectedPdfText(text: string, pageNumber: number) {
    const normalized = text.replace(/\s+/g, " ").trim().slice(0, 12_000);
    if (!normalized) return;
    setPage(pageNumber);
    setQuoteDraft(normalized);
    setTranslation("");
    setContextTab("translate");
    setMessage(translationEnabled
      ? `已选中第 ${pageNumber} 页原文，点击右侧“翻译成中文”。`
      : "已选中论文原文；翻译服务尚未配置 API Key。");
  }

  function useNotePdf(file: File, source: "generated" | "uploaded") {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("读书笔记必须是 PDF 文件。");
      return;
    }
    if (file.size > 30_000_000) {
      setMessage("读书笔记 PDF 不能超过 30 MB。");
      return;
    }
    if (notePdfPreviewRef.current) URL.revokeObjectURL(notePdfPreviewRef.current);
    const previewUrl = URL.createObjectURL(file);
    notePdfPreviewRef.current = previewUrl;
    setNotePdfFile(file);
    setNotePdfSource(source);
    setNotePdfPreviewUrl(previewUrl);
    setMessage(source === "generated" ? "读书笔记 PDF 已生成，可预览后随评论发布。" : "已选择个人读书笔记 PDF。");
  }

  async function buildNotePdf() {
    if (!selectedArticle) return;
    setGeneratingNotePdf(true);
    setMessage("");
    try {
      const file = await generateReadingNotePdf({
        pdfUrl: localPdfUrl,
        title: selectedArticle.title,
        author: username,
        notes,
      });
      useNotePdf(file, "generated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读书笔记生成失败");
    } finally {
      setGeneratingNotePdf(false);
    }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    const selectedRating = rating;
    if (selectedRating === null) {
      setMessage("请先选择推荐星级，或标记为必读。");
      return;
    }
    if (!notePdfFile && !selectedArticle?.ownReview?.noteFileName) {
      setMessage("请先从画框批注生成读书笔记 PDF，或上传自己的 PDF。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await annotationSaveQueue.current.catch(() => undefined);
      const notePdf = notePdfFile ? {
        dataUrl: await fileDataUrl(notePdfFile),
        fileName: notePdfFile.name,
        source: notePdfSource,
      } : undefined;
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          rating: selectedRating,
          mustRead,
          content: content.trim(),
          annotations: notes,
          notePdf,
        }),
      });
      const saved = await responseJson(response);
      const updatedReview = {
        id: Number(saved.reviewId) || selectedArticle?.ownReview?.id || 0,
        rating: selectedRating,
        mustRead,
        reviewType: "long" as const,
        content: content.trim(),
        annotations: notes,
        noteFileName: notePdfFile?.name ?? selectedArticle?.ownReview?.noteFileName ?? null,
        noteSource: notePdfFile ? notePdfSource : selectedArticle?.ownReview?.noteSource ?? null,
      };
      setAvailableArticles((current) => current.map((article) =>
        article.id === articleId
          ? { ...article, ownReview: updatedReview, savedAnnotations: notes, isRead: true }
          : article
      ));
      window.localStorage.removeItem(annotationDraftStorageKey(articleId));
      setAnnotationSaveStatus("saved");
      setMessage(selectedArticle?.ownReview
        ? "评论修改已保存。"
        : "评论已发布，文章已标记为已读。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评论保存失败");
    } finally {
      setBusy(false);
    }
  }

  function renderPdfAnnotationLayer(pageNumber: number) {
    const pageAnnotations = communityAnnotations.filter((item) => item.page === pageNumber);
    const pageLayout = pageAnnotations.map((annotation, index, items) => ({
      annotation,
      number: index + 1,
      overlapIndex: annotation.rect
        ? items.slice(0, index).filter((item) => item.rect && rectanglesOverlap(annotation.rect!, item.rect)).length
        : 0,
    }));
    const pageNotes = notes.filter((item) => item.page === pageNumber && item.rect);
    const pendingOverlap = annotationRect && annotationPage === pageNumber
      ? pageAnnotations.filter((annotation) => annotation.rect && rectanglesOverlap(annotationRect, annotation.rect)).length
      : 0;

    return (
      <div
        aria-label={placingBookmark
          ? `在 PDF 第 ${pageNumber} 页点击放置书签`
          : drawingAnnotation
            ? `在 PDF 第 ${pageNumber} 页拖动画框`
            : `PDF 第 ${pageNumber} 页批注层`}
        className={`pdf-annotation-layer${drawingAnnotation ? " is-drawing" : ""}${placingBookmark ? " is-bookmarking" : ""}`}
        onPointerDown={(event) => {
          if (placingBookmark) {
            event.preventDefault();
            event.stopPropagation();
            const point = annotationPoint(event);
            setPage(pageNumber);
            void saveBookmarkAt(pageNumber, point.y);
            return;
          }
          if (!drawingAnnotation) return;
          setPage(pageNumber);
          setAnnotationPage(pageNumber);
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = annotationPoint(event);
          setAnnotationStart(point);
          setAnnotationRect({ ...point, width: 0, height: 0 });
        }}
        onPointerMove={updateAnnotationRect}
        onPointerUp={(event) => {
          if (!annotationStart) return;
          const point = annotationPoint(event);
          const nextRect = {
            x: Math.min(annotationStart.x, point.x),
            y: Math.min(annotationStart.y, point.y),
            width: Math.abs(point.x - annotationStart.x),
            height: Math.abs(point.y - annotationStart.y),
          };
          setAnnotationStart(null);
          setDrawingAnnotation(false);
          if (nextRect.width < 1 || nextRect.height < 1) {
            setAnnotationRect(null);
            setMessage("画框太小，请重新拖动选择要批注的区域。");
            return;
          }
          setPage(pageNumber);
          setAnnotationRect(nextRect);
          setAnnotationPage(pageNumber);
          setMessage(`已框选第 ${pageNumber} 页，请在右侧填写批注并加入。`);
        }}
      >
        {bookmark?.page === pageNumber && (
          <span
            aria-label={`阅读书签，第 ${pageNumber} 页页内 ${Math.round(bookmark.positionY)}%`}
            className="pdf-bookmark-line"
            style={{ top: `${bookmark.positionY}%` }}
          ><i>书签</i></span>
        )}
        {annotationsEnabled && pageLayout.filter(({ annotation }) => annotation.rect).map(({ annotation, number, overlapIndex }) => (
          <button
            aria-label={`批注 ${number}，${annotation.author}：${annotation.content}。点击在相同位置添加我的批注`}
            className={`pdf-annotation-box is-community${activeAnnotationId === annotation.id ? " is-active" : ""}${overlapIndex ? " is-overlapping" : ""}`}
            key={`community-${annotation.id}`}
            onBlur={() => setActiveAnnotationId(null)}
            onClick={(event) => {
              event.stopPropagation();
              reuseCommunityAnnotationPosition(annotation);
            }}
            onFocus={() => setActiveAnnotationId(annotation.id)}
            onMouseEnter={() => setActiveAnnotationId(annotation.id)}
            onMouseLeave={() => setActiveAnnotationId(null)}
            style={{
              left: `${annotation.rect!.x}%`,
              top: `${annotation.rect!.y}%`,
              width: `${annotation.rect!.width}%`,
              height: `${annotation.rect!.height}%`,
              transform: `translate(${overlapIndex * 4}px, ${overlapIndex * 4}px)`,
              zIndex: activeAnnotationId === annotation.id ? 50 : 10 + overlapIndex,
              "--annotation-color": annotationColor(annotation.author),
            } as CSSProperties}
            type="button"
          >
            <span>{number}</span>
            <strong className="pdf-annotation-tooltip"><b>{annotation.author} · 批注 {number}</b>{annotation.content}<small>点击在相同位置添加我的批注</small></strong>
          </button>
        ))}
        {pageNotes.map((item, index) => {
          const overlapIndex = pageAnnotations.filter((annotation) =>
            annotation.rect && rectanglesOverlap(item.rect!, annotation.rect)
          ).length + pageNotes.slice(0, index).filter((note) =>
            note.rect && rectanglesOverlap(item.rect!, note.rect)
          ).length;
          return (
            <span
              className={`pdf-annotation-box is-own${overlapIndex ? " is-overlapping" : ""}`}
              key={`own-${index}`}
              style={{
                left: `${item.rect!.x}%`,
                top: `${item.rect!.y}%`,
                width: `${item.rect!.width}%`,
                height: `${item.rect!.height}%`,
                transform: `translate(${overlapIndex * 4}px, ${overlapIndex * 4}px)`,
                zIndex: 20 + overlapIndex,
              }}
              title={`我的批注：${item.content}`}
            ><span>我{index + 1}</span></span>
          );
        })}
        {annotationRect && annotationPage === pageNumber && (
          <span
            className="pdf-annotation-box is-pending"
            style={{
              left: `${annotationRect.x}%`,
              top: `${annotationRect.y}%`,
              width: `${annotationRect.width}%`,
              height: `${annotationRect.height}%`,
              transform: `translate(${pendingOverlap * 4}px, ${pendingOverlap * 4}px)`,
            }}
          ><span>新</span></span>
        )}
        {placingBookmark && <strong>点击你当前读到的那一行</strong>}
        {drawingAnnotation && !annotationStart && <strong>拖动鼠标框选论文中的图片或段落</strong>}
      </div>
    );
  }

  return (
    <div className={`reader-workspace${focusMode ? " focus-mode" : ""}`}>
      {focusMode && (
        <div className="focus-status">
          <span><i />扩展算法组知识库</span>
          <small>
            {viewingPartnerNote
              ? `正在阅读 ${activeNoteAuthor} 的读书笔记`
              : localCache.status === "loading"
              ? `正在完整下载论文 ${displayedPdfProgress}%`
              : localCache.status === "ready"
                ? "论文已打开 · 后续页面按需加载"
                : "点击右侧结束阅读"}
          </small>
          <div className="focus-status-actions">
            <button onClick={() => setFocusMode(false)} type="button">结束阅读</button>
          </div>
        </div>
      )}
      <aside className="article-library">
        <div className="article-library-banner">
          <div className="library-heading">
            <span>文章库</span>
            <strong>{availableArticles.length} 篇文章</strong>
          </div>
          <input
            aria-label="搜索已有文章"
            onChange={(event) => setArticleSearch(event.target.value)}
            placeholder="搜索标题、作者、机构或标签…"
            type="search"
            value={articleSearch}
          />
          <div className="library-search-meta">
            <span>找到 {filteredArticles.length} 篇</span>
            {articleSearch && <button onClick={() => setArticleSearch("")} type="button">清空</button>}
          </div>
          <div className="library-chronology-switch" aria-label="文章时间排序方式">
            <button className={articleChronology === "latest" ? "selected" : ""} onClick={() => setArticleChronology("latest")} type="button">
              <span>追随潮流</span><small>最新优先</small>
            </button>
            <button className={articleChronology === "classic" ? "selected" : ""} onClick={() => setArticleChronology("classic")} type="button">
              <span>回味经典</span><small>最早优先</small>
            </button>
          </div>
          <div className="library-tag-filter">
            {visibleSearchableTags.map((tag) => (
              <button
                className={articleTag === tag ? "selected" : ""}
                key={tag}
                onClick={() => setArticleTag(tag)}
                type="button"
              >
                {tag}
              </button>
            ))}
            {searchableTags.length > 6 && (
              <button
                className="library-tag-more"
                onClick={() => setShowAllArticleTags((current) => !current)}
                type="button"
              >{showAllArticleTags ? "收起" : `更多 +${searchableTags.length - 6}`}</button>
            )}
          </div>
        </div>
        <div className="article-search-results">
          {filteredArticles.map((article, index) => {
            const month = article.publishedAt?.slice(0, 7) ?? "日期待补";
            const previousMonth = filteredArticles[index - 1]?.publishedAt?.slice(0, 7) ?? (index > 0 ? "日期待补" : "");
            return (
            <Fragment key={article.id}>
              {month !== previousMonth && (
                <div className="library-month-divider">
                  <time>{month === "日期待补" ? month : `${month.slice(0, 4)} 年 ${month.slice(5)} 月`}</time>
                  <span />
                </div>
              )}
            <article
              aria-expanded={article.id === expandedArticleId}
              className={article.id === expandedArticleId ? "selected" : ""}
              data-article-library-id={article.id}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input, textarea, select, details, summary, form")) return;
                if (article.id === expandedArticleId) setExpandedArticleId(null);
                else selectArticle(article.id);
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                if (article.id === expandedArticleId) setExpandedArticleId(null);
                else selectArticle(article.id);
              }}
              tabIndex={0}
            >
              <div className="library-result-meta">
                <time dateTime={article.publishedAt ?? undefined}>
                  <i aria-hidden="true" />{article.publishedAt ?? "日期待补"}
                </time>
                <span>
                  {article.publisher !== "机构待补充" && article.publisher.toLocaleLowerCase() !== "arxiv"
                    ? article.publisher
                    : ""}
                </span>
              </div>
              <h3 className="library-card-title">
                <MathTitle title={article.title} />
              </h3>
              <div className="library-card-tags" aria-label="文章标签">
                {(article.tags.length ? article.tags : [article.category]).slice(0, 4).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="library-card-signals" aria-label="文章阅读数据">
                <span><i aria-hidden="true">★</i>{article.rating ?? "暂无评分"}</span>
                <span><i aria-hidden="true">✓</i>{article.readCount ?? 0} 人读过</span>
                <span className={(article.readingNowCount ?? 0) > 0 ? "is-live" : ""}>
                  <i aria-hidden="true">●</i>{article.readingNowCount ?? 0} 人正在读
                </span>
              </div>
              {article.id !== expandedArticleId ? (
                <p className="library-card-abstract">
                  {article.abstractZh || article.abstract || "摘要正在识别补齐。"}
                </p>
              ) : (
                <div
                  className="library-inline-details"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <header>
                    <div>
                      <span>
                        {article.publisher !== "机构待补充" && article.publisher.toLocaleLowerCase() !== "arxiv"
                          ? article.publisher
                          : ""}
                      </span>
                      <small>{article.publishedAt ?? "日期暂无"}</small>
                    </div>
                    <button
                      className="library-start-reading"
                      onClick={() => beginReadingArticle(article.id)}
                      type="button"
                    >
                      <span>{article.lastReadPage ? "继续阅读" : "阅读论文"}</span>
                      <i aria-hidden="true">↗</i>
                    </button>
                  </header>
                  <div className={`library-inline-abstracts${article.abstractZh ? " has-translation" : ""}`}>
                    <section>
                      <strong>论文摘要</strong>
                      <p className={!article.abstract ? "abstract-repairing" : undefined}>
                        {article.abstract || "摘要正在识别补齐，完成后会自动显示。"}
                      </p>
                    </section>
                    {article.abstractZh && (
                      <section>
                        <strong>中文摘要</strong>
                        <p>{article.abstractZh}</p>
                      </section>
                    )}
                  </div>
                  <section className="library-inline-comments">
                    <div>
                      <strong>伙伴评论</strong>
                      <span>{communityReviews.length} 条</span>
                    </div>
                    {discussionLoading ? (
                      <p>正在加载评论…</p>
                    ) : communityReviews.length > 0 ? (
                      <div>
                        {communityReviews.slice(0, 3).map((review) => (
                          <article key={review.id}>
                            <span>{review.author.slice(0, 1).toUpperCase()}</span>
                            <p><strong>{review.author}</strong>{review.content}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>还没有伙伴评论，阅读后可以留下第一条。</p>
                    )}
                  </section>
                  <ArticleMetadataEditor
                    articleId={article.id}
                    initialPublishedAt={article.publishedAt}
                    initialPublisher={article.publisher}
                    initialTags={article.tags}
                    key={`inline-${article.id}`}
                    onSaved={(update) => setAvailableArticles((current) => current.map((item) =>
                      item.id === article.id ? { ...item, ...update } : item
                    ))}
                  />
                </div>
              )}
            </article>
            </Fragment>
            );
          })}
          {filteredArticles.length === 0 && <p>没有匹配文章</p>}
        </div>
      </aside>

      <section className="paper-reader">
        {selectedArticle ? (
          <>
            <header className="reader-titlebar">
              <div>
                {selectedArticle.publisher !== "机构待补充" &&
                  selectedArticle.publisher.toLocaleLowerCase() !== "arxiv" && (
                    <span>{selectedArticle.publisher}</span>
                  )}
                <h2><MathTitle title={selectedArticle.title} /></h2>
                <p>{selectedArticle.authors.join(", ")}</p>
                <div className="reader-essential-meta">
                  <strong>{selectedArticle.publishedAt ?? "日期暂无"}</strong>
                  <span>{selectedArticle.tags.join(" · ")}</span>
                </div>
              </div>
              <div className="reader-title-actions">
                {!selectedArticle.sourceUrl.startsWith("/api/") && (
                  <a href={selectedArticle.sourceUrl} rel="noreferrer" target="_blank">来源页面 ↗</a>
                )}
              </div>
            </header>
            <div className="reader-metadata-summary" aria-label="文章信息">
              <div><strong>标签</strong><span>{selectedArticle.tags.join(" · ")}</span></div>
              <div><strong>发布机构</strong><span>{selectedArticle.publisher === "机构待补充" || selectedArticle.publisher.toLocaleLowerCase() === "arxiv" ? "" : selectedArticle.publisher}</span></div>
              <div><strong>发布日期</strong><span>{selectedArticle.publishedAt ?? "暂无"}</span></div>
            </div>
            <ArticleMetadataEditor
              articleId={selectedArticle.id}
              initialPublishedAt={selectedArticle.publishedAt}
              initialPublisher={selectedArticle.publisher}
              initialTags={selectedArticle.tags}
              key={selectedArticle.id}
              onSaved={(update) => setAvailableArticles((current) => current.map((article) =>
                article.id === selectedArticle.id ? { ...article, ...update } : article
              ))}
            />
            {focusMode ? (
              <>
                <div className="reader-toolbar">
                  <div className="reader-document-switch" aria-label="阅读器文档">
                    <button
                      aria-pressed={!viewingPartnerNote}
                      className={!viewingPartnerNote ? "selected" : ""}
                      onClick={() => {
                        if (viewingPartnerNote) returnToArticle();
                      }}
                      type="button"
                    >论文</button>
                    {communityReviews.filter((review) => review.noteFileName).map((review) => (
                      <button
                        aria-pressed={partnerNoteReviewId === review.id}
                        className={partnerNoteReviewId === review.id ? "selected" : ""}
                        key={review.id}
                        onClick={() => {
                          if (partnerNoteReviewId !== review.id) openPartnerNote(review);
                        }}
                        type="button"
                      >{review.author}的笔记</button>
                    ))}
                    {viewingPartnerNote && !activePartnerNote && (
                      <button aria-pressed="true" className="selected" type="button">{activeNoteAuthor}的笔记</button>
                    )}
                  </div>
                  {!viewingPartnerNote && (
                    <div className="reader-bookmark-tools">
                      <button
                        aria-pressed={placingBookmark}
                        className={`bookmark-save-button${placingBookmark ? " is-placing" : ""}`}
                        disabled={bookmarkSaving || pdfLoading}
                        onClick={() => {
                          setDrawingAnnotation(false);
                          setAnnotationStart(null);
                          setPlacingBookmark((current) => !current);
                          setMessage(placingBookmark
                            ? "已取消放置书签。"
                            : "请在 PDF 中点击你当前读到的那一行。");
                        }}
                        title="在 PDF 中精确放置阅读书签"
                        type="button"
                      >{bookmarkSaving ? "保存中…" : placingBookmark ? "取消放置" : "＋ 加书签"}</button>
                      {bookmark && (
                        <>
                          <button
                            className="bookmark-jump-button"
                            onClick={() => navigateToPosition(bookmark)}
                            title={`跳到第 ${bookmark.page} 页页内 ${Math.round(bookmark.positionY)}%`}
                            type="button"
                          >🔖 跳转到书签</button>
                          <button
                            className="bookmark-delete-button"
                            disabled={bookmarkSaving}
                            onClick={() => void deleteBookmark()}
                            title="删除当前阅读书签"
                            type="button"
                          >删除书签</button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="reader-zoom-tools">
                    <button onClick={() => handlePdfZoom(-10)} title="缩小 PDF" type="button">−</button>
                    <span>{zoom}%</span>
                    <button onClick={() => handlePdfZoom(10)} title="放大 PDF" type="button">＋</button>
                    <button
                      aria-pressed={fitWidthEnabled}
                      className={fitWidthEnabled ? "fit-width active" : "fit-width"}
                      disabled={pdfLoading}
                      onClick={enableFitWidth}
                      title="让 PDF 左右撑满阅读区域"
                      type="button"
                    >适合宽度</button>
                  </div>
                  {!viewingPartnerNote && (
                    <div className="reader-annotation-tools">
                      <button
                        aria-pressed={annotationsEnabled}
                        className={`annotation-toggle${annotationsEnabled ? " enabled" : ""}`}
                        onClick={() => setAnnotationVisibility(!annotationsEnabled)}
                        type="button"
                      >
                        伙伴批注 {annotationsEnabled ? "开" : "关"}
                      </button>
                      <button className="capture-button" disabled={!localPdfUrl || pdfLoading} onClick={startDrawingAnnotation} type="button">
                        ▣ 画框批注
                      </button>
                      <button
                        className="generate-note-button"
                        disabled={generatingNotePdf || notes.every((note) => !note.rect)}
                        onClick={() => {
                          setContextTab("publish");
                          void buildNotePdf();
                        }}
                        type="button"
                      >
                        {generatingNotePdf ? "生成中…" : "生成读书笔记"}
                      </button>
                    </div>
                  )}
                </div>
                <input
                  accept="application/pdf,.pdf"
                  className="visually-hidden"
                  onChange={(event) => useReaderPdf(event.target.files?.[0])}
                  ref={readerFileInput}
                  type="file"
                />
                <div
                  className={`pdf-frame${pdfLoading ? " is-loading" : ""}${readerDragging ? " is-dragging" : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!viewingPartnerNote) setReaderDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.currentTarget === event.target) setReaderDragging(false);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    setReaderDragging(false);
                    if (!viewingPartnerNote) useReaderPdf(event.dataTransfer.files[0]);
                  }}
                  ref={pdfFrameRef}
                >
                  {readerDragging && (
                    <div className="reader-pdf-drop">
                      <strong>松开即可在阅读器中打开</strong>
                      <small>只在当前浏览器使用，不会重复上传文章</small>
                    </div>
                  )}
                  {(!activeReaderPdfUrl || pdfLoading || partnerNoteError) && (
                    <div className="pdf-loading" role="status">
                      {!partnerNoteError && (viewingPartnerNote || (localCache.status !== "error" && localCache.status !== "timeout")) && <span />}
                      <strong>
                        {viewingPartnerNote
                          ? partnerNoteError
                            ? "读书笔记暂时无法加载"
                            : `正在打开 ${activeNoteAuthor} 的读书笔记`
                          : localCache.status === "loading"
                          ? `正在完整下载论文 ${displayedPdfProgress}%`
                          : localCache.status === "timeout"
                            ? "下载超时"
                          : localCache.status === "error"
                            ? "论文暂时无法加载"
                          : "正在打开本地论文"}
                      </strong>
                      {!viewingPartnerNote && localCache.status === "loading" && (
                        <div
                          aria-label={`论文加载进度 ${displayedPdfProgress}%`}
                          aria-valuemax={100}
                          aria-valuemin={0}
                          aria-valuenow={displayedPdfProgress}
                          className="pdf-load-progress"
                          role="progressbar"
                        >
                          <i style={{ width: `${displayedPdfProgress}%` }} />
                        </div>
                      )}
                      {viewingPartnerNote ? (
                        partnerNoteError ? (
                          <div className="pdf-fallback-actions">
                            <button onClick={returnToArticle} type="button">返回论文</button>
                          </div>
                        ) : (
                          <small>读书笔记和论文使用同一个长条阅读器。</small>
                        )
                      ) : localCache.status === "error" || localCache.status === "timeout" ? (
                        <>
                          <small>
                            {localCache.status === "timeout"
                              ? "下载等待时间较长。你可以重试，或下载 PDF 后拖入这个阅读区域。"
                              : "你可以重试，或下载 PDF 后拖入这个阅读区域。"}
                          </small>
                          <div className="pdf-fallback-actions">
                            <button onClick={retryPdfDownload} type="button">重新下载</button>
                            {selectedArxivPage ? (
                              <a href={selectedArxivPage} rel="noreferrer" target="_blank">
                                在新标签页打开 arXiv 下载页面 ↗
                              </a>
                            ) : (
                              <button onClick={() => readerFileInput.current?.click()} type="button">
                                选择已经下载的本地 PDF
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <small>先完整下载并校验论文，再稳定连续显示；再次打开会使用浏览器缓存。</small>
                      )}
                    </div>
                  )}
                  {activeReaderPdfUrl && (
                    <PdfContinuousCanvas
                      initialPage={page}
                      initialPositionY={!viewingPartnerNote && bookmark?.page === page ? bookmark.positionY : 0}
                      key={`${articleId}-${partnerNoteReviewId ?? "article"}-${pdfRenderAttempt}-continuous`}
                      onError={handlePdfPageError}
                      onDocumentReady={handlePdfDocumentReady}
                      onLoad={handlePdfPageLoad}
                      onProgress={handlePdfProgress}
                      onTextSelect={useSelectedPdfText}
                      onVisiblePage={setPage}
                      onZoom={handlePdfZoom}
                      url={activeReaderPdfUrl}
                      zoom={zoom}
                    >
                      {(pageNumber) => viewingPartnerNote ? null : renderPdfAnnotationLayer(pageNumber)}
                    </PdfContinuousCanvas>
                  )}
                </div>
              </>
            ) : (
              <div className="article-reading-preview">
                <section>
                  <span>摘要</span>
                  <p className={!selectedArticle.abstract ? "abstract-repairing" : undefined}>
                    {selectedArticle.abstract || "摘要正在识别补齐，完成后会自动显示。"}
                  </p>
                  {selectedArticle.abstractZh && (
                    <div className="translated-abstract">
                      <strong>中文摘要</strong>
                      <p>{selectedArticle.abstractZh}</p>
                    </div>
                  )}
                </section>
                <section>
                  <header>
                    <div>
                      <span>伙伴评论</span>
                      <strong>{communityReviews.length} 条评论</strong>
                    </div>
                    <button onClick={beginReading} type="button">
                      {selectedArticle.lastReadPage ? "继续阅读" : "开始阅读"}
                    </button>
                  </header>
                  <div className="preview-comments">
                    {communityReviews.slice(0, 3).map((review) => (
                      <article key={review.id}>
                        <span>{review.author.slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong>{review.author} · {review.mustRead ? "✦ 必读" : `★ ${review.rating}`}</strong>
                          <p>{review.content}</p>
                        </div>
                      </article>
                    ))}
                    {!discussionLoading && communityReviews.length === 0 && <p>还没有伙伴评论，开始阅读后可以留下第一条。</p>}
                  </div>
                </section>
              </div>
            )}
          </>
        ) : (
          <div className="empty"><h3>先选择一篇文章</h3><p>也可以从 arXiv 导入新文章。</p></div>
        )}
      </section>

      <aside className="reader-notebook">
        <div className="notebook-heading">
          <div><span>阅读工作台</span><small>阅读、理解、整理、发布</small></div>
          {viewingPartnerNote && <em>{activeNoteAuthor}的笔记</em>}
        </div>
        <nav className="workspace-tabs" aria-label="阅读工作台功能">
          <button className={contextTab === "annotations" ? "selected" : ""} onClick={() => { setContextTab("annotations"); setMessage(""); }} type="button">
            <i aria-hidden="true">▣</i><strong>批注</strong>
          </button>
          <button className={contextTab === "translate" ? "selected" : ""} onClick={() => { setContextTab("translate"); setMessage(""); }} type="button">
            <i aria-hidden="true">译</i><strong>翻译</strong>
          </button>
          <button className={contextTab === "community" ? "selected" : ""} onClick={() => { setContextTab("community"); setMessage(""); }} type="button">
            <i aria-hidden="true">◎</i><strong>伙伴</strong>
          </button>
          <button className={contextTab === "publish" ? "selected" : ""} onClick={() => { setContextTab("publish"); setMessage(""); }} type="button">
            <i aria-hidden="true">↑</i><strong>发布</strong>
          </button>
        </nav>
        <div className="context-panel annotation-workspace" hidden={contextTab !== "annotations"}>
          <header className="workbench-section-heading"><div><strong>当前页伙伴批注</strong><small>悬浮查看，点击复用同一画框</small></div><span>{currentPageAnnotations.length}</span></header>
          {viewingPartnerNote ? (
            <div className="current-page-discussion note-reading-notice">
              <h3>{activeNoteAuthor}的读书笔记</h3>
              <p className="context-empty">当前正在查看笔记 PDF，返回论文后继续处理画框批注。</p>
              <button onClick={returnToArticle} type="button">返回论文</button>
            </div>
          ) : !articlePdfReady ? (
            <p className="context-empty">论文页面加载完成后显示批注。</p>
          ) : annotationsLoading ? (
            <p className="context-empty">正在加载当前论文的批注…</p>
          ) : annotationsEnabled ? (
            <div className="current-page-discussion">
              {currentAnnotationLayout.map(({ annotation, number }) => (
                <article
                  className={activeAnnotationId === annotation.id ? "is-active" : ""}
                  key={annotation.id}
                  onBlur={() => setActiveAnnotationId(null)}
                  onFocus={() => setActiveAnnotationId(annotation.id)}
                  onMouseEnter={() => setActiveAnnotationId(annotation.id)}
                  onMouseLeave={() => setActiveAnnotationId(null)}
                  style={{ "--annotation-color": annotationColor(annotation.author) } as CSSProperties}
                  tabIndex={0}
                >
                  <header><span>{number}</span><strong>{annotation.author}</strong><i>{annotation.author.slice(0, 1).toUpperCase()}</i></header>
                  {annotation.quote && <blockquote>{annotation.quote}</blockquote>}
                  {annotation.translation && <p className="community-translation">{annotation.translation}</p>}
                  <p>{annotation.content}</p>
                </article>
              ))}
              {currentPageAnnotations.length === 0 && <p className="context-empty">当前页还没有伙伴批注。</p>}
            </div>
          ) : (
            <button className="annotations-disabled" onClick={() => setAnnotationVisibility(true)} type="button">伙伴批注已关闭 · 点击开启</button>
          )}

          <section className="own-annotation-workspace">
            <header className="workbench-section-heading"><div><strong>我的画框批注</strong><small>批注将用于生成读书笔记 PDF</small></div><span>{notes.length}</span></header>
            {annotationRect ? (
              <section className="note-composer">
                <header><span>新批注</span><div><strong>填写这个画框的批注</strong><small>截图、位置和文字会一起保存</small></div></header>
                <textarea onChange={(event) => setNoteDraft(event.target.value)} placeholder="写下你对这个画框区域的理解…" rows={5} value={noteDraft} />
                <footer>
                  <span>伙伴框也可以直接复用</span>
                  <button
                    disabled={!noteDraft.trim()}
                    onClick={addCurrentAnnotation}
                    type="button"
                  >加入批注</button>
                </footer>
              </section>
            ) : (
              <section className="annotation-start-card">
                <span>▣</span><strong>选择一个画框</strong>
                <p>在论文中拖动画框，或点击伙伴已有的框，然后填写批注。</p>
                {!viewingPartnerNote && <button disabled={pdfLoading} onClick={startDrawingAnnotation} type="button">开始画框</button>}
              </section>
            )}
            <div className="saved-notes">
              <p className={`annotation-save-status is-${annotationSaveStatus}`} role="status">
                {annotationSaveStatus === "saving"
                  ? "正在实时保存…"
                  : annotationSaveStatus === "error"
                    ? "网络保存失败，已保留在本机，下次打开会自动重试。"
                    : "批注已实时保存"}
              </p>
              {notes.map((note, index) => (
                <div key={`${note.page}-${index}`}>
                  <button
                    onClick={() => {
                      articlePageBeforeNote.current = note.page;
                      if (viewingPartnerNote) returnToArticle();
                      else navigateToPage(note.page);
                    }}
                    type="button"
                  ><strong>批注 {index + 1}</strong><span>▣ {note.content}</span></button>
                  <button aria-label="删除这条批注" onClick={() => deleteAnnotation(index)} type="button">×</button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="context-panel" hidden={contextTab !== "translate"}>
          <header className="workbench-section-heading"><div><strong>学术翻译</strong><small>适合论文术语、公式与引用</small></div></header>
          {translationEnabled ? (
            <section className="translation-assistant">
              <div><strong>原文 → 简体中文</strong><button onClick={readClipboard} type="button">粘贴</button></div>
              <textarea
                onChange={(event) => { setQuoteDraft(event.target.value); setTranslation(""); }}
                placeholder="在左侧 PDF 中选中文字，或粘贴论文原文…"
                rows={7}
                value={quoteDraft}
              />
              <button disabled={!quoteDraft.trim() || translating} onClick={translateQuote} type="button">{translating ? "正在翻译…" : "翻译成中文"}</button>
              {translation && (
                <div className="translation-result">
                  <div className="translation-result-heading">
                    <span>中文译文</span>
                    <div aria-label="译文字号" className="translation-font-controls">
                      <button aria-label="减小译文字号" disabled={translationFontSize <= 12} onClick={() => changeTranslationFontSize(-2)} type="button">小</button>
                      <button aria-label="恢复默认译文字号" onClick={resetTranslationFontSize} title="恢复默认字号" type="button">{translationFontSize}px</button>
                      <button aria-label="增大译文字号" disabled={translationFontSize >= 22} onClick={() => changeTranslationFontSize(2)} type="button">大</button>
                    </div>
                  </div>
                  <p style={{ fontSize: `${translationFontSize}px` }}>{translation}</p>
                </div>
              )}
              {message && <p className="context-inline-message" role="status">{message}</p>}
            </section>
          ) : (
            <section className="translation-assistant coming-soon"><div><strong>学术翻译</strong><span>暂不可用</span></div><p>翻译服务配置完成后，可直接选中 PDF 原文翻译。</p></section>
          )}
        </div>

        <div className="context-panel community-panel" hidden={contextTab !== "community"}>
          <header className="workbench-section-heading"><div><strong>伙伴观点与读书笔记</strong><small>评论、笔记 PDF 与点赞集中在这里</small></div><span>{communityReviews.length}</span></header>
          {discussionLoading ? <p className="context-empty">正在加载伙伴观点…</p> : (
            <div className="community-overall-reviews">
              {communityReviews.map((review) => (
                <details key={review.id}>
                  <summary><span>{review.author.slice(0, 1).toUpperCase()}</span><strong>{review.author}</strong><small>{review.mustRead ? "✦ 必读" : `★ ${review.rating}`}</small></summary>
                  <p>{review.content}</p>
                  {review.attachments.length > 0 && <div className="community-images">{review.attachments.map((attachment) => (
                    <figure key={attachment.id}><img alt={attachment.note || "论文图表评论"} src={`/api/review-attachments/${attachment.id}`} />{attachment.note && <figcaption>{attachment.note}</figcaption>}</figure>
                  ))}</div>}
                  {review.noteFileName && <div className="partner-note-actions">
                    <button onClick={() => partnerNoteReviewId === review.id ? returnToArticle() : openPartnerNote(review)} type="button">{partnerNoteReviewId === review.id ? "返回论文" : "在阅读器打开笔记"}</button>
                    <ReadingNoteLikeButton initialCount={review.likeCount} initiallyLiked={review.likedByViewer} reviewId={review.id} />
                  </div>}
                </details>
              ))}
              {communityReviews.length === 0 && <p className="context-empty">还没有伙伴发布评论或读书笔记。</p>}
            </div>
          )}
        </div>

        <form className="review-form reader-review-form" hidden={contextTab !== "publish"} onSubmit={submitReview}>
          <header className="workbench-section-heading"><div><strong>{selectedArticle?.ownReview ? "修改并重新发布" : "发布读书笔记与评论"}</strong><small>依次完成下面 3 个步骤</small></div></header>
          <section className="publish-step">
            <header className="publish-step-heading"><span>1</span><div><strong>选择推荐等级</strong><small>必须评分，也可以直接标记为必读</small></div><em className={rating !== null ? "ready" : ""}>{rating !== null ? "已完成" : "待完成"}</em></header>
            <div className={`star-rating rating-${rating ?? "unrated"}${mustRead ? " is-must-read" : ""}`}>
              <div>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    aria-label={`${value} 星`}
                    className={value <= (rating ?? 0) ? "filled" : ""}
                    key={value}
                    onClick={() => {
                      setRating(value);
                      setMustRead(false);
                    }}
                    type="button"
                  >★</button>
                ))}
                <strong>{mustRead ? "✦ 必读" : rating === null ? "请选择评分" : `${rating}.0`}</strong>
              </div>
            </div>
            <label className={`must-read-toggle${mustRead ? " selected" : ""}`}>
              <input
                checked={mustRead}
                onChange={(event) => {
                  setMustRead(event.target.checked);
                  setRating(event.target.checked ? 5 : null);
                }}
                type="checkbox"
              />
              <span aria-hidden="true">✦</span>
              <div><strong>必读</strong><small>高于五星 · 向团队重点推荐</small></div>
              <em>五星之上</em>
            </label>
          </section>
          <section className="publish-step">
            <header className="publish-step-heading"><span>2</span><div><strong>准备读书笔记 PDF</strong><small>从画框生成，或上传已经写好的 PDF</small></div><em className={hasReadingNote ? "ready" : ""}>{hasReadingNote ? "已完成" : "待完成"}</em></header>
            <section className="reading-note-builder">
              <header>
                <div><strong>选择一种方式</strong><small>新文件会随这次评论一起发布</small></div>
                {selectedArticle?.ownReview?.noteFileName && !notePdfFile && <span>已有笔记</span>}
              </header>
              <div className="reading-note-methods">
                <button
                  disabled={generatingNotePdf || !localPdfUrl || notes.every((note) => !note.rect)}
                  onClick={() => void buildNotePdf()}
                  type="button"
                >
                  <strong>{generatingNotePdf ? "正在生成…" : "从我的截图框生成"}</strong>
                  <small>{notes.filter((note) => note.rect).length} 个截图框可用</small>
                </button>
                <button onClick={() => notePdfInput.current?.click()} type="button">
                  <strong>上传本地读书笔记 PDF</strong>
                  <small>从电脑选择 · 最大 30 MB</small>
                </button>
              </div>
              <input
                accept="application/pdf,.pdf"
                className="visually-hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) useNotePdf(file, "uploaded");
                }}
                ref={notePdfInput}
                type="file"
              />
              {notePdfFile && <p><strong>{notePdfFile.name}</strong><span>{notePdfSource === "generated" ? "由截图框生成" : "个人上传"} · {(notePdfFile.size / 1024 / 1024).toFixed(1)} MB</span></p>}
              {notePdfPreviewUrl && <iframe src={`${notePdfPreviewUrl}#toolbar=1`} title="读书笔记 PDF 预览" />}
              {!notePdfFile && selectedArticle?.ownReview?.noteFileName && (
                <a href={`/reviews/new?article=${articleId}&note=${selectedArticle.ownReview.id}`}>在阅读器打开已发布的读书笔记</a>
              )}
            </section>
          </section>
          <section className="publish-step">
            <header className="publish-step-heading"><span>3</span><div><strong>写评论</strong><small>说明方法、证据、局限和推荐理由</small></div><em className={content.trim() ? "ready" : ""}>{content.trim() ? "已完成" : "待完成"}</em></header>
            <label>
              <textarea
                aria-label="评论"
                onChange={(event) => setContent(event.target.value)}
                placeholder="写下你对这篇论文的完整判断…"
                required
                rows={12}
                value={content}
              />
              <small>{content.length} 字</small>
            </label>
          </section>
          {message && <p className="context-inline-message" role="status">{message}</p>}
          <button disabled={busy || articleId === 0 || rating === null || !content.trim() || !hasReadingNote} type="submit">
            {busy
              ? "正在保存…"
              : selectedArticle?.ownReview
                ? "保存修改"
                : "发布读书笔记与评论"}
          </button>
        </form>
      </aside>
    </div>
  );
}

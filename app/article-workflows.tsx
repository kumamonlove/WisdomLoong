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
import { ReadingNoteComments, ReadingNoteLikeButton } from "@/app/review-actions";
import { DeleteArticleButton, MarkReadButton, ReadingListButton } from "@/app/reading-actions";
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

class ApiResponseError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
  }
}

async function responseJson(response: Response) {
  const data = await response.json().catch(() => ({})) as { error?: string; [key: string]: unknown };
  if (!response.ok) {
    throw new ApiResponseError(data.error ?? `服务器请求失败（${response.status}）`, response.status);
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
        lastReadPositionX: null,
        isRead: false,
        readAt: null,
        inReadingList: addToReadingList,
        readingListAddedAt: addToReadingList ? new Date().toISOString() : null,
        readingStatus: "unread",
        canDelete: true,
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
        lastReadPositionX: null,
        isRead: false,
        readAt: null,
        inReadingList: false,
        readingListAddedAt: null,
        readingStatus: "unread",
        canDelete: true,
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
  annotationKind?: "frame" | "highlight";
  highlightRects?: AnnotationRect[];
  rect?: AnnotationRect | null;
};
type ReadingBookmark = { page: number; positionY: number; positionX?: number };
type CommunityAnnotation = ReadingNote & {
  id: number;
  reviewId: number;
  author: string;
};
type CommunityReview = {
  id: number;
  author: string;
  content: string;
  rating: number | null;
  reviewType: "long";
  mustRead: boolean;
  likeCount: number;
  likedByViewer: boolean;
  isOwn: boolean;
  readCount: number;
  annotationCount: number;
  commentCount: number;
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
  if (!pdfUrl || framedNotes.length === 0) throw new Error("请先添加至少一条图片或文字批注");
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
      if (note.annotationKind === "highlight") {
        const sections = [
          { label: "文字原文", text: note.quote },
          { label: "翻译", text: note.translation },
          { label: "批注", text: note.content },
        ].filter((section) => section.text.trim());
        let sectionIndex = 0;
        let remainingLines: string[] = [];
        let continuation = false;
        while (sectionIndex < sections.length || remainingLines.length > 0) {
          const pageCanvas = window.document.createElement("canvas");
          pageCanvas.width = 1240;
          pageCanvas.height = 1754;
          const context = pageCanvas.getContext("2d");
          if (!context) throw new Error("无法排版文字批注");
          context.fillStyle = "#f8f6ef";
          context.fillRect(0, 0, 1240, 1754);
          context.fillStyle = "#e1b72f";
          context.fillRect(0, 0, 24, 1754);
          context.fillStyle = "#181816";
          context.font = "700 40px sans-serif";
          const titleLines = canvasLines(context, title, 1080).slice(0, 3);
          titleLines.forEach((line, lineIndex) => context.fillText(line, 80, 105 + lineIndex * 52));
          let y = 105 + titleLines.length * 52 + 28;
          context.fillStyle = "#766f62";
          context.font = "24px sans-serif";
          context.fillText(`${author} · 文字批注 ${index + 1} · 原文第 ${note.page} 页${continuation ? "（续）" : ""}`, 80, y);
          y += 58;

          while (y < 1620 && (sectionIndex < sections.length || remainingLines.length > 0)) {
            const section = sections[sectionIndex];
            if (remainingLines.length === 0) {
              context.fillStyle = "#9a7100";
              context.font = "700 22px sans-serif";
              context.fillText(section.label, 80, y);
              y += 42;
              context.fillStyle = "#181816";
              context.font = "28px sans-serif";
              remainingLines = canvasLines(context, section.text, 1080);
            }
            const capacity = Math.max(1, Math.floor((1660 - y) / 43));
            const chunk = remainingLines.slice(0, capacity);
            chunk.forEach((line, lineIndex) => context.fillText(line, 80, y + lineIndex * 43));
            y += chunk.length * 43 + 34;
            remainingLines = remainingLines.slice(chunk.length);
            if (remainingLines.length === 0) sectionIndex += 1;
          }
          addCanvas(pageCanvas);
          continuation = true;
        }
        continue;
      }
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

function mergeTextLineRects(rects: AnnotationRect[]) {
  const lines: AnnotationRect[] = [];
  for (const rect of [...rects].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const line = lines.find((item) => Math.abs(item.y - rect.y) < Math.max(item.height, rect.height) * 0.45);
    if (!line) {
      lines.push({ ...rect });
      continue;
    }
    const right = Math.max(line.x + line.width, rect.x + rect.width);
    const bottom = Math.max(line.y + line.height, rect.y + rect.height);
    line.x = Math.min(line.x, rect.x);
    line.y = Math.min(line.y, rect.y);
    line.width = right - line.x;
    line.height = bottom - line.y;
  }
  return lines;
}

function textAnnotationPolygon(rects: AnnotationRect[]) {
  const lines = mergeTextLineRects(rects);
  if (lines.length === 0) return "";
  const first = lines[0];
  const last = lines[lines.length - 1];
  const minLeft = Math.min(...lines.map((rect) => rect.x));
  const maxRight = Math.max(...lines.map((rect) => rect.x + rect.width));
  const points = lines.length === 1
    ? [[first.x, first.y], [first.x + first.width, first.y], [first.x + first.width, first.y + first.height], [first.x, first.y + first.height]]
    : [
        [first.x, first.y], [maxRight, first.y], [maxRight, last.y],
        [last.x + last.width, last.y], [last.x + last.width, last.y + last.height],
        [minLeft, last.y + last.height], [minLeft, first.y + first.height], [first.x, first.y + first.height],
      ];
  const simplified = points.filter((point, index, items) => {
    const previous = items[(index - 1 + items.length) % items.length];
    const next = items[(index + 1) % items.length];
    if (point[0] === previous[0] && point[1] === previous[1]) return false;
    return !((previous[0] === point[0] && point[0] === next[0]) || (previous[1] === point[1] && point[1] === next[1]));
  });
  return simplified.map(([x, y]) => `${x},${y}`).join(" ");
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

      if (total > 100 * 1024 * 1024) throw new Error("PDF is larger than 100 MB");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      const allocated = total > 0 ? new Uint8Array(total) : null;
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (allocated && loaded + value.byteLength <= allocated.byteLength) {
          allocated.set(value, loaded);
        } else {
          chunks.push(value);
        }
        loaded += value.byteLength;
        if (loaded > 100 * 1024 * 1024) throw new Error("PDF is larger than 100 MB");
        onProgress(loaded, total);
      }
      let data: Uint8Array;
      if (allocated && loaded === allocated.byteLength && chunks.length === 0) {
        data = allocated;
      } else {
        data = new Uint8Array(loaded);
        const chunkBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        let offset = allocated ? Math.min(loaded - chunkBytes, allocated.byteLength) : 0;
        if (allocated) data.set(allocated.subarray(0, offset));
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.byteLength;
        }
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
  onTextSelect: (text: string, page: number, rects: AnnotationRect[]) => void;
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
          const pageElement = containerRef.current;
          let rects: AnnotationRect[] = [];
          if (text && selection?.rangeCount && pageElement) {
            const pageBounds = pageElement.getBoundingClientRect();
            if (pageBounds.width > 0 && pageBounds.height > 0) {
              rects = mergeTextLineRects(Array.from(selection.getRangeAt(0).getClientRects()).map((bounds) => {
                const left = Math.max(pageBounds.left, bounds.left);
                const top = Math.max(pageBounds.top, bounds.top);
                const right = Math.min(pageBounds.right, bounds.right);
                const bottom = Math.min(pageBounds.bottom, bounds.bottom);
                return {
                  x: (left - pageBounds.left) / pageBounds.width * 100,
                  y: (top - pageBounds.top) / pageBounds.height * 100,
                  width: (right - left) / pageBounds.width * 100,
                  height: (bottom - top) / pageBounds.height * 100,
                };
              }).filter((rect) => rect.width > 0 && rect.height > 0));
            }
          }
          if (text) onTextSelect(text, page, rects);
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
  onTextSelect: (text: string, page: number, rects: AnnotationRect[]) => void;
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
        const [data, pdfjs] = await Promise.all([
          downloadPdfData(url, onProgress, controller.signal),
          import("pdfjs-dist"),
        ]);
        window.clearTimeout(timeout);
        if (cancelled) return;
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
  onReadingListChange,
  onReadStatusChange,
}: {
  articles: ReaderArticle[];
  username: string;
  initialArticleId?: number;
  initialPartnerNoteReviewId?: number;
  startFocused?: boolean;
  translationEnabled?: boolean;
  onReadingListChange?: (articleId: number, inReadingList: boolean, createdAt: string | null) => void;
  onReadStatusChange?: (articleId: number, isRead: boolean, readAt: string | null) => void;
}) {
  const router = useRouter();
  const startingArticleId = initialArticleId ?? articles[0]?.id ?? 0;
  const startingArticle = articles.find((article) => article.id === startingArticleId);
  const startingReview = startingArticle?.ownReview;
  const [availableArticles, setAvailableArticles] = useState(articles);
  const [articleId, setArticleId] = useState(startingArticleId);
  const [expandedArticleId, setExpandedArticleId] = useState<number | null>(null);
  const [articleSearch, setArticleSearch] = useState("");
  const [articleTag, setArticleTag] = useState("全部");
  const [articleReadFilter, setArticleReadFilter] = useState<"all" | "read" | "reading" | "unread">("all");
  const [articleChronology, setArticleChronology] = useState<"latest" | "classic" | "high-rating" | "low-rating">("latest");
  const [showAllArticleTags, setShowAllArticleTags] = useState(false);
  const [rating, setRating] = useState<number | null>(startingArticle?.ownRating ?? null);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [mustRead, setMustRead] = useState(startingArticle?.ownMustRead ?? false);
  const [content, setContent] = useState(startingReview?.content ?? "");
  const [page, setPage] = useState(
    articles.find((article) => article.id === initialArticleId)?.lastReadPage ??
      articles[0]?.lastReadPage ??
      1,
  );
  const [zoom, setZoom] = useState(100);
  const [fitWidthEnabled, setFitWidthEnabled] = useState(false);
  const [focusMode, setFocusMode] = useState(startFocused);
  const [contextTab, setContextTab] = useState<"annotations" | "publish">("annotations");
  const [communityReviews, setCommunityReviews] = useState<CommunityReview[]>([]);
  const [libraryReviewsByArticle, setLibraryReviewsByArticle] = useState<Record<number, CommunityReview[]>>({});
  const [libraryDiscussionLoadingId, setLibraryDiscussionLoadingId] = useState<number | null>(null);
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
  const [editingAnnotationIndex, setEditingAnnotationIndex] = useState<number | null>(null);
  const [editingAnnotationContent, setEditingAnnotationContent] = useState("");
  const [quoteDraft, setQuoteDraft] = useState("");
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const translationAbortRef = useRef<AbortController | null>(null);
  const [textSelection, setTextSelection] = useState<{
    text: string;
    page: number;
    rects: AnnotationRect[];
  } | null>(null);
  const [notes, setNotes] = useState<ReadingNote[]>(
    (startingArticle?.savedAnnotations ?? startingReview?.annotations ?? []).filter((note) => note.rect),
  );
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [annotationSaveError, setAnnotationSaveError] = useState("");
  const [annotationPublishing, setAnnotationPublishing] = useState(false);
  const [serverConnection, setServerConnection] = useState<"checking" | "connected" | "disconnected">("checking");
  const [serverConnectionError, setServerConnectionError] = useState("");
  const [bookmark, setBookmark] = useState<ReadingBookmark | null>(startingArticle?.lastReadPage
    ? { page: startingArticle.lastReadPage, positionY: startingArticle.lastReadPositionY ?? 0, positionX: startingArticle.lastReadPositionX ?? 0 }
    : null);
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const [placingBookmark, setPlacingBookmark] = useState(false);
  const [drawingAnnotation, setDrawingAnnotation] = useState(false);
  const [annotationKind, setAnnotationKind] = useState<"frame" | "highlight">("frame");
  const [annotationStart, setAnnotationStart] = useState<{ x: number; y: number } | null>(null);
  const [annotationRect, setAnnotationRect] = useState<AnnotationRect | null>(null);
  const [highlightRects, setHighlightRects] = useState<AnnotationRect[]>([]);
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
  const pendingAnnotationNavigation = useRef<ReadingBookmark | null>(null);
  const pdfFrameRef = useRef<HTMLDivElement>(null);
  const currentArticleIdRef = useRef(articleId);
  const annotationSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const annotationSaveRevisions = useRef(new Map<number, number>());
  const annotationHoverTimer = useRef<number | null>(null);
  currentArticleIdRef.current = articleId;

  useEffect(() => () => translationAbortRef.current?.abort(), []);

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
  const readingFilterScope = useMemo(() => {
    const terms = articleSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return availableArticles.filter((article) => {
      if (articleTag !== "全部" && !article.tags.includes(articleTag)) return false;
      const haystack = [article.title, article.publisher, article.authors.join(" "), article.tags.join(" ")]
        .join(" ")
        .toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [articleSearch, articleTag, availableArticles]);
  const readingFilterCounts = useMemo(() => ({
    all: readingFilterScope.length,
    read: readingFilterScope.filter((article) => article.readingStatus === "read").length,
    unread: readingFilterScope.filter((article) => article.readingStatus === "unread").length,
    reading: readingFilterScope.filter((article) => article.readingStatus === "reading").length,
  }), [readingFilterScope]);
  const filteredArticles = useMemo(() => readingFilterScope
    .filter((article) => articleReadFilter === "all" || article.readingStatus === articleReadFilter)
    .sort((left, right) => {
      if (articleChronology === "high-rating" || articleChronology === "low-rating") {
        if (left.rating === null || left.rating === undefined) return right.rating === null || right.rating === undefined ? right.id - left.id : 1;
        if (right.rating === null || right.rating === undefined) return -1;
        const ratingDifference = articleChronology === "high-rating"
          ? right.rating - left.rating
          : left.rating - right.rating;
        if (ratingDifference !== 0) return ratingDifference;
      }
      const leftDate = left.publishedAt ?? "";
      const rightDate = right.publishedAt ?? "";
      if (!leftDate) return rightDate ? 1 : right.id - left.id;
      if (!rightDate) return -1;
      return articleChronology !== "classic"
        ? rightDate.localeCompare(leftDate) || right.id - left.id
        : leftDate.localeCompare(rightDate) || left.id - right.id;
    }), [articleChronology, articleReadFilter, readingFilterScope]);
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
    if (partnerNoteReviewId === null) {
      setLocalCache({ status: "ready", progress: 100 });
    }
  }, [partnerNoteReviewId]);
  const handlePdfProgress = useCallback((loaded: number, total: number) => {
    if (partnerNoteReviewId !== null) return;
    const progress = total > 0
      ? Math.max(1, Math.min(99, Math.round(loaded / total * 100)))
      : 1;
    setLocalCache((current) => current.status === "ready"
      ? current
      : { status: "loading", progress: Math.max(current.progress, progress) });
  }, [partnerNoteReviewId]);

  const checkServerConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setServerConnection("disconnected");
      setServerConnectionError("设备当前处于离线状态");
      return;
    }
    setServerConnection("checking");
    try {
      const response = await fetch("/api/connection", {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      await responseJson(response);
      setServerConnection("connected");
      setServerConnectionError("");
    } catch (error) {
      setServerConnection("disconnected");
      setServerConnectionError(error instanceof Error ? error.message : "无法连接应用服务器");
    }
  }, []);

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
      article.id === targetArticleId ? {
        ...article,
        savedAnnotations: nextNotes,
        readingStatus: article.isRead ? "read" : nextNotes.length > 0 || article.lastReadPage ? "reading" : "unread",
      } : article
    ));
    try {
      window.localStorage.setItem(annotationDraftStorageKey(targetArticleId), JSON.stringify(nextNotes));
    } catch {
      // The server save below remains authoritative if browser storage is full.
    }
    if (currentArticleIdRef.current === targetArticleId) {
      setAnnotationSaveStatus("saving");
      setAnnotationSaveError("");
    }

    annotationSaveQueue.current = annotationSaveQueue.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch(`/api/articles/${targetArticleId}/annotation-draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
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
          setAnnotationSaveError("");
          setServerConnection("connected");
          setServerConnectionError("");
        }
      })
      .catch((error: unknown) => {
        if (
          currentArticleIdRef.current === targetArticleId &&
          annotationSaveRevisions.current.get(targetArticleId) === revision
        ) {
          setAnnotationSaveStatus("error");
          setAnnotationSaveError(error instanceof Error ? error.message : "批注保存请求失败");
          if (!(error instanceof ApiResponseError)) {
            setServerConnection("disconnected");
            setServerConnectionError(error instanceof Error ? error.message : "无法连接应用服务器");
          } else if (error.status === 401) {
            setServerConnection("disconnected");
            setServerConnectionError("登录已失效，请重新登录");
          }
        }
      });
  }, []);

  async function publishAnnotations() {
    if (!articleId || notes.length === 0 || annotationPublishing) return;
    setAnnotationPublishing(true);
    setMessage("");
    try {
      await annotationSaveQueue.current.catch(() => undefined);
      const response = await fetch(`/api/articles/${articleId}/annotations/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: notes }),
      });
      const data = await responseJson(response);
      setMessage(`已提交 ${Number(data.count) || notes.length} 条批注，其他成员现在可以看到。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批注提交失败");
    } finally {
      setAnnotationPublishing(false);
    }
  }

  function showAnnotationAfterDelay(annotationId: number) {
    if (annotationHoverTimer.current !== null) window.clearTimeout(annotationHoverTimer.current);
    annotationHoverTimer.current = window.setTimeout(() => {
      setActiveAnnotationId(annotationId);
      annotationHoverTimer.current = null;
    }, 2_000);
  }

  function cancelAnnotationPreview(annotationId: number) {
    if (annotationHoverTimer.current !== null) {
      window.clearTimeout(annotationHoverTimer.current);
      annotationHoverTimer.current = null;
    }
    setActiveAnnotationId((current) => current === annotationId ? null : current);
  }

  function focusAnnotationInSidebar(annotationId: number) {
    if (annotationHoverTimer.current !== null) window.clearTimeout(annotationHoverTimer.current);
    annotationHoverTimer.current = null;
    setContextTab("annotations");
    setActiveAnnotationId(annotationId);
    window.requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-community-annotation-id="${annotationId}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      card?.focus({ preventScroll: true });
    });
  }

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

  function navigateToAnnotation(note: Pick<ReadingNote, "page" | "rect">) {
    const target = {
      page: note.page,
      positionY: note.rect?.y ?? 0,
    };
    articlePageBeforeNote.current = target.page;
    if (viewingPartnerNote) {
      pendingAnnotationNavigation.current = target;
      returnToArticle();
      return;
    }
    navigateToPosition(target);
  }

  async function saveBookmarkAt(pageNumber: number, positionY: number, positionX: number) {
    if (!articleId || viewingPartnerNote) return;
    const previousBookmark = bookmark;
    const nextBookmark = {
      page: Math.max(1, Math.floor(pageNumber)),
      positionY: Math.max(0, Math.min(100, positionY)),
      positionX: Math.max(0, Math.min(100, positionX)),
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
            lastReadPositionX: nextBookmark.positionX ?? 0,
            readingStatus: article.isRead ? "read" : "reading",
          }
        : article));
      setMessage(`书签已保存：第 ${nextBookmark.page} 页${(nextBookmark.positionX ?? 0) < 50 ? "左侧" : "右侧"}，页内 ${Math.round(nextBookmark.positionY)}% 位置。`);
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
        ? {
            ...article,
            lastReadPage: null,
            lastReadPositionY: null,
            lastReadPositionX: null,
            readingStatus: article.isRead ? "read" : article.savedAnnotations.length > 0 ? "reading" : "unread",
          }
        : article));
      setMessage("书签已删除。");
    } catch (error) {
      setBookmark(previousBookmark);
      setMessage(error instanceof Error ? error.message : "书签删除失败");
    } finally {
      setBookmarkSaving(false);
    }
  }

  async function saveArticleRating(value: number, nextMustRead = false) {
    if (!articleId || ratingSaving) return;
    const previousRating = rating;
    const previousMustRead = mustRead;
    setRating(value);
    setMustRead(nextMustRead);
    setRatingSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/rating`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: value, mustRead: nextMustRead }),
      });
      const data = await responseJson(response);
      const savedRating = Number(data.rating) || value;
      const savedMustRead = data.mustRead === true;
      const averageRating = data.averageRating === null ? null : Number(data.averageRating) || savedRating;
      setRating(savedRating);
      setMustRead(savedMustRead);
      setAvailableArticles((current) => current.map((article) => article.id === articleId
        ? {
            ...article,
            ownRating: savedRating,
            ownMustRead: savedMustRead,
            rating: averageRating,
            ownReview: article.ownReview
              ? { ...article.ownReview, rating: savedRating, mustRead: savedMustRead }
              : null,
          }
        : article));
      setMessage(savedMustRead ? "已标记为必读，发布区已同步。" : `已保存 ${savedRating} 星评分，发布区已同步。`);
    } catch (error) {
      setRating(previousRating);
      setMustRead(previousMustRead);
      setMessage(error instanceof Error ? error.message : "评分保存失败");
    } finally {
      setRatingSaving(false);
    }
  }

  async function clearArticleRating() {
    if (!articleId || ratingSaving) return;
    const previousRating = rating;
    const previousMustRead = mustRead;
    setRating(null);
    setMustRead(false);
    setRatingSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/rating`, { method: "DELETE" });
      const data = await responseJson(response);
      const averageRating = data.averageRating === null ? null : Number(data.averageRating) || null;
      setAvailableArticles((current) => current.map((article) => article.id === articleId
        ? {
            ...article,
            ownRating: null,
            ownMustRead: false,
            rating: averageRating,
            ownReview: article.ownReview
              ? { ...article.ownReview, rating: null, mustRead: false }
              : null,
          }
        : article));
      setMessage("已取消评分，发布区已同步。");
    } catch (error) {
      setRating(previousRating);
      setMustRead(previousMustRead);
      setMessage(error instanceof Error ? error.message : "取消评分失败");
    } finally {
      setRatingSaving(false);
    }
  }

  useEffect(() => {
    setAvailableArticles((current) => articles.map((article) => {
      const localArticle = current.find((item) => item.id === article.id);
      return localArticle
        ? { ...localArticle, inReadingList: article.inReadingList, readingListAddedAt: article.readingListAddedAt }
        : article;
    }));
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
    const saved = window.localStorage.getItem("wisdomloong-annotations-enabled");
    if (saved === "false") {
      setAnnotationsEnabled(false);
      setDrawingAnnotation(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => void checkServerConnection();
    const handleOffline = () => {
      setServerConnection("disconnected");
      setServerConnectionError("设备当前处于离线状态");
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void checkServerConnection();
    };
    void checkServerConnection();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkServerConnection();
    }, 30_000);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkServerConnection]);

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
    if (!expandedArticleId || Object.prototype.hasOwnProperty.call(libraryReviewsByArticle, expandedArticleId)) return;
    let cancelled = false;
    setLibraryDiscussionLoadingId(expandedArticleId);
    fetch(`/api/articles/${expandedArticleId}/discussion?includeAnnotations=0`)
      .then(responseJson)
      .then((data) => {
        if (cancelled) return;
        setLibraryReviewsByArticle((current) => ({
          ...current,
          [expandedArticleId]: (data.reviews as CommunityReview[]) ?? [],
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setLibraryDiscussionLoadingId((current) => current === expandedArticleId ? null : current);
        }
      });
    return () => { cancelled = true; };
  }, [expandedArticleId, libraryReviewsByArticle]);

  useEffect(() => {
    if (!articleId || (viewingPartnerNote ? pdfLoading : !articlePdfReady)) return;
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
  }, [articleId, articlePdfReady, pdfLoading, viewingPartnerNote]);

  useEffect(() => {
    if (!articlePdfReady || viewingPartnerNote || !pendingAnnotationNavigation.current) return;
    const target = pendingAnnotationNavigation.current;
    pendingAnnotationNavigation.current = null;
    navigateToPosition(target);
  }, [articlePdfReady, viewingPartnerNote]);

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
    setPdfLoading(true);
    setArticlePdfReady(false);
    setPage(article?.lastReadPage ?? 1);
    setRating(article?.ownRating ?? null);
    setMustRead(article?.ownMustRead ?? false);
    setContent(article?.ownReview?.content ?? "");
    setNotes((article?.savedAnnotations ?? article?.ownReview?.annotations ?? []).filter((note) => note.rect));
    setEditingAnnotationIndex(null);
    setEditingAnnotationContent("");
    setAnnotationSaveStatus("saved");
    setBookmark(article?.lastReadPage
      ? { page: article.lastReadPage, positionY: article.lastReadPositionY ?? 0, positionX: article.lastReadPositionX ?? 0 }
      : null);
    setPlacingBookmark(false);
    setDrawingAnnotation(false);
    setAnnotationStart(null);
    setAnnotationRect(null);
    setHighlightRects([]);
    setTextSelection(null);
    setQuoteDraft("");
    setTranslation("");
    setTranslationError("");
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

  function startDrawingAnnotation(kind: "frame" | "highlight" = "frame") {
    setPlacingBookmark(false);
    setDrawingAnnotation(true);
    setAnnotationKind(kind);
    setAnnotationRect(null);
    setHighlightRects([]);
    setTextSelection(null);
    setTranslation("");
    setTranslationError("");
    setAnnotationPage(page);
    setContextTab("annotations");
    setMessage(kind === "highlight"
      ? "请在当前 PDF 页面上拖选要批注的文字。"
      : "请在当前 PDF 页面上为图片或区域拖动画框。");
  }

  function addCurrentAnnotation() {
    if (!annotationRect || !noteDraft.trim()) return;
    const nextNotes = [...notes, {
      page: annotationPage,
      quote: quoteDraft.trim(),
      translation: "",
      content: noteDraft.trim(),
      annotationKind,
      highlightRects: annotationKind === "highlight" ? highlightRects : undefined,
      rect: annotationRect,
    }];
    setNotes(nextNotes);
    persistAnnotationDrafts(articleId, nextNotes);
    setNoteDraft("");
    setQuoteDraft("");
    setTranslation("");
    setAnnotationRect(null);
    setHighlightRects([]);
  }

  function cancelPendingAnnotation() {
    setDrawingAnnotation(false);
    setAnnotationStart(null);
    setAnnotationRect(null);
    setHighlightRects([]);
    setTextSelection(null);
    setQuoteDraft("");
    setTranslation("");
    setTranslationError("");
    setNoteDraft("");
    window.getSelection()?.removeAllRanges();
    setMessage("已取消这次批注。");
  }

  function deleteAnnotation(index: number) {
    const nextNotes = notes.filter((_, itemIndex) => itemIndex !== index);
    setNotes(nextNotes);
    persistAnnotationDrafts(articleId, nextNotes);
    if (editingAnnotationIndex === index) {
      setEditingAnnotationIndex(null);
      setEditingAnnotationContent("");
    } else if (editingAnnotationIndex !== null && editingAnnotationIndex > index) {
      setEditingAnnotationIndex(editingAnnotationIndex - 1);
    }
  }

  function startEditingAnnotation(index: number) {
    setEditingAnnotationIndex(index);
    setEditingAnnotationContent(notes[index]?.content ?? "");
  }

  function cancelEditingAnnotation() {
    setEditingAnnotationIndex(null);
    setEditingAnnotationContent("");
  }

  function saveEditedAnnotation() {
    if (editingAnnotationIndex === null || !editingAnnotationContent.trim()) return;
    const nextNotes = notes.map((note, index) => index === editingAnnotationIndex
      ? { ...note, content: editingAnnotationContent.trim() }
      : note
    );
    setNotes(nextNotes);
    persistAnnotationDrafts(articleId, nextNotes);
    setEditingAnnotationIndex(null);
    setEditingAnnotationContent("");
  }

  async function translateSelectedText() {
    if (!textSelection?.text.trim()) return;
    translationAbortRef.current?.abort();
    const controller = new AbortController();
    translationAbortRef.current = controller;
    setTranslating(true);
    setTranslation("");
    setTranslationError("");
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textSelection.text }),
        signal: controller.signal,
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
      if (!controller.signal.aborted) {
        setTranslationError(error instanceof Error ? error.message : "翻译失败");
      }
    } finally {
      if (translationAbortRef.current === controller) {
        translationAbortRef.current = null;
        setTranslating(false);
      }
    }
  }

  function closeSelectionActions() {
    translationAbortRef.current?.abort();
    translationAbortRef.current = null;
    setTranslating(false);
    setTranslation("");
    setTranslationError("");
    setTextSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function beginTextAnnotation(selection: { text: string; page: number; rects: AnnotationRect[] }) {
    if (selection.rects.length === 0) return;
    translationAbortRef.current?.abort();
    translationAbortRef.current = null;
    setTranslating(false);
    const x = Math.min(...selection.rects.map((rect) => rect.x));
    const y = Math.min(...selection.rects.map((rect) => rect.y));
    const right = Math.max(...selection.rects.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...selection.rects.map((rect) => rect.y + rect.height));
    setPage(selection.page);
    setQuoteDraft(selection.text);
    setTranslation("");
    setTranslationError("");
    setAnnotationKind("highlight");
    setAnnotationRect({
      x,
      y,
      width: Math.max(1, right - x),
      height: Math.max(1, bottom - y),
    });
    setHighlightRects(selection.rects);
    setAnnotationPage(selection.page);
    setDrawingAnnotation(false);
    setTextSelection(null);
    setContextTab("annotations");
    setMessage(`已选中第 ${selection.page} 页文字，请填写批注；不需要时可以取消框选。`);
    window.getSelection()?.removeAllRanges();
  }

  function useSelectedPdfText(text: string, pageNumber: number, rects: AnnotationRect[]) {
    const normalized = text
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12_000);
    if (!normalized) return;
    if (annotationRect) return;
    translationAbortRef.current?.abort();
    translationAbortRef.current = null;
    setTranslating(false);
    setPage(pageNumber);
    setTranslation("");
    setTranslationError("");
    const selection = { text: normalized, page: pageNumber, rects };
    if (drawingAnnotation && annotationKind === "highlight" && rects.length > 0) {
      beginTextAnnotation(selection);
      return;
    }
    if (rects.length === 0) return;
    setQuoteDraft(normalized);
    setTextSelection(selection);
    setMessage("");
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

  async function translateForReadingNote(text: string) {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "文字批注自动翻译失败");
    }
    const translated = (await response.text()).trim();
    if (!translated) throw new Error("文字批注自动翻译没有返回内容");
    return translated;
  }

  async function buildNotePdf() {
    if (!selectedArticle) return;
    setGeneratingNotePdf(true);
    setMessage("");
    try {
      const translatedNotes: ReadingNote[] = [];
      for (const note of notes) {
        if (note.annotationKind === "highlight" && note.quote.trim() && !note.translation.trim()) {
          setMessage(`正在自动翻译第 ${note.page} 页的文字批注…`);
          translatedNotes.push({ ...note, translation: await translateForReadingNote(note.quote) });
        } else {
          translatedNotes.push(note);
        }
      }
      if (translatedNotes.some((note, index) => note.translation !== notes[index]?.translation)) {
        setNotes(translatedNotes);
        persistAnnotationDrafts(articleId, translatedNotes);
      }
      const file = await generateReadingNotePdf({
        pdfUrl: localPdfUrl,
        title: selectedArticle.title,
        author: username,
        notes: translatedNotes,
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
    const wasAlreadyRead = selectedArticle?.isRead === true;
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
          ? {
              ...article,
              ownReview: updatedReview,
              savedAnnotations: notes,
              isRead: true,
              readAt: String(saved.readAt ?? new Date().toISOString()),
              readingStatus: "read",
            }
          : article
      ));
      if (!wasAlreadyRead) {
        onReadStatusChange?.(articleId, true, String(saved.readAt ?? new Date().toISOString()));
      }
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
    const selectionAnchor = textSelection?.page === pageNumber
      ? textSelection.rects[textSelection.rects.length - 1]
      : null;

    return (
      <div
        aria-label={placingBookmark
          ? `在 PDF 第 ${pageNumber} 页点击放置书签`
          : drawingAnnotation
            ? `在 PDF 第 ${pageNumber} 页${annotationKind === "highlight" ? "选择文字" : "为图片画框"}`
            : `PDF 第 ${pageNumber} 页批注层`}
        className={`pdf-annotation-layer${drawingAnnotation && annotationKind === "frame" ? " is-drawing" : ""}${drawingAnnotation && annotationKind === "highlight" ? " is-highlighting" : ""}${placingBookmark ? " is-bookmarking" : ""}`}
        onPointerDown={(event) => {
          if (placingBookmark) {
            event.preventDefault();
            event.stopPropagation();
            const point = annotationPoint(event);
            setPage(pageNumber);
            void saveBookmarkAt(pageNumber, point.y, point.x);
            return;
          }
          if (!drawingAnnotation || annotationKind === "highlight") return;
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
          setMessage(`已框选第 ${pageNumber} 页图片，请在右侧填写批注并加入。`);
        }}
      >
        {bookmark?.page === pageNumber && (
          <span
            aria-label={`阅读书签，第 ${pageNumber} 页页内 ${Math.round(bookmark.positionY)}%`}
            className="pdf-bookmark-line"
            style={{
              left: (bookmark.positionX ?? 0) < 50 ? 0 : "50%",
              right: "auto",
              top: `${bookmark.positionY}%`,
              width: "50%",
            }}
          ><i>书签</i></span>
        )}
        {annotationsEnabled && pageLayout.filter(({ annotation }) => annotation.rect && annotation.annotationKind !== "highlight").map(({ annotation, number, overlapIndex }) => (
          <div
            aria-label={`批注 ${number}，${annotation.author}：${annotation.content}。点击在相同位置添加我的批注`}
            className={`pdf-annotation-box is-community is-${annotation.annotationKind ?? "frame"}${activeAnnotationId === annotation.id ? " is-active" : ""}${overlapIndex ? " is-overlapping" : ""}`}
            key={`community-${annotation.id}`}
            onClick={(event) => {
              event.stopPropagation();
              focusAnnotationInSidebar(annotation.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              focusAnnotationInSidebar(annotation.id);
            }}
            onMouseLeave={() => cancelAnnotationPreview(annotation.id)}
            role="button"
            style={{
              left: `${annotation.rect!.x}%`,
              top: `${annotation.rect!.y}%`,
              width: `${annotation.rect!.width}%`,
              height: `${annotation.rect!.height}%`,
              transform: `translate(${overlapIndex * 4}px, ${overlapIndex * 4}px)`,
              zIndex: activeAnnotationId === annotation.id ? 50 : 10 + overlapIndex,
              "--annotation-color": annotationColor(annotation.author),
            } as CSSProperties}
            tabIndex={0}
          >
            <button
              aria-label={`在右侧查看批注 ${number}`}
              className="pdf-annotation-number"
              onClick={(event) => { event.stopPropagation(); focusAnnotationInSidebar(annotation.id); }}
              onFocus={() => showAnnotationAfterDelay(annotation.id)}
              onMouseEnter={() => showAnnotationAfterDelay(annotation.id)}
              onMouseLeave={() => cancelAnnotationPreview(annotation.id)}
              type="button"
            >{number}</button>
            <strong className="pdf-annotation-tooltip"><b>{annotation.author} · 批注 {number}</b>{annotation.content}<small>点击数字在右侧查看</small></strong>
          </div>
        ))}
        {annotationsEnabled && pageLayout.filter(({ annotation }) => annotation.annotationKind === "highlight").map(({ annotation, number }) => {
          const rects = annotation.highlightRects?.length ? annotation.highlightRects : annotation.rect ? [annotation.rect] : [];
          const anchor = rects[0];
          if (!anchor) return null;
          return <Fragment key={`community-text-${annotation.id}`}>
            <svg
              aria-label={`文字批注 ${number}：${annotation.content}`}
              className={`pdf-text-annotation-shape is-community${activeAnnotationId === annotation.id ? " is-active" : ""}`}
              onClick={(event) => { event.stopPropagation(); focusAnnotationInSidebar(annotation.id); }}
              preserveAspectRatio="none"
              role="button"
              viewBox="0 0 100 100"
            >
              <polygon points={textAnnotationPolygon(rects)} vectorEffect="non-scaling-stroke" />
            </svg>
            <button
              aria-label={`显示文字批注 ${number}：${annotation.content}`}
              className={`pdf-text-annotation-target${activeAnnotationId === annotation.id ? " is-active" : ""}`}
              onClick={(event) => { event.stopPropagation(); focusAnnotationInSidebar(annotation.id); }}
              onFocus={() => setActiveAnnotationId(annotation.id)}
              onMouseEnter={() => showAnnotationAfterDelay(annotation.id)}
              onMouseLeave={() => cancelAnnotationPreview(annotation.id)}
              style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
              type="button"
            ><span>{number}</span><strong className="pdf-annotation-tooltip"><b>{annotation.author} · 文字批注 {number}</b>{annotation.content}</strong></button>
          </Fragment>;
        })}
        {pageNotes.filter((item) => item.annotationKind !== "highlight").map((item, index) => {
          const overlapIndex = pageAnnotations.filter((annotation) =>
            annotation.rect && rectanglesOverlap(item.rect!, annotation.rect)
          ).length + pageNotes.slice(0, index).filter((note) =>
            note.rect && rectanglesOverlap(item.rect!, note.rect)
          ).length;
          return (
            <span
              className={`pdf-annotation-box is-own is-${item.annotationKind ?? "frame"}${overlapIndex ? " is-overlapping" : ""}`}
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
        {pageNotes.filter((item) => item.annotationKind === "highlight").map((item, index) => {
          const rects = item.highlightRects?.length ? item.highlightRects : item.rect ? [item.rect] : [];
          return rects.length > 0 ? <svg aria-label={`我的文字批注 ${index + 1}：${item.content}`} className="pdf-text-annotation-shape is-own" key={`own-text-${index}`} preserveAspectRatio="none" role="img" viewBox="0 0 100 100">
            <polygon points={textAnnotationPolygon(rects)} vectorEffect="non-scaling-stroke" />
          </svg> : null;
        })}
        {annotationRect && annotationKind !== "highlight" && annotationPage === pageNumber && (
          <span
            className={`pdf-annotation-box is-pending is-${annotationKind}`}
            style={{
              left: `${annotationRect.x}%`,
              top: `${annotationRect.y}%`,
              width: `${annotationRect.width}%`,
              height: `${annotationRect.height}%`,
              transform: `translate(${pendingOverlap * 4}px, ${pendingOverlap * 4}px)`,
            }}
          ><span>新</span></span>
        )}
        {annotationKind === "highlight" && annotationPage === pageNumber && highlightRects.length > 0 && (
          <svg aria-hidden="true" className="pdf-text-annotation-shape is-pending" preserveAspectRatio="none" viewBox="0 0 100 100">
            <polygon points={textAnnotationPolygon(highlightRects)} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {textSelection && selectionAnchor && (
          <section
            aria-label="所选文字操作"
            className={`pdf-selection-actions${selectionAnchor.y > 76 ? " is-above" : ""}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            style={{
              left: `${Math.min(62, Math.max(2, selectionAnchor.x))}%`,
              top: `${selectionAnchor.y > 76 ? selectionAnchor.y : selectionAnchor.y + selectionAnchor.height}%`,
            }}
          >
            <div className="pdf-selection-action-buttons">
              <button onClick={() => beginTextAnnotation(textSelection)} type="button">批注</button>
              <button
                disabled={!translationEnabled || translating}
                onClick={() => void translateSelectedText()}
                type="button"
              >{translating ? "翻译中…" : "翻译"}</button>
              <button
                aria-label="关闭翻译器"
                className="pdf-selection-close"
                onClick={closeSelectionActions}
                title="关闭"
                type="button"
              >×</button>
            </div>
            {!translationEnabled && <small>翻译服务暂不可用</small>}
            {translationError && <small className="is-error" role="alert">{translationError}</small>}
            {translation && <p><strong>中文译文</strong>{translation}</p>}
          </section>
        )}
        {placingBookmark && <strong>点击你当前读到的那一行</strong>}
        {drawingAnnotation && annotationKind === "frame" && !annotationStart && <strong>拖动鼠标框选论文中的图片或段落</strong>}
      </div>
    );
  }

  return (
    <div className={`reader-workspace${focusMode ? " focus-mode" : ""}`}>
      {focusMode && (
        <div className="focus-status">
          <span><i />扩展算法组知识库</span>
          {!viewingPartnerNote && (
            <div className={`focus-direct-rating rating-${rating ?? "unrated"}${mustRead ? " is-must-read" : ""}${ratingSaving ? " is-saving" : ""}`} aria-label="直接为当前文章评分">
              <strong>我的评分</strong>
              <div>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    aria-label={`${value} 星`}
                    aria-pressed={!mustRead && rating === value}
                    className={`rating-star${value <= (rating ?? 0) ? " filled" : ""}`}
                    disabled={ratingSaving}
                    key={value}
                    onClick={() => void (!mustRead && rating === value ? clearArticleRating() : saveArticleRating(value))}
                    type="button"
                  >★</button>
                ))}
                <button
                  aria-label="标记为必读"
                  aria-pressed={mustRead}
                  className={`focus-must-read${mustRead ? " selected" : ""}`}
                  disabled={ratingSaving}
                  onClick={() => void (mustRead ? clearArticleRating() : saveArticleRating(5, true))}
                  type="button"
                >✦ 必读</button>
              </div>
              <em>{ratingSaving ? "保存中" : mustRead ? "必读" : rating ? `${rating}.0` : "未评分"}</em>
              {rating !== null && (
                <button
                  className="focus-rating-clear"
                  disabled={ratingSaving}
                  onClick={() => void clearArticleRating()}
                  type="button"
                >取消</button>
              )}
            </div>
          )}
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
        <div
          className="library-tools-hover-area"
          onMouseLeave={(event) => {
            const focusedElement = document.activeElement;
            if (focusedElement instanceof HTMLElement && event.currentTarget.contains(focusedElement)) {
              focusedElement.blur();
            }
          }}
        >
          <div
            aria-label="悬浮或聚焦显示文章库工具"
            className="library-tools-hover-trigger"
            role="button"
            tabIndex={0}
          >
            <span>文章库工具</span>
            <small>悬浮查看检索与筛选</small>
            <i aria-hidden="true">⌄</i>
          </div>
          <div className="article-library-banner">
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
          <div className="library-tag-filter" aria-label="文章分类筛选">
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
          <div className="library-filter-row">
            <div className="library-chronology-switch" aria-label="文章排序方式">
              <button className={articleChronology === "latest" ? "selected" : ""} onClick={() => setArticleChronology("latest")} type="button">
                <span>追随潮流</span><small>最新优先</small>
              </button>
              <button className={articleChronology === "classic" ? "selected" : ""} onClick={() => setArticleChronology("classic")} type="button">
                <span>回味经典</span><small>最早优先</small>
              </button>
              <button className={articleChronology === "high-rating" ? "selected" : ""} onClick={() => setArticleChronology("high-rating")} type="button">
                <span>慧眼识珠</span><small>高分优先</small>
              </button>
              <button className={articleChronology === "low-rating" ? "selected" : ""} onClick={() => setArticleChronology("low-rating")} type="button">
                <span>独特品位</span><small>低分优先</small>
              </button>
            </div>
            <div className="library-read-filter" aria-label="阅读状态筛选">
              {([
                ["all", "全部"],
                ["read", "已读"],
                ["unread", "未读"],
                ["reading", "在读"],
              ] as const).map(([value, label]) => (
                <button
                  className={articleReadFilter === value ? "selected" : ""}
                  key={value}
                  onClick={() => setArticleReadFilter(value)}
                  type="button"
                ><strong>{label}</strong><span>{readingFilterCounts[value]}</span></button>
              ))}
            </div>
          </div>
          </div>
        </div>
        <div className="article-search-results">
          {filteredArticles.map((article, index) => {
            const month = article.publishedAt?.slice(0, 7) ?? "日期待补";
            const previousMonth = filteredArticles[index - 1]?.publishedAt?.slice(0, 7) ?? (index > 0 ? "日期待补" : "");
            const inlineCommunityReviews = libraryReviewsByArticle[article.id] ?? [];
            const inlineDiscussionLoading = libraryDiscussionLoadingId === article.id;
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
                beginReadingArticle(article.id);
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setExpandedArticleId((current) => current === article.id ? null : current);
                }
              }}
              onFocus={() => setExpandedArticleId(article.id)}
              onMouseEnter={() => setExpandedArticleId(article.id)}
              onMouseLeave={() => setExpandedArticleId((current) => current === article.id ? null : current)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                beginReadingArticle(article.id);
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
                <span className={`reading-status is-${article.readingStatus}`}>
                  {article.readingStatus === "read" ? "已读" : article.readingStatus === "reading" ? "在读" : "未读"}
                </span>
                <span><i aria-hidden="true">★</i>{article.rating ?? "暂无评分"}</span>
                <span><i aria-hidden="true">✓</i>{article.readCount ?? 0} 人读过</span>
                <span className={(article.readingNowCount ?? 0) > 0 ? "is-live" : ""}>
                  <i aria-hidden="true">●</i>{article.readingNowCount ?? 0} 人正在读
                </span>
              </div>
              <div className="library-card-secondary-actions">
                <ReadingListButton
                  articleId={article.id}
                  initialSaved={article.inReadingList}
                  onChange={(inReadingList, createdAt) => {
                    setAvailableArticles((current) => current.map((item) => item.id === article.id
                      ? { ...item, inReadingList, readingListAddedAt: createdAt }
                      : item));
                    onReadingListChange?.(article.id, inReadingList, createdAt);
                  }}
                />
                <MarkReadButton
                  articleId={article.id}
                  initialRead={article.isRead}
                  onChange={(isRead, readAt) => {
                    setAvailableArticles((current) => current.map((item) => item.id === article.id
                      ? {
                          ...item,
                          isRead,
                          readAt,
                          readingStatus: isRead
                            ? "read"
                            : item.savedAnnotations.length > 0 || item.lastReadPage ? "reading" : "unread",
                        }
                      : item));
                    onReadStatusChange?.(article.id, isRead, readAt);
                  }}
                />
              </div>
              {article.id !== expandedArticleId ? (
                <p className="library-card-abstract">
                  {article.abstractZh || article.abstract || "摘要正在识别补齐。"}
                </p>
              ) : (
                <div className="library-inline-details">
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
                      <span>{inlineCommunityReviews.length} 条</span>
                    </div>
                    {inlineDiscussionLoading ? (
                      <p>正在加载评论…</p>
                    ) : inlineCommunityReviews.length > 0 ? (
                      <div>
                        {inlineCommunityReviews.slice(0, 3).map((review) => (
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
                  <DeleteArticleButton
                    articleId={article.id}
                    articleTitle={article.title}
                    canDelete={article.canDelete}
                    onDeleted={() => {
                      setAvailableArticles((current) => current.filter((item) => item.id !== article.id));
                      if (articleId === article.id) {
                        const next = availableArticles.find((item) => item.id !== article.id);
                        setArticleId(next?.id ?? 0);
                        setExpandedArticleId(null);
                      }
                      router.refresh();
                    }}
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
                      >{review.isOwn ? "我的笔记" : `${review.author}的笔记`}</button>
                    ))}
                    {viewingPartnerNote && !activePartnerNote && (
                      <button aria-pressed="true" className="selected" type="button">{activeNoteAuthor}的笔记</button>
                    )}
                  </div>
                  {viewingPartnerNote && activePartnerNote && (
                    <div className="note-reader-engagement">
                      {activePartnerNote.isOwn ? (
                        <>
                          <div className="own-note-read-count">
                            <span aria-hidden="true">◉</span>
                            <strong>{activePartnerNote.readCount}</strong>
                            <small>人读过我的笔记</small>
                          </div>
                          <ReadingNoteComments
                            initialCount={activePartnerNote.commentCount}
                            reviewId={activePartnerNote.id}
                          />
                        </>
                      ) : (
                        <>
                          <span className="note-like-prompt">读完有收获？</span>
                          <ReadingNoteLikeButton
                            initialCount={activePartnerNote.likeCount}
                            initiallyLiked={activePartnerNote.likedByViewer}
                            key={`reader-like-${activePartnerNote.id}`}
                            reviewId={activePartnerNote.id}
                          />
                          <ReadingNoteComments
                            initialCount={activePartnerNote.commentCount}
                            reviewId={activePartnerNote.id}
                          />
                        </>
                      )}
                    </div>
                  )}
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
                            title={`跳到第 ${bookmark.page} 页${(bookmark.positionX ?? 0) < 50 ? "左侧" : "右侧"}页内 ${Math.round(bookmark.positionY)}%`}
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
                  <div className="reader-file-tools">
                    <a
                      download
                      href={`/api/articles/${selectedArticle.id}/pdf?download=1`}
                      title="把当前论文 PDF 下载到本地"
                    ><i aria-hidden="true">↓</i><span>下载 PDF</span></a>
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
                      <button className="capture-button" disabled={!localPdfUrl || pdfLoading} onClick={() => startDrawingAnnotation("frame")} type="button">
                        ▣ 图片批注
                      </button>
                      <button className="text-annotation-button" disabled={!localPdfUrl || pdfLoading} onClick={() => startDrawingAnnotation("highlight")} type="button">
                        ▨ 文字批注
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
                          : "正在解析并打开论文"}
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
                          <strong>{review.author} · {review.mustRead ? "✦ 必读" : review.rating === null ? "未评分" : `★ ${review.rating}`}</strong>
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
          <div className="notebook-heading-status">
            {viewingPartnerNote && <em>{activeNoteAuthor}的笔记</em>}
            <button
              aria-label="检查服务器连接"
              className={`server-connection is-${serverConnection}`}
              onClick={() => void checkServerConnection()}
              title={serverConnectionError || "应用服务器和数据库连接正常"}
              type="button"
            ><i aria-hidden="true" />{serverConnection === "checking" ? "正在检查" : serverConnection === "connected" ? "已连接" : "连接异常"}</button>
          </div>
        </div>
        <nav className="workspace-tabs" aria-label="阅读工作台功能">
          <button className={contextTab === "annotations" ? "selected" : ""} onClick={() => { setContextTab("annotations"); setMessage(""); }} type="button">
            <i aria-hidden="true">▣</i><strong>批注</strong>
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
              <p className="context-empty">读书笔记与论文位置批注同时保留。</p>
              {activePartnerNote && activePartnerNote.annotationCount > 0 && (
                <div className="note-linked-annotations">
                  <header><strong>这份笔记的批注</strong><span>{activePartnerNote.annotationCount} 条</span></header>
                  {(activePartnerNote.isOwn ? notes : communityAnnotations.filter((annotation) => annotation.reviewId === activePartnerNote.id || (annotation.reviewId === 0 && annotation.author === activePartnerNote.author))).map((annotation, index) => (
                    <button key={`${annotation.page}-${index}`} onClick={() => navigateToAnnotation(annotation)} type="button">
                      <strong>第 {annotation.page} 页 · {annotation.annotationKind === "highlight" ? "文字批注" : "图片批注"}</strong>
                      <span>{annotation.content}</span>
                    </button>
                  ))}
                  {!activePartnerNote.isOwn && communityAnnotations.filter((annotation) => annotation.reviewId === activePartnerNote.id || (annotation.reviewId === 0 && annotation.author === activePartnerNote.author)).length === 0 && <small>正在加载批注…</small>}
                </div>
              )}
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
                  data-community-annotation-id={annotation.id}
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
            <header className="workbench-section-heading"><div><strong>我的批注</strong><small>文字批注保存原文，生成报告时自动翻译</small></div><span>{notes.length}</span></header>
            {annotationRect ? (
              <section className="note-composer">
                <header><span>新批注</span><div><strong>填写{annotationKind === "highlight" ? "文字" : "图片"}批注</strong><small>{annotationKind === "highlight" ? "所选原文和批注会一起保存" : "截图、位置和批注会一起保存"}</small></div></header>
                {annotationKind === "highlight" && (
                  <div className="highlight-text-preview">
                    <strong>所选原文</strong>
                    <blockquote>{quoteDraft}</blockquote>
                  </div>
                )}
                <textarea onChange={(event) => setNoteDraft(event.target.value)} placeholder={`写下你对这段${annotationKind === "highlight" ? "文字" : "图片"}的理解…`} rows={5} value={noteDraft} />
                <footer>
                  <button className="cancel-pending-annotation" onClick={cancelPendingAnnotation} type="button">取消框选</button>
                  <button disabled={!noteDraft.trim()} onClick={addCurrentAnnotation} type="button">加入批注</button>
                </footer>
              </section>
            ) : (
              <section className="annotation-start-card">
                <span>▣</span><strong>选择一个批注位置</strong>
                <p>图片批注通过画框创建；文字批注通过选择 PDF 文字创建。</p>
                {!viewingPartnerNote && <div className="annotation-start-actions"><button disabled={pdfLoading} onClick={() => startDrawingAnnotation("frame")} type="button">批注图片</button><button disabled={pdfLoading} onClick={() => startDrawingAnnotation("highlight")} type="button">批注文字</button></div>}
              </section>
            )}
            <div className="saved-notes">
              <div className="annotation-publish-bar">
                <button disabled={notes.length === 0 || annotationPublishing || annotationSaveStatus === "saving"} onClick={() => void publishAnnotations()} type="button">
                  {annotationPublishing ? "正在提交…" : "提交批注"}
                </button>
              </div>
              <div className={`annotation-save-status is-${annotationSaveStatus}`} role="status">
                <span>{annotationSaveStatus === "saving"
                  ? "正在实时保存…"
                  : annotationSaveStatus === "error"
                    ? `保存失败：${annotationSaveError || "无法连接服务器"}。内容已保留在本机。`
                    : "批注已实时保存"}</span>
                {annotationSaveStatus === "error" && <button onClick={() => persistAnnotationDrafts(articleId, notes)} type="button">重新保存</button>}
              </div>
              {notes.map((note, index) => (
                <div className={editingAnnotationIndex === index ? "is-editing" : ""} key={`${note.page}-${index}`}>
                  {editingAnnotationIndex === index ? (
                    <div className="saved-note-editor">
                      <label htmlFor={`annotation-edit-${index}`}>修改批注 {index + 1}</label>
                      <textarea
                        autoFocus
                        id={`annotation-edit-${index}`}
                        maxLength={4000}
                        onChange={(event) => setEditingAnnotationContent(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") cancelEditingAnnotation();
                          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") saveEditedAnnotation();
                        }}
                        rows={4}
                        value={editingAnnotationContent}
                      />
                      <footer>
                        <span>Esc 取消 · Ctrl/⌘ + Enter 保存</span>
                        <div><button onClick={cancelEditingAnnotation} type="button">取消</button><button disabled={!editingAnnotationContent.trim()} onClick={saveEditedAnnotation} type="button">保存修改</button></div>
                      </footer>
                    </div>
                  ) : (
                    <>
                      <button
                        className="saved-note-jump"
                        onClick={() => navigateToAnnotation(note)}
                        type="button"
                      ><strong>{note.annotationKind === "highlight" ? "文字批注" : "图片批注"} {index + 1}</strong><span>{note.annotationKind === "highlight" ? "▨" : "▣"} {note.content}</span></button>
                      <button aria-label={`编辑批注 ${index + 1}`} className="saved-note-edit" onClick={() => startEditingAnnotation(index)} type="button">编辑</button>
                      <button aria-label={`删除批注 ${index + 1}`} className="saved-note-delete" onClick={() => deleteAnnotation(index)} type="button">×</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <form className="review-form reader-review-form" hidden={contextTab !== "publish"} onSubmit={submitReview}>
          <header className="workbench-section-heading"><div><strong>{selectedArticle?.ownReview ? "修改并重新发布" : "发布读书笔记与评论"}</strong><small>依次完成下面 3 个步骤</small></div></header>
          <section className="publish-step">
            <header className="publish-step-heading"><span>1</span><div><strong>选择推荐等级</strong><small>必须评分，也可以直接标记为必读</small></div><em className={rating !== null ? "ready" : ""}>{rating !== null ? "已完成" : "待完成"}</em></header>
            <div className={`star-rating rating-${rating ?? "unrated"}${mustRead ? " is-must-read" : ""}${ratingSaving ? " is-saving" : ""}`}>
              <div>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    aria-label={`${value} 星`}
                    aria-pressed={!mustRead && rating === value}
                    className={`rating-star${value <= (rating ?? 0) ? " filled" : ""}`}
                    key={value}
                    disabled={ratingSaving}
                    onClick={() => void (!mustRead && rating === value ? clearArticleRating() : saveArticleRating(value))}
                    type="button"
                  >★</button>
                ))}
                <strong aria-live="polite">{ratingSaving ? "保存中…" : mustRead ? "✦ 必读" : rating === null ? "请选择评分" : `${rating}.0`}</strong>
                {rating !== null && (
                  <button
                    className="rating-clear"
                    disabled={ratingSaving}
                    onClick={() => void clearArticleRating()}
                    type="button"
                  >取消评分</button>
                )}
              </div>
            </div>
            <label className={`must-read-toggle${mustRead ? " selected" : ""}`}>
              <input
                checked={mustRead}
                onChange={(event) => {
                  if (event.target.checked) void saveArticleRating(5, true);
                  else void clearArticleRating();
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

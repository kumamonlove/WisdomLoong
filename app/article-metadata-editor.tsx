"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { normalizeTags } from "@/lib/knowledge-types";
import { LoadingKnowledge } from "@/app/loading-knowledge";

export type ArticleMetadataUpdate = {
  publishedAt?: string | null;
  publisher?: string;
  tags?: string[];
};

async function responseJson(response: Response) {
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "保存失败");
  return data;
}

function knownPublisher(publisher: string) {
  return Boolean(publisher && publisher !== "机构待补充" && publisher.toLocaleLowerCase() !== "arxiv");
}

export function ArticleMetadataEditor({
  articleId,
  initialPublishedAt,
  initialPublisher,
  initialTags,
  onSaved,
}: {
  articleId: number;
  initialPublishedAt: string | null;
  initialPublisher: string;
  initialTags: string[];
  onSaved?: (update: ArticleMetadataUpdate) => void;
}) {
  const router = useRouter();
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt ?? "");
  const [publisher, setPublisher] = useState(knownPublisher(initialPublisher) ? initialPublisher : "");
  const [publisherSaved, setPublisherSaved] = useState(knownPublisher(initialPublisher));
  const [tags, setTags] = useState(initialTags);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function savePublisher() {
    const nextPublisher = publisher.trim();
    if (!nextPublisher || nextPublisher.toLocaleLowerCase() === "arxiv") {
      setMessage("请填写真实发布机构，不能填写 arXiv。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await responseJson(await fetch(`/api/articles/${articleId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publisher: nextPublisher }),
      }));
      setPublisher(nextPublisher);
      setPublisherSaved(true);
      setMessage("发布机构已保存。");
      onSaved?.({ publisher: nextPublisher });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布机构保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveTags(nextTags: string[]) {
    const normalized = normalizeTags(nextTags);
    if (normalized.length === 0) {
      setMessage("请至少保留一个标签。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await responseJson(await fetch(`/api/articles/${articleId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: normalized }),
      }));
      setTags(normalized);
      setTagDraft("");
      setMessage("标签已保存。");
      onSaved?.({ tags: normalized });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "标签保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function savePublishedAt() {
    setBusy(true);
    setMessage("");
    try {
      await responseJson(await fetch(`/api/articles/${articleId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishedAt: publishedAt || null }),
      }));
      setMessage(publishedAt ? "发布日期已保存。" : "发布日期已清除。");
      onSaved?.({ publishedAt: publishedAt || null });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布日期保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card-metadata-editor">
      <summary>编辑标签、发布机构与发布日期</summary>
      <div>
        <section>
          <strong>文章标签</strong>
          <div className="card-metadata-tags">
            {tags.map((tag) => (
              <button disabled={busy || tags.length === 1} key={tag} onClick={() => void saveTags(tags.filter((item) => item !== tag))} type="button">
                {tag} ×
              </button>
            ))}
          </div>
          <label>
            <input onChange={(event) => setTagDraft(event.target.value)} placeholder="添加标签" value={tagDraft} />
            <button disabled={busy || !tagDraft.trim()} onClick={() => void saveTags([...tags, tagDraft])} type="button">添加并保存</button>
          </label>
        </section>
        <section>
          <strong>发布机构</strong>
          <label>
            <input aria-label="发布机构" onChange={(event) => setPublisher(event.target.value)} value={publisher} />
            <button disabled={busy || !publisher.trim()} onClick={() => void savePublisher()} type="button">
              {publisherSaved ? "保存修改" : "添加并保存"}
            </button>
          </label>
        </section>
        <section>
          <strong>发布日期</strong>
          <label>
            <input aria-label="发布日期" onChange={(event) => setPublishedAt(event.target.value)} type="date" value={publishedAt} />
            <button disabled={busy} onClick={() => void savePublishedAt()} type="button">保存日期</button>
          </label>
        </section>
        {message && <p role="status">{message}</p>}
        {busy && <LoadingKnowledge compact />}
      </div>
    </details>
  );
}

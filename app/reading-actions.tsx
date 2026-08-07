"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkReadButton({
  articleId,
  initialRead = false,
  onChange,
}: {
  articleId: number;
  initialRead?: boolean;
  onChange?: (isRead: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isRead, setIsRead] = useState(initialRead);
  const [failed, setFailed] = useState(false);

  async function toggleRead() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/articles/${articleId}/read`, {
        method: isRead ? "DELETE" : "POST",
      });
      if (!response.ok) throw new Error("read state update failed");
      const nextRead = !isRead;
      setIsRead(nextRead);
      onChange?.(nextRead);
      if (!onChange) router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={`mark-read-button${isRead ? " done" : ""}`}
      disabled={busy}
      onClick={toggleRead}
      type="button"
    >
      {busy ? "正在更新…" : failed ? "更新失败，请重试" : isRead ? "↶ 恢复未读" : "✓ 标记为已读"}
    </button>
  );
}

export function DeleteArticleButton({
  articleId,
  articleTitle,
  canDelete,
  onDeleted,
}: {
  articleId: number;
  articleTitle: string;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function deleteArticle() {
    if (!canDelete || busy) return;
    if (!window.confirm(`确定删除《${articleTitle}》吗？此操作无法撤销。`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "删除失败");
      onDeleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="delete-article-action">
      <button
        disabled={!canDelete || busy}
        onClick={() => void deleteArticle()}
        title={canDelete ? "删除这篇尚无评论和读书笔记的文章" : "已有评论或读书笔记，不能删除"}
        type="button"
      >{busy ? "删除中…" : "删除文章"}</button>
      {message && <small role="alert">{message}</small>}
    </div>
  );
}

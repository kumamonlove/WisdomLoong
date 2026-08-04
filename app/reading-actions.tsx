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

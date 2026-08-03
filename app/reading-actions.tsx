"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkReadButton({ articleId, initialRead = false }: { articleId: number; initialRead?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isRead, setIsRead] = useState(initialRead);

  async function toggleRead() {
    setBusy(true);
    try {
      const response = await fetch(`/api/articles/${articleId}/read`, {
        method: isRead ? "DELETE" : "POST",
      });
      if (!response.ok) throw new Error("read state update failed");
      setIsRead((current) => !current);
      router.refresh();
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
      {busy ? "正在更新…" : isRead ? "↶ 恢复未读" : "✓ 标记为已读"}
    </button>
  );
}

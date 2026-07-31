"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkReadButton({ articleId }: { articleId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function markRead() {
    setBusy(true);
    try {
      const response = await fetch(`/api/articles/${articleId}/read`, { method: "POST" });
      if (!response.ok) throw new Error("mark failed");
      setDone(true);
      window.setTimeout(() => router.refresh(), 450);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={`mark-read-button${done ? " done" : ""}`}
      disabled={busy || done}
      onClick={markRead}
      type="button"
    >
      {done ? "✓ 已标记为已读" : busy ? "正在标记…" : "✓ 标记为已读"}
    </button>
  );
}

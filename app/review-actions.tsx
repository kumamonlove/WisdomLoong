"use client";

import { useState } from "react";

export function ReviewLikeButton({
  reviewId,
  initialCount,
  initiallyLiked,
}: {
  reviewId: number;
  initialCount: number;
  initiallyLiked: boolean;
}) {
  const [liked, setLiked] = useState(initiallyLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  async function toggleLike() {
    if (busy) return;
    const nextLiked = !liked;
    setBusy(true);
    setLiked(nextLiked);
    setCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)));
    try {
      const response = await fetch(`/api/reviews/${reviewId}/like`, {
        method: nextLiked ? "POST" : "DELETE",
      });
      const data = (await response.json()) as { liked?: boolean; count?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "操作失败");
      setLiked(Boolean(data.liked));
      setCount(Number(data.count) || 0);
      if (data.liked) {
        setCelebrate(true);
        window.setTimeout(() => setCelebrate(false), 650);
      }
    } catch {
      setLiked(!nextLiked);
      setCount((value) => Math.max(0, value + (nextLiked ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      aria-label={liked ? "取消赞同" : "赞同这篇长评"}
      aria-pressed={liked}
      className={`review-like${liked ? " liked" : ""}${celebrate ? " celebrate" : ""}`}
      disabled={busy}
      onClick={toggleLike}
      type="button"
    >
      <span aria-hidden="true">♥</span>
      <strong>{liked ? "已赞同" : "赞同长评"}</strong>
      <small>{count}</small>
      {celebrate && <i aria-hidden="true">＋1</i>}
    </button>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LoadingKnowledge } from "@/app/loading-knowledge";

export function ReadingNoteLikeButton({
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
      aria-label={liked ? "取消点赞读书笔记" : "点赞这份读书笔记"}
      aria-pressed={liked}
      className={`review-like${liked ? " liked" : ""}${celebrate ? " celebrate" : ""}`}
      disabled={busy}
      onClick={toggleLike}
      type="button"
    >
      <span aria-hidden="true">♥</span>
      <strong>{liked ? "已点赞" : "点赞笔记"}</strong>
      <small>{count}</small>
      {celebrate && <i aria-hidden="true">＋1</i>}
    </button>
  );
}

type NoteComment = {
  id: number;
  author: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
};

export function AnnotationComments({
  annotationId,
  source,
}: {
  annotationId: number;
  source: "published" | "review";
}) {
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/annotations/${source}/${annotationId}/comments`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { comments?: NoteComment[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "评论加载失败");
        if (active) setComments(data.comments ?? []);
      })
      .catch((error) => active && setMessage(error instanceof Error ? error.message : "评论加载失败"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [annotationId, source]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/annotations/${source}/${annotationId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      const data = await response.json() as { comment?: NoteComment; error?: string };
      if (!response.ok || !data.comment) throw new Error(data.error ?? "评论发布失败");
      setComments((current) => [...current, data.comment!]);
      setDraft("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评论发布失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="annotation-comments" onClick={(event) => event.stopPropagation()}>
      {loading ? <LoadingKnowledge compact /> : comments.length > 0 ? (
        <div className="annotation-comment-list">
          {comments.map((comment) => <article key={comment.id}>
            <strong>{comment.author}{comment.isOwn ? " · 我" : ""}</strong>
            <p>{comment.content}</p>
          </article>)}
        </div>
      ) : <p>还没有评论。</p>}
      <form onSubmit={submit}>
        <textarea maxLength={1000} onChange={(event) => setDraft(event.target.value)} placeholder="评论这条批注…" rows={2} value={draft} />
        <button disabled={busy || !draft.trim()} type="submit">{busy ? "发布中…" : "评论"}</button>
      </form>
      {busy && <LoadingKnowledge compact />}
      {message && <small role="alert">{message}</small>}
    </div>
  );
}

export function ReadingNoteComments({
  reviewId,
  initialCount = 0,
}: {
  reviewId: number;
  initialCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [count, setCount] = useState(initialCount);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    setLoading(true);
    fetch(`/api/reviews/${reviewId}/comments`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { comments?: NoteComment[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "评论加载失败");
        if (active) {
          setComments(data.comments ?? []);
          setCount(data.comments?.length ?? 0);
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (active) {
          setLoaded(true);
          setMessage(error instanceof Error ? error.message : "评论加载失败");
        }
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loaded, open, reviewId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/reviews/${reviewId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json() as { comment?: NoteComment; error?: string };
      if (!response.ok || !data.comment) throw new Error(data.error ?? "评论发布失败");
      setComments((current) => [...current, data.comment!]);
      setCount((value) => value + 1);
      setDraft("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评论发布失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`note-comments${open ? " is-open" : ""}`}>
      <button className="note-comments-toggle" onClick={() => setOpen((value) => !value)} type="button">
        评论笔记 <span>{count}</span>
      </button>
      {open && (
        <div className="note-comments-panel">
          {loading ? <LoadingKnowledge compact /> : comments.length > 0 ? (
            <div className="note-comment-list">
              {comments.map((comment) => (
                <article key={comment.id}>
                  <strong>{comment.author}{comment.isOwn ? " · 我" : ""}</strong>
                  <p>{comment.content}</p>
                </article>
              ))}
            </div>
          ) : <p>还没有评论，说说这份笔记给你的启发。</p>}
          <form onSubmit={submit}>
            <textarea
              maxLength={1000}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="评论这份读书笔记…"
              rows={2}
              value={draft}
            />
            <button disabled={busy || !draft.trim()} type="submit">{busy ? "发布中…" : "发布评论"}</button>
          </form>
          {busy && <LoadingKnowledge compact />}
          {message && <small role="alert">{message}</small>}
        </div>
      )}
    </div>
  );
}

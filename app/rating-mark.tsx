import type { CSSProperties } from "react";

export function RatingMark({ rating, className = "" }: { rating: number; className?: string }) {
  const normalized = Math.max(0, Math.min(5, Number(rating) || 0));
  return (
    <span aria-label={`评分 ${normalized} 星`} className={`rating-mark${className ? ` ${className}` : ""}`}>
      <i
        aria-hidden="true"
        className="rating-mark-stars"
        style={{ "--rating-fill": `${normalized / 5 * 100}%` } as CSSProperties & { "--rating-fill": string }}
      >★★★★★</i>
    </span>
  );
}

export function MustReadMark({ className = "" }: { className?: string }) {
  return <span className={`must-read-mark${className ? ` ${className}` : ""}`}>必读</span>;
}

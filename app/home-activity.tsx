"use client";

import { useMemo, useState } from "react";
import { ArticleGrid } from "@/app/knowledge-page";
import type { ArticleCardData } from "@/lib/knowledge";

type ActivitySort = "latest" | "hot";

function ActivitySection({
  articles,
  title,
  kind,
}: {
  articles: ArticleCardData[];
  title: string;
  kind: "notes" | "annotations";
}) {
  const [sort, setSort] = useState<ActivitySort>("latest");
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => [...articles].sort((left, right) => {
    if (sort === "latest") {
      return (right.activityAt ?? "").localeCompare(left.activityAt ?? "") || right.id - left.id;
    }
    const leftScore = kind === "notes"
      ? (left.noteLikeCount ?? 0) * 3 + (left.noteCommentCount ?? 0) * 2 + (left.noteReadCount ?? 0)
      : left.activityCount ?? 0;
    const rightScore = kind === "notes"
      ? (right.noteLikeCount ?? 0) * 3 + (right.noteCommentCount ?? 0) * 2 + (right.noteReadCount ?? 0)
      : right.activityCount ?? 0;
    return rightScore - leftScore || (right.activityAt ?? "").localeCompare(left.activityAt ?? "");
  }), [articles, kind, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / 2));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * 2, safePage * 2 + 2);

  function changeSort(next: ActivitySort) {
    setSort(next);
    setPage(0);
  }

  return (
    <section className="list activity-list">
      <div className="list-toolbar">
        <div className="list-title"><h2>{title}</h2><span>{articles.length} 篇</span></div>
        <div className="activity-sort" aria-label={`${title}排序`}>
          <button className={sort === "latest" ? "selected" : ""} onClick={() => changeSort("latest")} type="button">最新</button>
          <button className={sort === "hot" ? "selected" : ""} onClick={() => changeSort("hot")} type="button">最热</button>
        </div>
      </div>
      <div className="activity-pager">
        <button
          aria-label={`${title}上一页`}
          className="activity-page-key previous"
          disabled={safePage === 0}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
          type="button"
        >‹</button>
        <ArticleGrid
          articles={visible}
          emptyDescription={kind === "notes" ? "成员发布读书笔记后，会显示在这里。" : "成员提交文章批注后，会显示在这里。"}
          emptyTitle={kind === "notes" ? "还没有精选笔记" : "还没有人在读"}
          variant={kind === "notes" ? "team-reading" : "annotated-reading"}
        />
        <button
          aria-label={`${title}下一页`}
          className="activity-page-key next"
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          type="button"
        >›</button>
      </div>
      {pageCount > 1 && <p className="activity-page-status">{safePage + 1} / {pageCount}</p>}
    </section>
  );
}

export function HomeActivity({
  featuredNotes,
  annotatedArticles,
}: {
  featuredNotes: ArticleCardData[];
  annotatedArticles: ArticleCardData[];
}) {
  return (
    <>
      <ActivitySection articles={featuredNotes} kind="notes" title="精选笔记" />
      <ActivitySection articles={annotatedArticles} kind="annotations" title="大家在读" />
    </>
  );
}

import { ReviewComposer } from "@/app/article-workflows";
import { KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import { getArticlesForReview } from "@/lib/knowledge";

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ article?: string; note?: string }>;
}) {
  const user = await requireUser();
  const articles = await getArticlesForReview(user.id);
  const params = await searchParams;
  const requestedId = Number(params.article);
  const requestedNoteId = Number(params.note);
  const hasRequestedArticle = articles.some((article) => article.id === requestedId);
  const initialArticleId = hasRequestedArticle
    ? requestedId
    : articles[0]?.id;

  return (
    <KnowledgePage
      eyebrow="SHARE WHAT YOU LEARNED"
      page="review"
      title="阅读文章"
      description="在专注阅读中截取证据、整理批注，发布读书笔记 PDF 与评论"
      username={user.username}
    >
      <ReviewComposer
        articles={articles}
        username={user.username}
        initialArticleId={initialArticleId}
        initialPartnerNoteReviewId={Number.isInteger(requestedNoteId) && requestedNoteId > 0 ? requestedNoteId : undefined}
        startFocused={hasRequestedArticle}
        translationEnabled={Boolean(process.env.TRANSLATION_API_KEY ?? process.env.DASHSCOPE_API_KEY)}
      />
    </KnowledgePage>
  );
}

import { ReviewComposer } from "@/app/article-workflows";
import { KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import { getArticlesForReview } from "@/lib/knowledge";

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ article?: string }>;
}) {
  const user = await requireUser();
  const articles = await getArticlesForReview();
  const requestedId = Number((await searchParams).article);
  const initialArticleId = articles.some((article) => article.id === requestedId)
    ? requestedId
    : articles[0]?.id;

  return (
    <KnowledgePage
      eyebrow="SHARE WHAT YOU LEARNED"
      page="review"
      title="阅读文章"
      description="在专注阅读中摘取证据、整理思路，并留下值得分享的长评论"
      username={user.username}
    >
      <ReviewComposer articles={articles} initialArticleId={initialArticleId} />
    </KnowledgePage>
  );
}

import { ReadingArticlePage } from "@/app/reading-article-page";
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
    <ReadingArticlePage
      articles={articles}
      initialArticleId={initialArticleId}
      initialPartnerNoteReviewId={Number.isInteger(requestedNoteId) && requestedNoteId > 0 ? requestedNoteId : undefined}
      startFocused={hasRequestedArticle}
      translationEnabled={Boolean(process.env.TRANSLATION_API_KEY ?? process.env.DASHSCOPE_API_KEY)}
      username={user.username}
    />
  );
}

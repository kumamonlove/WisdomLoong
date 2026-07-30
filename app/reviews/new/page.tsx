import { ReviewComposer } from "@/app/article-workflows";
import { KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import { getArticlesForReview } from "@/lib/knowledge";

export default async function NewReviewPage() {
  const user = await requireUser();
  const articles = await getArticlesForReview();

  return (
    <KnowledgePage
      eyebrow="SHARE WHAT YOU LEARNED"
      page="review"
      title="撰写评论"
      description="为文章评分，留下对团队真正有帮助的阅读判断"
      username={user.username}
    >
      <ReviewComposer articles={articles} />
    </KnowledgePage>
  );
}

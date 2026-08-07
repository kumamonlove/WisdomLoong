import { HomeActivity } from "@/app/home-activity";
import { KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import { getAnnotatedReadingArticles, getFeaturedNoteArticles } from "@/lib/knowledge";

export default async function Home() {
  const user = await requireUser();
  const [featuredNotes, annotatedArticles] = await Promise.all([
    getFeaturedNoteArticles(),
    getAnnotatedReadingArticles(),
  ]);

  return (
    <KnowledgePage
      page="recommended"
      title="阅读动态"
      description="查看成员最新与最受关注的读书笔记、文章批注"
      username={user.username}
    >
      <HomeActivity annotatedArticles={annotatedArticles} featuredNotes={featuredNotes} />
    </KnowledgePage>
  );
}

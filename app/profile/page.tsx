import { KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import { getUserReviewProfile } from "@/lib/knowledge";
import { UsernameForm } from "@/app/profile/username-form";
import { MathTitle } from "@/app/math-title";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getUserReviewProfile(user.id);

  return (
    <KnowledgePage
      eyebrow="YOUR CONTRIBUTION"
      page="profile"
      title={`${user.username} 的主页`}
      description="每一次认真阅读与分享，都在帮助团队更快地理解前沿工作"
      username={user.username}
    >
      <UsernameForm username={user.username} />
      <section className="profile-stats">
        <div className="likes-received">
          <span>收到的赞</span>
          <strong><i aria-hidden="true">♥</i>{profile.stats.totalLikes}</strong>
          <small>来自团队成员对你读书笔记的认可</small>
        </div>
        <div><span>评论</span><strong>{profile.stats.longReviews}</strong><small>成员观点分享</small></div>
        <div><span>读书笔记 PDF</span><strong>{profile.stats.notePdfs}</strong><small>截图与批注整理</small></div>
      </section>

      <section className="profile-reviews">
        <div className="list-title"><h2>我的评论</h2><span>{profile.reviews.length} 篇</span></div>
        {profile.reviews.map((review) => (
          <article key={review.id}>
            <div>
              <span>评论</span>
              {review.mustRead
                ? <em className="must-read-badge">✦ 必读</em>
                : <small>★ {review.rating}</small>}
            </div>
            <h3><MathTitle title={review.title} /></h3>
            <p>{review.content}</p>
            {review.noteFileName && <a className="profile-note-link" href={`/reviews/new?article=${review.articleId}&note=${review.id}`}>在阅读器打开我的读书笔记</a>}
            <footer>
              <span>{new Intl.DateTimeFormat("zh-CN").format(new Date(review.updatedAt))}</span>
              <strong className={review.likeCount > 0 ? "has-likes" : ""}>
                ♥ {review.likeCount} 个赞同
              </strong>
            </footer>
          </article>
        ))}
        {profile.reviews.length === 0 && (
          <div className="empty"><h3>还没有评论</h3><p>完成一次阅读并分享你的判断吧。</p></div>
        )}
      </section>
    </KnowledgePage>
  );
}

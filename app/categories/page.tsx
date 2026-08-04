import { KnowledgeGraphExplorer } from "@/app/knowledge-graph-explorer";
import { KnowledgePage } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";
import { getKnowledgeGraph, getKnowledgeGraphDomains } from "@/lib/knowledge-graph";

export default async function KnowledgeGraphPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string | string[] }>;
}) {
  const [user, params, domains] = await Promise.all([
    requireUser(),
    searchParams,
    getKnowledgeGraphDomains(),
  ]);
  const requested = Array.isArray(params.domain) ? params.domain[0] : params.domain;
  const selectedDomain = domains.some((item) => item.domain === requested)
    ? requested!
    : domains[0]?.domain ?? "VLA";
  const graph = await getKnowledgeGraph(selectedDomain);

  return (
    <KnowledgePage
      page="categories"
      title="知识图谱"
      description="共同整理各领域论文之间的思想继承与发展分支"
      username={user.username}
    >
      {domains.length > 0 ? (
        <KnowledgeGraphExplorer domains={domains} graph={graph} />
      ) : (
        <section className="empty graph-empty">
          <span>01</span><h3>知识图谱等待第一篇文章</h3><p>添加带领域标签的文章后，成员可以共同拖放整理。</p>
        </section>
      )}
    </KnowledgePage>
  );
}

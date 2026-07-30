import { KnowledgePage, parseOrder } from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const [params, user] = await Promise.all([searchParams, requireUser()]);

  return (
    <KnowledgePage
      page="latest"
      category="全部"
      order={parseOrder(params.order)}
      username={user.username}
    />
  );
}

import { KnowledgePage, parseOrder } from "@/app/knowledge-page";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;

  return (
    <KnowledgePage page="latest" category="全部" order={parseOrder(params.order)} />
  );
}

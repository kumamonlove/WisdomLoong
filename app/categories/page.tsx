import {
  KnowledgePage,
  parseCategory,
  parseOrder,
} from "@/app/knowledge-page";

type CategoriesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const params = await searchParams;

  return (
    <KnowledgePage
      page="categories"
      category={parseCategory(params.category)}
      order={parseOrder(params.order)}
    />
  );
}

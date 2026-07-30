import {
  KnowledgePage,
  parseCategory,
  parseOrder,
} from "@/app/knowledge-page";
import { requireUser } from "@/lib/auth";

type CategoriesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const [params, user] = await Promise.all([searchParams, requireUser()]);

  return (
    <KnowledgePage
      page="categories"
      category={parseCategory(params.category)}
      order={parseOrder(params.order)}
      username={user.username}
    />
  );
}

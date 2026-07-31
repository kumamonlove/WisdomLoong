export const categories = [
  "全部",
  "Ego第一人称",
  "VLA",
  "世界模型",
  "强化学习",
] as const;

export const articleCategories = categories.slice(1);

export type Category = (typeof categories)[number];
export type ArticleCategory = (typeof articleCategories)[number];
export type SortOrder = "newest" | "oldest" | "rating";
export type ReviewFilter = "all" | "reviewed" | "unreviewed";

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= 24),
  )].slice(0, 12);
}

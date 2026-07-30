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

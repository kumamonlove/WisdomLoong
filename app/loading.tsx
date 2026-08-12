import { LoadingKnowledge } from "@/app/loading-knowledge";

export default function Loading() {
  return (
    <main className="route-loading" aria-busy="true" aria-live="polite">
      <span className="route-loading-spinner" aria-hidden="true" />
      <h1>正在加载…</h1>
      <LoadingKnowledge />
    </main>
  );
}

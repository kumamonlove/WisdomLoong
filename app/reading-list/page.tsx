import { redirect } from "next/navigation";

export default function RemovedReadingListPage() {
  redirect("/reviews/new");
}

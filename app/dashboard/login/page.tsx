import packageInfo from "@/package.json";
import { isAdmin } from "@/lib/admin-auth";
import { redirect } from "next/navigation";

export default async function DashboardLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAdmin()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <div className="admin-login">
      <main>
        <p>WISDOMLOONG CONTROL ROOM</p>
        <h1>管理后台</h1>
        <form action="/api/dashboard/login" method="post">
          <label>管理员账号<input autoFocus name="username" required /></label>
          <label>密码<input name="password" required type="password" /></label>
          {error && <span role="alert">账号或密码不正确</span>}
          <button type="submit">进入后台</button>
        </form>
      </main>
      <footer><span>仅限管理员访问</span><span>v{packageInfo.version}</span></footer>
    </div>
  );
}

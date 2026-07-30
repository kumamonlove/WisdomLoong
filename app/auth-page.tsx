import packageInfo from "@/package.json";

type AuthMode = "login" | "register";

const appVersion = `v${packageInfo.version}`;

export function AuthPage({
  mode,
  error,
}: {
  mode: AuthMode;
  error?: string;
}) {
  const isLogin = mode === "login";

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <a aria-label="WisdomLoong" className="auth-wordmark" href="/login">
          WISDOM/OONG
        </a>
        <span>ALGORITHM TEAM</span>
      </header>

      <main className="auth-main">
        <section className="auth-intro">
          <p>ROBOTICS KNOWLEDGE HUB</p>
          <h1>{isLogin ? "欢迎回来" : "加入知识平台"}</h1>
          <span>
            {isLogin
              ? "登录后继续阅读与分享团队知识。"
              : "使用团队邀请码创建你的内部账号。"}
          </span>
        </section>

        <section className="auth-panel">
          <div className="auth-tabs" aria-label="账户操作">
            <a className={isLogin ? "active" : ""} href="/login">
              登录
            </a>
            <a className={!isLogin ? "active" : ""} href="/register">
              注册
            </a>
          </div>

          <form
            action={`/api/auth/${mode}`}
            className="auth-form"
            method="post"
          >
            <label>
              用户名
              <input
                autoComplete="username"
                autoFocus
                maxLength={32}
                minLength={2}
                name="username"
                placeholder="请输入用户名"
                required
                type="text"
              />
            </label>

            <label>
              密码
              <input
                autoComplete={isLogin ? "current-password" : "new-password"}
                name="password"
                placeholder="请输入密码"
                required
                type="password"
              />
            </label>

            {!isLogin && (
              <label>
                邀请码
                <input
                  autoComplete="off"
                  name="invitationCode"
                  placeholder="请输入团队邀请码"
                  required
                  type="password"
                />
              </label>
            )}

            {error && (
              <p aria-live="polite" className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit">{isLogin ? "登录" : "创建账号"}</button>
          </form>

          <p className="auth-switch">
            {isLogin ? "还没有账号？" : "已经有账号？"}
            <a href={isLogin ? "/register" : "/login"}>
              {isLogin ? "立即注册" : "返回登录"}
            </a>
          </p>
        </section>
      </main>

      <footer className="auth-footer">
        <span>WisdomLoong · 目前仅供算法组内部交流学习使用</span>
        <span>{appVersion}</span>
      </footer>
    </div>
  );
}

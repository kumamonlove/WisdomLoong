import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/app/auth-page";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "登录 · WisdomLoong",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await getCurrentUser()) {
    redirect("/");
  }

  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return <AuthPage mode="login" error={error} />;
}

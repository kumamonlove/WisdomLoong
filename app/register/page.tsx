import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/app/auth-page";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "注册 · WisdomLoong",
};

type RegisterPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  if (await getCurrentUser()) {
    redirect("/");
  }

  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return <AuthPage mode="register" error={error} />;
}

"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

const schema = z.object({
  email: z.string().email("Введите рабочий email"),
  password: z.string().min(1, "Введите пароль"),
});

export type SigninState = {
  ok: boolean;
  error?: string;
};

export async function signinAction(
  _prev: SigninState,
  formData: FormData,
): Promise<SigninState> {
  const raw = {
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    // redirectTo обязателен, чтобы Auth.js установил session cookie
    // через response редиректа (signIn без redirectTo cookie не пишет).
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/app",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Неверный email или пароль" };
    }
    throw err; // re-throw NEXT_REDIRECT
  }

  // unreachable
  redirect("/app");
}

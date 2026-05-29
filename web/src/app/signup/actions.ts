"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { signIn } from "@/auth";

const schema = z.object({
  email: z.string().email("Введите рабочий email"),
  name: z.string().min(2, "Имя — минимум 2 символа").max(80),
  password: z.string().min(6, "Пароль — минимум 6 символов").max(120),
});

export type SignupState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"email" | "name" | "password", string>>;
};

export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const raw = {
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    name: String(formData.get("name") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: SignupState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "email" | "name" | "password";
      fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const existing = await db.teacher.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return { ok: false, fieldErrors: { email: "Учитель с таким email уже зарегистрирован" } };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.teacher.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
    },
  });

  // авто-логин после регистрации — signIn сам сделает redirect и установит cookies
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/app",
  });

  // unreachable — signIn выбросит NEXT_REDIRECT
  redirect("/app");
}

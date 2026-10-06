"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { forgotSchema, loginSchema, resetSchema, signupSchema } from "@/lib/validation/auth";

export type FormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] ??= i.message;
  return out;
}

async function appOrigin() {
  const h = await headers();
  return process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Generic message: do not reveal whether the e-mail exists.
  if (error) return { error: "E-mail ou senha incorretos." };
  redirect("/");
}

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await appOrigin()}/auth/callback`,
    },
  });
  if (error) return { error: "Não foi possível criar a conta. Tente novamente." };
  if (!data.session) {
    return { message: "Enviamos um link de confirmação para o seu e-mail." };
  }
  redirect("/");
}

export async function forgotPassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await appOrigin()}/auth/callback?next=/reset-password`,
  });
  // Same response whether or not the account exists.
  return { message: "Se o e-mail existir, enviaremos um link para redefinir a senha." };
}

export async function resetPassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Não foi possível atualizar a senha. O link pode ter expirado." };
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

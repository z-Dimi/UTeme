import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido");
export const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter ao menos 8 caracteres")
  .max(72, "Senha muito longa");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha"),
});
export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome").max(80),
  email: emailSchema,
  password: passwordSchema,
});
export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ password: passwordSchema });

export const onboardingSchema = z.object({
  organizationName: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  projectName: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  timezone: z.string().min(1).default("America/Sao_Paulo"),
});

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

import { AuthForm } from "@/features/auth/auth-form";
import { signup } from "@/features/auth/actions";

export const metadata = { title: "Criar conta" };

export default function SignupPage() {
  return (
    <AuthForm
      title="Criar conta"
      subtitle="Comece a acompanhar seu lucro real."
      action={signup}
      submitLabel="Criar conta"
      fields={[
        { name: "fullName", label: "Nome", autoComplete: "name" },
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        { name: "password", label: "Senha", type: "password", autoComplete: "new-password" },
      ]}
      footer={[{ text: "Já tem conta?", href: "/login", label: "Entrar" }]}
    />
  );
}

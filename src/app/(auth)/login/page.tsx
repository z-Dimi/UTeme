import { AuthForm } from "@/features/auth/auth-form";
import { login } from "@/features/auth/actions";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <AuthForm
      title="Entrar"
      subtitle="Acesse seu painel de performance."
      action={login}
      submitLabel="Entrar"
      fields={[
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        { name: "password", label: "Senha", type: "password", autoComplete: "current-password" },
      ]}
      footer={[
        { text: "Esqueceu a senha?", href: "/forgot-password", label: "Recuperar" },
        { text: "Não tem conta?", href: "/signup", label: "Criar conta" },
      ]}
    />
  );
}

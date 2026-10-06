import { AuthForm } from "@/features/auth/auth-form";
import { forgotPassword } from "@/features/auth/actions";

export const metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <AuthForm
      title="Recuperar senha"
      subtitle="Enviaremos um link para o seu e-mail."
      action={forgotPassword}
      submitLabel="Enviar link"
      fields={[{ name: "email", label: "E-mail", type: "email", autoComplete: "email" }]}
      footer={[{ text: "Lembrou?", href: "/login", label: "Voltar ao login" }]}
    />
  );
}

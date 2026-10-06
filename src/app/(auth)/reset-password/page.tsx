import { AuthForm } from "@/features/auth/auth-form";
import { resetPassword } from "@/features/auth/actions";

export const metadata = { title: "Nova senha" };

export default function ResetPasswordPage() {
  return (
    <AuthForm
      title="Nova senha"
      action={resetPassword}
      submitLabel="Salvar senha"
      fields={[
        { name: "password", label: "Nova senha", type: "password", autoComplete: "new-password" },
      ]}
    />
  );
}

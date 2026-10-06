import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/auth-form";
import { createWorkspace } from "@/features/onboarding/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Primeiros passos" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id").limit(1);
  if (projects && projects.length > 0) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <AuthForm
        title="Crie seu espaço de trabalho"
        subtitle="Uma organização agrupa seus projetos. Cada projeto acompanha uma operação."
        action={createWorkspace}
        submitLabel="Continuar"
        fields={[
          { name: "organizationName", label: "Nome da organização" },
          { name: "projectName", label: "Nome do primeiro projeto" },
        ]}
      />
    </main>
  );
}

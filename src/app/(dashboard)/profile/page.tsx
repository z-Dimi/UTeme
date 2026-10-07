import { ProfileForm } from "@/features/profile/profile-form";
import { getWorkspace } from "@/server/services/workspace";

export const metadata = { title: "Editar perfil" };

export default async function ProfilePage() {
  const { user } = await getWorkspace();
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Editar perfil</h2>
        <p className="text-muted">Sua foto e seu nome aparecem no menu lateral.</p>
      </header>
      <section className="rounded-xl border border-border bg-card p-5">
        <ProfileForm fullName={user.fullName} email={user.email} avatarUrl={user.avatarUrl} />
      </section>
    </div>
  );
}

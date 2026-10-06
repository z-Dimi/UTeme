import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_PROJECT_COOKIE = "active_project";

export type Workspace = {
  user: { id: string; email: string; fullName: string };
  organizations: { id: string; name: string; role: string }[];
  projects: { id: string; name: string; organizationId: string; timezone: string; currency: string }[];
  activeProject: { id: string; name: string; organizationId: string; timezone: string; currency: string };
  activeOrganization: { id: string; name: string; role: string };
};

/**
 * Resolves the signed-in user's workspace. Everything is read through the
 * user-scoped client, so RLS decides what is visible; the cookie is only a
 * preference and is validated against the visible projects.
 */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: members }, { data: projects }, { data: profile }] = await Promise.all([
    supabase.from("organization_members").select("role, organizations(id, name)").eq("user_id", user.id),
    supabase.from("projects").select("id, name, organization_id, timezone, currency").order("created_at"),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  const organizations = (members ?? []).flatMap((m) => {
    const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
    return org ? [{ id: org.id, name: org.name, role: m.role as string }] : [];
  });
  const projectList = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    organizationId: p.organization_id,
    timezone: p.timezone,
    currency: p.currency,
  }));

  if (organizations.length === 0 || projectList.length === 0) redirect("/onboarding");

  const preferred = (await cookies()).get(ACTIVE_PROJECT_COOKIE)?.value;
  const activeProject = projectList.find((p) => p.id === preferred) ?? projectList[0];
  const activeOrganization = organizations.find((o) => o.id === activeProject.organizationId)!;

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      fullName: profile?.full_name ?? user.email ?? "",
    },
    organizations,
    projects: projectList,
    activeProject,
    activeOrganization,
  };
});

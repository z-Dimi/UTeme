"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { updateProfile, type ProfileState } from "./actions";

export function ProfileForm({ fullName, email, avatarUrl }: { fullName: string; email: string; avatarUrl: string | null }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="flex items-center gap-4">
        <Avatar src={preview ?? avatarUrl} size={72} />
        <div className="space-y-1.5">
          <label htmlFor="avatar" className="block text-xs font-medium text-muted">
            Foto de perfil (PNG, JPG ou WebP, até 2 MB)
          </label>
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
            className="block text-xs text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:text-foreground hover:file:border-border-hover"
          />
          {state.fieldErrors?.avatar ? (
            <p role="alert" className="text-xs text-danger">
              {state.fieldErrors.avatar}
            </p>
          ) : null}
          {avatarUrl ? (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="removeAvatar" className="accent-danger" /> Remover foto atual
            </label>
          ) : null}
        </div>
      </div>

      <Field label="Nome" error={state.fieldErrors?.fullName}>
        <Input name="fullName" defaultValue={fullName} required />
      </Field>
      <p className="text-xs text-muted">E-mail: {email}</p>

      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-xs text-success">
          Perfil salvo.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Salvar
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Field, Input } from "@/components/ui/input";
import type { FormState } from "./actions";

type FieldDef = { name: string; label: string; type?: string; autoComplete?: string };

export function AuthForm({
  title,
  subtitle,
  action,
  fields,
  submitLabel,
  footer,
}: {
  title: string;
  subtitle?: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: FieldDef[];
  submitLabel: string;
  footer?: { text: string; href: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div className="w-full max-w-sm space-y-6">
      <Logo height={28} priority className="mb-2" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted">{subtitle}</p> : null}
      </div>

      <form action={formAction} className="space-y-4" noValidate>
        {fields.map((f) => (
          <Field key={f.name} label={f.label} error={state.fieldErrors?.[f.name]}>
            <Input name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} required />
          </Field>
        ))}
        {state.error ? (
          <p role="alert" className="text-xs text-danger">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p role="status" className="text-xs text-success">
            {state.message}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </form>

      {footer?.length ? (
        <div className="space-y-1.5 text-center text-xs text-muted">
          {footer.map((f) => (
            <p key={f.href}>
              {f.text}{" "}
              <Link href={f.href} className="text-info hover:underline">
                {f.label}
              </Link>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

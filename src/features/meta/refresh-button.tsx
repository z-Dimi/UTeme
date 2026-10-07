"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshMeta } from "./actions";

/** White "Atualizar" button placed beside the period filter. The last sync time is its tooltip. */
export function RefreshButton({ lastSyncLabel }: { lastSyncLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="light"
        size="sm"
        disabled={pending}
        title={lastSyncLabel}
        aria-label={`Atualizar dados da Meta. ${lastSyncLabel}`}
        onClick={() =>
          start(async () => {
            const res = await refreshMeta();
            setMessage(res.error ?? null);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
        Atualizar
      </Button>
      {message ? (
        <span role="alert" className="text-xs text-danger">
          {message}
        </span>
      ) : null}
    </div>
  );
}

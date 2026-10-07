"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autoRefreshMeta, refreshMeta } from "./actions";

const AUTO_INTERVAL_MS = 60_000;

/**
 * White "Atualizar" button beside the period filter, plus the automatic refresh: while this page is open
 * and visible, ad spend (and therefore ROAS) is re-synced about once a minute. The server enforces the
 * cooldown, so several tabs or users never multiply the calls to Meta.
 */
export function RefreshButton({ lastSyncLabel }: { lastSyncLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  const auto = useCallback(async () => {
    if (busy.current || document.visibilityState !== "visible") return;
    busy.current = true;
    try {
      const res = await autoRefreshMeta();
      if (res.ok) {
        setMessage(null);
        router.refresh();
      } else if (res.error) {
        setMessage(res.error);
      }
    } catch {
      // network hiccup: the next tick tries again
    } finally {
      busy.current = false;
    }
  }, [router]);

  useEffect(() => {
    const id = setInterval(auto, AUTO_INTERVAL_MS);
    // Coming back to the tab after a while: catch up immediately instead of waiting for the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") void auto();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [auto]);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="light"
        size="sm"
        disabled={pending}
        title={`${lastSyncLabel} · atualiza sozinho a cada minuto`}
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

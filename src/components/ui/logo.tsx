import Image from "next/image";
import { cn } from "@/lib/utils";

const RATIO = 960 / 244;

/** UTeme wordmark (transparent PNG, light gradient: made for the dark theme). `height` is in px. */
export function Logo({ height = 22, className, priority = false }: { height?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/uteme-logo.png"
      alt="UTeme"
      width={Math.round(height * RATIO)}
      height={height}
      priority={priority}
      className={cn("h-auto select-none", className)}
      style={{ height, width: "auto" }}
    />
  );
}

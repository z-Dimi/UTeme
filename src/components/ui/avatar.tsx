import Image from "next/image";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

/** Round white avatar: the user's photo, or a profile icon when none is configured. */
export function Avatar({ src, size = 32, className }: { src: string | null; size?: number; className?: string }) {
  return (
    <span
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-white text-neutral-700", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt="" width={size * 2} height={size * 2} className="h-full w-full object-cover" unoptimized />
      ) : (
        <User style={{ width: size * 0.55, height: size * 0.55 }} aria-hidden />
      )}
    </span>
  );
}

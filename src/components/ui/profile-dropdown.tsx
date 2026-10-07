"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronsUp, CreditCard, FileText, LogOut, Settings, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

export interface ProfileData {
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface MenuItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  external?: boolean;
  /** Small tag on the right. Items with a tag but no href are not available yet. */
  tag?: string;
}

const MENU_ITEMS: MenuItem[] = [
  { label: "Perfil", href: "/profile", icon: <User className="h-4 w-4" aria-hidden /> },
  { label: "Assinatura", icon: <CreditCard className="h-4 w-4" aria-hidden />, tag: "Em breve" },
  { label: "Configurações", href: "/settings", icon: <Settings className="h-4 w-4" aria-hidden /> },
  { label: "Termos e políticas", href: "/politica-privacidade", icon: <FileText className="h-4 w-4" aria-hidden />, external: true },
];

// Clean rows: no borders, only a soft background on hover/focus.
const ITEM =
  "group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-card-hover focus:bg-card-hover";

/** Profile card for the bottom of the sidebar. The menu opens upwards. */
export function ProfileDropdown({ data, className }: { data: ProfileData; className?: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu do perfil"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl border border-border bg-card p-2 text-left transition-colors duration-150 hover:border-border-hover hover:bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            open && "border-border-hover bg-card-hover",
            className,
          )}
        >
          <Avatar src={data.avatarUrl} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight">{data.name}</span>
            {data.avatarUrl ? (
              <span className="block truncate text-[11px] leading-tight text-muted">{data.email}</span>
            ) : (
              <span className="block text-[11px] leading-tight text-info">Editar perfil</span>
            )}
          </span>
          <ChevronsUp
            className={cn("h-4 w-4 shrink-0 text-muted transition-transform duration-200", open ? "text-foreground" : "")}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-xl p-1.5">
        <div className="space-y-0.5">
          {MENU_ITEMS.map((item) =>
            item.href ? (
              <DropdownMenuItem key={item.label} asChild>
                <Link href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} className={ITEM}>
                  {item.icon}
                  <span className="flex-1 whitespace-nowrap">{item.label}</span>
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem key={item.label} disabled className={cn(ITEM, "cursor-not-allowed")}>
                {item.icon}
                <span className="flex-1 whitespace-nowrap">{item.label}</span>
                {item.tag ? <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-muted">{item.tag}</span> : null}
              </DropdownMenuItem>
            ),
          )}
        </div>

        <DropdownMenuSeparator className="my-1" />

        <form action={logout}>
          {/* preventDefault keeps the menu mounted so the form submit is not cancelled by the close. */}
          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <button
              type="submit"
              className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-danger transition-colors hover:bg-danger/10 focus:bg-danger/10"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

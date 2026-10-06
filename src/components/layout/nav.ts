import {
  BarChart3,
  Bell,
  FileText,
  LayoutDashboard,
  Plug,
  Receipt,
  Settings,
  ShoppingCart,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Not implemented yet: rendered disabled with an "Em breve" badge. */
  soon?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Resumo", href: "/", icon: LayoutDashboard },
  { label: "Meta Ads", href: "/meta", icon: BarChart3, soon: true },
  { label: "Vendas", href: "/sales", icon: ShoppingCart },
  { label: "Integrações", href: "/integrations", icon: Plug },
  { label: "Taxas", href: "/fees", icon: Receipt },
  { label: "Despesas", href: "/expenses", icon: Wallet },
  { label: "Relatórios", href: "/reports", icon: FileText },
  { label: "Eventos", href: "/events", icon: Zap },
  { label: "Notificações", href: "/notifications", icon: Bell },
  { label: "Configurações", href: "/settings", icon: Settings },
];

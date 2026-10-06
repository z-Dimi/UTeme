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
  { label: "Despesas", href: "/expenses", icon: Wallet, soon: true },
  { label: "Relatórios", href: "/reports", icon: FileText, soon: true },
  { label: "Eventos", href: "/events", icon: Zap, soon: true },
  { label: "Notificações", href: "/notifications", icon: Bell, soon: true },
  { label: "Configurações", href: "/settings", icon: Settings, soon: true },
];

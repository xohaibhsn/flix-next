import {
  Clapperboard,
  Clock3,
  Headphones,
  Heart,
  Laptop,
  Lock,
  Mail,
  Monitor,
  MonitorSmartphone,
  Play,
  Radio,
  ShieldCheck,
  ShoppingCart,
  SignalHigh,
  Smartphone,
  Tablet,
  Trophy,
  Tv,
  Users,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const ICON_OPTIONS = [
  { name: "Zap", label: "Zap" },
  { name: "ShieldCheck", label: "Shield" },
  { name: "Clock3", label: "Clock" },
  { name: "Radio", label: "Radio" },
  { name: "Clapperboard", label: "Movies" },
  { name: "SignalHigh", label: "Signal" },
  { name: "MonitorSmartphone", label: "Devices" },
  { name: "Headphones", label: "Support" },
  { name: "ShoppingCart", label: "Cart" },
  { name: "Mail", label: "Mail" },
  { name: "Play", label: "Play" },
  { name: "Tv", label: "TV" },
  { name: "Heart", label: "Heart" },
  { name: "Smartphone", label: "Phone" },
  { name: "Tablet", label: "Tablet" },
  { name: "Monitor", label: "Monitor" },
  { name: "Laptop", label: "Laptop" },
  { name: "Lock", label: "Lock" },
  { name: "Trophy", label: "Trophy" },
  { name: "Users", label: "Users" },
  { name: "Wifi", label: "Wifi" },
] as const;

export type IconName = (typeof ICON_OPTIONS)[number]["name"];

const ICON_MAP: Record<IconName, LucideIcon> = {
  Zap,
  ShieldCheck,
  Clock3,
  Radio,
  Clapperboard,
  SignalHigh,
  MonitorSmartphone,
  Headphones,
  ShoppingCart,
  Mail,
  Play,
  Tv,
  Heart,
  Smartphone,
  Tablet,
  Monitor,
  Laptop,
  Lock,
  Trophy,
  Users,
  Wifi,
};

export function isIconName(value: string): value is IconName {
  return value in ICON_MAP;
}

export function getIcon(name: string): LucideIcon {
  if (isIconName(name)) return ICON_MAP[name];
  return Zap;
}

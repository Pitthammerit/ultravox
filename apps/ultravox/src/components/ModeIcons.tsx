import {
  Mail,
  MessageCircle,
  FileText,
  Code,
  Disc,
  Mic,
  Headphones,
  Briefcase,
  GraduationCap,
  Coffee,
  Home,
  BookOpen,
  PenTool,
  ListChecks,
  Hash,
  AtSign,
  Terminal,
  Globe,
  Zap,
  Heart,
  Star,
  Bell,
  Calendar,
  Pencil,
  type LucideIcon,
} from "lucide-react";

/** The curated set of icons users can pick for a mode. Order is the picker order. */
export const MODE_ICONS: Record<string, LucideIcon> = {
  Mail,
  MessageCircle,
  FileText,
  PenTool,
  Pencil,
  BookOpen,
  ListChecks,
  Hash,
  AtSign,
  Code,
  Terminal,
  Globe,
  Mic,
  Headphones,
  Disc,
  Briefcase,
  GraduationCap,
  Coffee,
  Home,
  Calendar,
  Bell,
  Zap,
  Heart,
  Star,
};

export const MODE_ICON_NAMES = Object.keys(MODE_ICONS);

/** Default fallback icon when a mode has no icon set or an unknown name. */
const FallbackIcon = Disc;

/**
 * Render a lucide icon by name. If the name is unknown or missing, falls back
 * to a neutral disc shape.
 */
export function ModeGlyph({
  name,
  size = 16,
  strokeWidth = 1.8,
  className,
  color,
}: {
  name: string | null | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
}) {
  const Icon = (name && MODE_ICONS[name]) || FallbackIcon;
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      color={color}
      aria-hidden
    />
  );
}

import {
  BarChart2, Clock, TrendingUp, Activity, PieChart, Target,
  Calendar, Briefcase, Rocket, Zap, Wrench, Factory,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const ANALYSIS_ICON_NAMES = [
  "bar-chart", "clock", "trending-up", "activity", "pie-chart", "target",
  "calendar", "briefcase", "rocket", "zap", "wrench", "factory",
] as const;

export type AnalysisIconName = (typeof ANALYSIS_ICON_NAMES)[number];

const REGISTRY: Record<AnalysisIconName, LucideIcon> = {
  "bar-chart": BarChart2,
  "clock": Clock,
  "trending-up": TrendingUp,
  "activity": Activity,
  "pie-chart": PieChart,
  "target": Target,
  "calendar": Calendar,
  "briefcase": Briefcase,
  "rocket": Rocket,
  "zap": Zap,
  "wrench": Wrench,
  "factory": Factory,
};

export function getAnalysisIcon(name: string | null | undefined): LucideIcon {
  if (name && (ANALYSIS_ICON_NAMES as readonly string[]).includes(name)) {
    return REGISTRY[name as AnalysisIconName];
  }
  return BarChart2;
}

export function hashToIconName(id: string): AnalysisIconName {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return ANALYSIS_ICON_NAMES[Math.abs(h) % ANALYSIS_ICON_NAMES.length];
}

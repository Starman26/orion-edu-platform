import { supabase } from "../lib/supabaseClient";

// ── Types ──

export interface Automation {
  id: string;
  title: string;
  description: string | null;
  type: string;
  difficulty: string;
  md_content: string | null;
  sort_order: number | null;
  created_by: string | null;
  team_id: string | null;
  created_at: string;
}

export interface UserProgress {
  automation_id: string;
  status: string;
  current_step: number;
  started_at: string | null;
  completed_at: string | null;
  session_id?: string | null;
}

export interface ActivePractice {
  automation: Automation;
  sessionId: string;
}

// ── Helpers ──

export async function loadUserProfile(user: any): Promise<{ name: string; role: string | null; teamId: string | null }> {
  if (!user) return { name: "", role: null, teamId: null };

  let baseName = user.email?.split("@")[0] ?? "";
  let role: string | null = null;
  let teamId: string | null = null;

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, active_team_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileData?.full_name) {
    const parts = profileData.full_name.trim().split(/\s+/);
    baseName = parts[0] || baseName;
  }

  if (profileData?.active_team_id) {
    teamId = profileData.active_team_id;

    const { data: membershipData } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("auth_user_id", user.id)
      .eq("team_id", profileData.active_team_id)
      .maybeSingle();

    if (membershipData?.role) {
      role = membershipData.role;
    }
  }

  return { name: baseName, role, teamId };
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function parseSteps(md: string | null): string[] {
  if (!md) return [];
  const matches = md.match(/^##\s+(?:PASO|STEP|Step)\s+\d+[:\s]*(.*)/gim);
  if (!matches) return [];
  return matches.map(m => m.replace(/^##\s+(?:PASO|STEP|Step)\s+\d+[:\s]*/i, "").trim());
}

export function formatElapsed(startIso: string): string {
  const diff = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

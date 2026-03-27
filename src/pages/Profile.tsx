// src/pages/Profile.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Menu, Camera, Loader2, Save, User, Mail, Building2, GraduationCap, Shield, Award, Zap, Compass, Cpu as CpuIcon, Target, X, ExternalLink, Linkedin } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "../styles/profile-ui.css";

const ROOT_COLLAPSED_CLASS = "cora-sidebar-collapsed";
const LS_KEY = "cora.sidebarCollapsed";

type LearningStyle = "visual" | "auditivo" | "kinestesico" | "mixto";

interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  category: string | null;
  earned_at: string;
}

type ProfileRow = {
  id: string;
  auth_user_id: string;
  email: string | null;
  full_name: string | null;
  career: string | null;
  semester: number | null;
  skills: string[] | null;
  goals: string[] | null;
  interests: string[] | null;
  learning_style: { mode?: LearningStyle } | null;
  last_seen: string | null;
  onboarding_completed: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  active_team_id: string | null;
  learning_profile_text: string | null;
};

const AVATARS_BUCKET = "avatars";

async function loadHeaderProfile(user: any): Promise<{ name: string; role: string | null }> {
  if (!user) return { name: "", role: null };
  let baseName = user.email?.split("@")[0] ?? "";
  let role: string | null = null;

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
    const { data: membershipData } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("auth_user_id", user.id)
      .eq("team_id", profileData.active_team_id)
      .maybeSingle();
    if (membershipData?.role) role = membershipData.role;
  }

  return { name: baseName, role };
}

// ============================================================================
// HEADER
// ============================================================================

interface ProfileHeaderProps {
  userName: string;
  userRole: string;
  userError?: string | null;
}

function ProfileHeader({ userName, userRole, userError }: ProfileHeaderProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (sidebarCollapsed) document.documentElement.classList.add(ROOT_COLLAPSED_CLASS);
    else document.documentElement.classList.remove(ROOT_COLLAPSED_CLASS);
  }, [sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, next ? "1" : "0"); } catch {}
      if (next) document.documentElement.classList.add(ROOT_COLLAPSED_CLASS);
      else document.documentElement.classList.remove(ROOT_COLLAPSED_CLASS);
      window.dispatchEvent(new CustomEvent("cora:sidebar-toggle", { detail: { collapsed: next } }));
      return next;
    });
  }, []);

  const displayName = userName || "User";
  const displayRole = userRole || null;

  return (
    <header className="prof_header">
      <div className="prof_headerLeft">
        <button type="button" onClick={toggleSidebar} className="prof_menuBtn" aria-label="Toggle sidebar">
          <Menu size={18} />
        </button>
        <div className="prof_headerDivider" />
        <div className="prof_userInfo">
          <span className="prof_pageName">My Profile</span>
          <span className="prof_pathSeparator">/</span>
          <span className="prof_userName">{displayName}</span>
          {displayRole && (
            <>
              <span className="prof_userSeparator">/</span>
              <span className="prof_userRole">{displayRole}</span>
            </>
          )}
        </div>
        {userError && <span className="prof_userError">({userError})</span>}
      </div>
      <div className="prof_headerRight">
        <button type="button" className="prof_headerBtn">Feedback</button>
      </div>
    </header>
  );
}

// ============================================================================
// PROFILE PAGE
// ============================================================================

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userLoadError, setUserLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [career, setCareer] = useState("");
  const [semester, setSemester] = useState<number | "">("");
  const [skills, setSkills] = useState("");
  const [goals, setGoals] = useState("");
  const [interests, setInterests] = useState("");
  const [learningStyle, setLearningStyle] = useState<LearningStyle>("visual");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [allBadges, setAllBadges] = useState<{ id: string; name: string; description: string | null; category: string | null }[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<(Badge & { locked?: boolean }) | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (!alive) return;
      if (authErr || !authData?.user) { setUserLoadError("Not authenticated"); setLoading(false); return; }
      const user = authData.user;
      setUserId(user.id);

      try {
        const hp = await loadHeaderProfile(user);
        if (!alive) return;
        setUserName(hp.name);
        setUserRole(hp.role);
        setMemberRole(hp.role);
      } catch { if (alive) setUserLoadError("Error loading profile"); }

      const { data: row, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle<ProfileRow>();

      if (profErr) {
        console.error("Error loading profile:", profErr);
        if (alive) setLoading(false);
        return;
      }

      if (alive && row) {
        setEmail(row.email ?? user.email ?? "");
        setFullName(row.full_name ?? "");
        setCareer(row.career ?? "");
        setSemester(row.semester ?? "");
        setSkills(Array.isArray(row.skills) ? row.skills.join(", ") : "");
        setGoals(Array.isArray(row.goals) ? row.goals.join(", ") : "");
        setInterests(Array.isArray(row.interests) ? row.interests.join(", ") : "");
        setLearningStyle((row.learning_style as any)?.mode ?? "visual");
      } else if (alive) {
        setEmail(user.email ?? "");
      }

      if (alive) setLoading(false);
    };
    load();
    return () => { alive = false; };
  }, []);

  // Fetch badges
  useEffect(() => {
    if (!userId) return;
    let alive = true;

    const loadBadges = async () => {
      // All available badges
      const { data: allData } = await supabase
        .from("badges")
        .select("id, name, description, category")
        .order("created_at");
      if (alive && allData) setAllBadges(allData);

      // User earned badges (join with badges table)
      const { data: earnedData } = await supabase
        .from("user_badges")
        .select("badge_id, earned_at, badges(id, name, description, icon_url, category)")
        .eq("auth_user_id", userId);

      if (alive && earnedData) {
        const mapped: Badge[] = earnedData
          .filter((row: any) => row.badges)
          .map((row: any) => ({
            id: row.badges.id,
            name: row.badges.name,
            description: row.badges.description,
            icon_url: row.badges.icon_url,
            category: row.badges.category,
            earned_at: row.earned_at,
          }));
        setBadges(mapped);
      }
    };

    loadBadges();
    return () => { alive = false; };
  }, [userId]);

  const displayName = fullName?.trim() || email?.split("@")[0] || "";
  const initial = displayName.charAt(0).toUpperCase() || "?";

  const roleLabel = memberRole === "admin_equipos"
    ? "Team Admin"
    : memberRole === "laboratorista"
    ? "Lab Technician"
    : memberRole || "No role assigned";

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true); setSaveSuccess(false);
    const toArray = (s: string) => s ? s.split(",").map((v) => v.trim()).filter(Boolean) : null;

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        career: career || null,
        semester: semester === "" ? null : Number(semester),
        skills: toArray(skills),
        goals: toArray(goals),
        interests: toArray(interests),
        learning_style: { mode: learningStyle },
        updated_at: new Date().toISOString(),
      })
      .eq("auth_user_id", userId);

    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } else {
      console.error("Error saving profile:", error);
    }
    setSaving(false);
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const badgeIcon = (category: string | null, size = 20) => {
    const props = { size, strokeWidth: 1.5 };
    switch (category) {
      case "troubleshooting": return <Zap {...props} />;
      case "milestone": return <Compass {...props} />;
      case "equipment": return <CpuIcon {...props} />;
      case "practice": return <Target {...props} />;
      default: return <Award {...props} />;
    }
  };

  const earnedIds = new Set(badges.map(b => b.id));
  const unearnedBadges = allBadges.filter(b => !earnedIds.has(b.id));

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;
    const file = e.target.files?.[0]; if (!file) return;
    try {
      setUploadingAvatar(true);
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${userId}/${Date.now()}.${ext}`;
      const { error: ue } = await supabase.storage.from(AVATARS_BUCKET).upload(filePath, file, { upsert: true });
      if (ue) { console.error("Upload error:", ue); setUploadingAvatar(false); return; }
      const { data: { publicUrl } } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(filePath);
      setAvatarUrl(publicUrl);
    } finally { setUploadingAvatar(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  return (
    <div className="prof_root">
      <ProfileHeader userName={userName} userRole={userRole || ""} userError={userLoadError} />

      <main className="prof_content">
        {loading ? (
          <div className="prof_loadingWrapper">
            <Loader2 size={18} className="prof_spin" />
            <span>Loading profile...</span>
          </div>
        ) : (
          <div className="prof_layout">

            {/* ── Identity row: avatar + name + role + save ── */}
            <div className="prof_identityRow">
              <div className="prof_identityLeft">
                <div className="prof_avatarWrapper">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="prof_avatarImg" />
                  ) : (
                    <div className="prof_avatarFallback">{initial}</div>
                  )}
                  <button type="button" onClick={handleAvatarClick} disabled={uploadingAvatar} className="prof_avatarBtn">
                    {uploadingAvatar ? <Loader2 size={14} className="prof_spin" /> : <Camera size={14} />}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="prof_hidden" onChange={handleAvatarChange} />
                </div>
                <div className="prof_identityMeta">
                  <h1 className="prof_displayName">{displayName}</h1>
                  <p className="prof_email">{email}</p>
                  <div className="prof_roleBadge"><Shield size={11} /><span>{roleLabel}</span></div>
                </div>
              </div>
              <div className="prof_identityRight">
                {saveSuccess && (
                  <span className="prof_saveSuccess">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    Saved
                  </span>
                )}
                <button type="button" onClick={handleSave} disabled={saving} className="prof_saveBtn">
                  {saving ? <Loader2 size={15} className="prof_spin" /> : <Save size={15} />}
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>

            {/* ── Divider ── */}
            <div className="prof_divider" />

            {/* ── Fields section (flat, no cards) ── */}
            <div className="prof_fieldsSection">

              {/* Row 1: Personal + Academic */}
              <div className="prof_sectionLabel">Personal & Academic</div>
              <div className="prof_fieldsRow prof_fieldsRow--4col">
                <div className="prof_field">
                  <label className="prof_label"><User size={12} /> Full Name</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" className="prof_input" />
                </div>
                <div className="prof_field">
                  <label className="prof_label"><Mail size={12} /> Email</label>
                  <input type="email" value={email} disabled className="prof_input prof_input--disabled" />
                </div>
                <div className="prof_field">
                  <label className="prof_label"><Building2 size={12} /> Career / Program</label>
                  <input type="text" value={career} onChange={(e) => setCareer(e.target.value)} placeholder="e.g. IMT, BME, IMD" className="prof_input" />
                </div>
                <div className="prof_field">
                  <label className="prof_label"><GraduationCap size={12} /> Semester</label>
                  <input type="number" min={1} max={20} value={semester} onChange={(e) => setSemester(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 5" className="prof_input" />
                </div>
              </div>

              {/* Row 2: Skills, Goals, Interests */}
              <div className="prof_sectionLabel">Skills, Goals & Interests</div>
              <div className="prof_fieldsRow prof_fieldsRow--3col">
                <div className="prof_field">
                  <label className="prof_label">Skills</label>
                  <input type="text" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. Python, CAD, Statistics" className="prof_input" />
                </div>
                <div className="prof_field">
                  <label className="prof_label">Goals</label>
                  <input type="text" value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. Graduate with honors" className="prof_input" />
                </div>
                <div className="prof_field">
                  <label className="prof_label">Interests</label>
                  <input type="text" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="e.g. Robotics, AI" className="prof_input" />
                </div>
              </div>

              {/* Row 3: Learning Style */}
              <div className="prof_sectionLabel">Learning Style</div>
              <div className="prof_styleRow">
                {([
                  { value: "visual" as LearningStyle, label: "Visual" },
                  { value: "auditivo" as LearningStyle, label: "Auditory" },
                  { value: "kinestesico" as LearningStyle, label: "Kinesthetic" },
                  { value: "mixto" as LearningStyle, label: "Mixed" },
                ]).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`prof_stylePill ${learningStyle === s.value ? "is-selected" : ""}`}
                    onClick={() => setLearningStyle(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Divider ── */}
            <div className="prof_divider" />

            {/* ── Badges carousel ── */}
            <div className="prof_badgesSection">
              <div className="prof_sectionHeader">
                <div className="prof_sectionLabel">Badges & Certifications</div>
                <span className="prof_badgesCount">
                  {badges.length} / {allBadges.length} earned
                </span>
              </div>

              {allBadges.length === 0 ? (
                <div className="prof_badgesTrack">
                  <div className="prof_badgePlaceholder">
                    <Award size={24} strokeWidth={1.2} />
                    <span>No badges available yet</span>
                    <p>Badges will appear here as they are created</p>
                  </div>
                </div>
              ) : (
                <div className="prof_badgesTrack">
                  {badges.map((badge) => (
                    <button
                      key={badge.id}
                      type="button"
                      className="prof_badgeCard prof_badgeCard--earned"
                      onClick={() => setSelectedBadge(badge)}
                    >
                      <div className="prof_badgeIconWrap prof_badgeIconWrap--earned">
                        {badgeIcon(badge.category, 22)}
                      </div>
                      <span className="prof_badgeName">{badge.name}</span>
                      <span className="prof_badgeDesc">{badge.description}</span>
                      <span className="prof_badgeDate">
                        {new Date(badge.earned_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </button>
                  ))}

                  {unearnedBadges.map((badge) => (
                    <button
                      key={badge.id}
                      type="button"
                      className="prof_badgeCard prof_badgeCard--locked"
                      onClick={() => setSelectedBadge({
                        id: badge.id,
                        name: badge.name,
                        description: badge.description,
                        icon_url: null,
                        category: badge.category,
                        earned_at: "",
                        locked: true,
                      })}
                    >
                      <div className="prof_badgeIconWrap prof_badgeIconWrap--locked">
                        {badgeIcon(badge.category, 22)}
                      </div>
                      <span className="prof_badgeName">{badge.name}</span>
                      <span className="prof_badgeDesc">{badge.description}</span>
                      <span className="prof_badgeLocked">Locked</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Badge detail modal ── */}
            {selectedBadge && (
              <div className="prof_badgeModalOverlay" onClick={() => setSelectedBadge(null)}>
                <div className="prof_badgeModal" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="prof_badgeModalClose" onClick={() => setSelectedBadge(null)}>
                    <X size={16} />
                  </button>

                  <div className={`prof_badgeModalIcon ${selectedBadge.locked ? "prof_badgeModalIcon--locked" : "prof_badgeModalIcon--earned"}`}>
                    {badgeIcon(selectedBadge.category, 32)}
                  </div>

                  <h3 className="prof_badgeModalTitle">{selectedBadge.name}</h3>
                  <p className="prof_badgeModalDesc">{selectedBadge.description}</p>

                  {selectedBadge.category && (
                    <span className="prof_badgeModalCategory">{selectedBadge.category}</span>
                  )}

                  {selectedBadge.locked ? (
                    <div className="prof_badgeModalStatus prof_badgeModalStatus--locked">
                      <span>Not yet earned</span>
                      <p>Complete the required tasks to unlock this badge</p>
                    </div>
                  ) : (
                    <>
                      <div className="prof_badgeModalStatus prof_badgeModalStatus--earned">
                        <span>Earned on {new Date(selectedBadge.earned_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                      </div>

                      <div className="prof_badgeModalActions">
                        <button
                          type="button"
                          className="prof_badgeShareBtn"
                          onClick={() => {
                            const text = `I just earned the "${selectedBadge.name}" badge on ORION Edu Lab Platform! ${selectedBadge.description}`;
                            const url = window.location.origin;
                            window.open(
                              `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${encodeURIComponent(text)}`,
                              "_blank",
                              "width=600,height=500"
                            );
                          }}
                        >
                          <Linkedin size={15} />
                          Share on LinkedIn
                        </button>
                        <button
                          type="button"
                          className="prof_badgeCopyBtn"
                          onClick={() => {
                            const text = `${selectedBadge.name} — ${selectedBadge.description}\nEarned on ${new Date(selectedBadge.earned_at).toLocaleDateString()}`;
                            navigator.clipboard.writeText(text);
                          }}
                        >
                          <ExternalLink size={14} />
                          Copy link
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
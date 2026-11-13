"use client";
// The frame around every page: sidebar (logo, navigation, Chats & tasks, account), top bar (greeting, search, theme, profile).
// Pages without the frame: /login and /auth/callback.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getTheme, setTheme, type Theme } from "@/lib/prefs";
import { Logo } from "./Logo";
import { Icon, type IconName } from "./Icon";
import { SetRow } from "./SetRow";
import { useSets } from "./SetsContext";

const BARE = ["/login", "/auth/callback"];

function NavLink({ href, icon, children, match, onNavigate }: { href: string; icon: IconName; children: React.ReactNode; match?: (p: string) => boolean; onNavigate: () => void }) {
  const p = usePathname();
  const active = match ? match(p) : p === href;
  return (
    <Link href={href} className={`navlink${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      <Icon name={icon} /> <span>{children}</span>
    </Link>
  );
}

function ThemeButton() {
  const [t, setT] = useState<Theme | null>(null);
  useEffect(() => {
    setT(getTheme());
  }, []);
  if (!t) return <span className="icon-btn" aria-hidden="true" style={{ visibility: "hidden" }} />;
  const dark = t === "dark" || (t === "auto" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button className="icon-btn" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => { const n: Theme = dark ? "light" : "dark"; setTheme(n); setT(n); }}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user, configured, signOut } = useAuth();
  const { sets, notice, clearNotice } = useSets();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const bare = BARE.includes(pathname);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (status === "signed_out" && !bare) router.replace("/login");
    if (status === "signed_in" && pathname === "/login") router.replace("/");
  }, [status, bare, pathname, router]);

  if (bare) return <>{children}</>;
  if (status === "loading" || status === "signed_out") {
    return (
      <div className="splash" role="status" aria-live="polite">
        <Logo size={56} />
        <p className="muted">{status === "loading" ? "Loading your modules..." : "Taking you to sign in..."}</p>
      </div>
    );
  }

  const name = user?.name ?? "Student";
  const closeMenu = () => setOpen(false);
  const activeSetId = pathname.startsWith("/set/") ? pathname.split("/")[2] : "";
  const recent = (sets ?? []).slice(0, 8);

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      {open && <div className="scrim" onClick={closeMenu} aria-hidden="true" />}
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Sidebar">
        <div className="side-head">
          <Link href="/" aria-label="StudyIt home" onClick={closeMenu}><Logo /></Link>
          <button className="icon-btn side-close" aria-label="Close menu" onClick={closeMenu}><Icon name="close" /></button>
        </div>

        <Link href="/new" className="btn new-btn" onClick={closeMenu}><Icon name="plus" size={18} /> New module</Link>

        <nav aria-label="Main" className="side-nav">
          <NavLink href="/" icon="home" onNavigate={closeMenu}>Home</NavLink>
          <NavLink href="/chats" icon="chat" onNavigate={closeMenu} match={(p) => p === "/chats" || p.startsWith("/set/") || p === "/new"}>Chats &amp; tasks</NavLink>
          <div className="recent" aria-label="Recent modules">
            {sets === null ? <p className="small muted recent-empty">Loading...</p> : recent.length === 0 ? <p className="small muted recent-empty">No modules yet. Upload one with New module.</p> : recent.map((s) => <SetRow key={s.id} set={s} variant="sidebar" active={s.id === activeSetId} onNavigate={closeMenu} />)}
            {sets !== null && sets.length > recent.length && <Link href="/chats" className="small recent-more" onClick={closeMenu}>See all {sets.length}</Link>}
          </div>
          <NavLink href="/progress" icon="chart" onNavigate={closeMenu}>Progress</NavLink>
          {status === "signed_in" && <NavLink href="/account" icon="user" onNavigate={closeMenu}>Profile</NavLink>}
          <NavLink href="/settings" icon="sliders" onNavigate={closeMenu}>Settings</NavLink>
          <NavLink href="/check" icon="wrench" onNavigate={closeMenu}>Setup check</NavLink>
        </nav>

        <div className="side-foot">
          {status === "signed_in" ? (
            <button className="navlink" onClick={() => void signOut()}><Icon name="logout" /> <span>Log out</span></button>
          ) : (
            <p className="small muted local-note">{configured ? "" : "Accounts are off. Your modules are saved only in this browser."}</p>
          )}
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <p className="greet">Hello, {name}</p>
          <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/chats${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }}>
            <Icon name="search" size={18} />
            <input type="text" aria-label="Search your modules" placeholder="Search your modules" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <ThemeButton />
          {status === "signed_in" && user ? (
            <Link href="/account" className="profile-chip" aria-label="Your profile">
              <span className="avatar" aria-hidden="true">{user.avatarUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : name.slice(0, 1).toUpperCase()}</span>
              <span className="profile-text"><strong>{name}</strong><span className="small muted">{user.email}</span></span>
            </Link>
          ) : null}
        </header>
        {notice && (
          <p className="notice error banner" role="alert">{notice} <button className="btn ghost small" onClick={clearNotice}>Dismiss</button></p>
        )}
        <main id="main" className="content">{children}</main>
        <footer className="foot">
          <p>StudyIt writes only from the material you add. Always check important answers against your module.</p>
        </footer>
      </div>
    </div>
  );
}

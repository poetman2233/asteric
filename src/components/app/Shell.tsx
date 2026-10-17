"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StarMark } from "@/components/ui/Brand";
import { Dialog } from "@/components/ui/Dialog";
import { markActivityReadAction, searchAction, switchOrgAction, type SearchHit } from "@/app/app/actions";
import { logoutAction } from "@/app/(auth)/actions";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { initials } from "@/lib/format";

export type ShellProps = {
  user: { name: string; email: string };
  org: { id: string; name: string; isDemo: boolean };
  role: Role;
  memberships: { orgId: string; name: string; isDemo: boolean; role: string }[];
  watchCount: number;
  canAudit: boolean;
  activity: { id: string; summary: string; at: string; actor: string }[];
  unread: number;
  children: React.ReactNode;
};

type NavItem = { href: string; label: string; icon: IconName; count?: number; badge?: string };

export function Shell(p: ShellProps) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [unread, setUnread] = useState(p.unread);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setNavOpen(false), [pathname]);

  const primary: NavItem[] = [
    { href: "/app", label: "Overview", icon: "overview" },
    { href: "/app/matters", label: "Matters", icon: "matters" },
    { href: "/app/watch", label: "Portfolio Watch", icon: "watch", count: p.watchCount || undefined },
    { href: "/app/predictions", label: "Predictions", icon: "predictions" },
    { href: "/app/imports", label: "Imports", icon: "imports" },
  ];
  const intelligence: NavItem[] = [
    { href: "/app/calibration", label: "Calibration", icon: "calibration" },
    { href: "/app/economics", label: "Economics", icon: "economics" },
    { href: "/app/insights", label: "Insights", icon: "insights" },
    { href: "/app/data-quality", label: "Data quality", icon: "quality" },
    { href: "/app/network", label: "Network", icon: "network", badge: "Preview" },
  ];
  const admin: NavItem[] = [
    ...(p.canAudit ? [{ href: "/app/audit-log", label: "Audit log", icon: "audit" as IconName }] : []),
    { href: "/app/settings/profile", label: "Settings", icon: "settings" },
  ];
  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  const renderNav = (items: NavItem[]) => items.map((n) => (
    <Link key={n.href} href={n.href} className="sb-link" aria-current={isActive(n.href) ? "page" : undefined}>
      <Icon name={n.icon} />
      <span>{n.label}</span>
      {n.count ? <span className="sb-count" aria-label={`${n.count} items`}>{n.count}</span> : null}
      {n.badge ? <span className="badge" style={{ marginLeft: "auto", height: 18, fontSize: 10.5 }}>{n.badge}</span> : null}
    </Link>
  ));

  return (
    <div className="shell" data-nav-open={navOpen}>
      <a className="skip-link" href="#content">Skip to content</a>
      <aside className="sidebar" aria-label="Application">
        <Link href="/app" className="sb-brand" aria-label="Asteric overview"><StarMark size={20} /> Asteric</Link>
        <button type="button" className="sb-org" onClick={() => setOrgOpen(true)} aria-haspopup="dialog">
          <span className="sb-org-name">{p.org.name}</span>
          <span className="sb-org-meta">{ROLE_LABEL[p.role]}{p.memberships.length > 1 ? " · Switch" : ""}</span>
        </button>
        <nav className="sb-nav" aria-label="Primary">{renderNav(primary)}</nav>
        <div className="sb-sep" />
        <p className="eyebrow" style={{ padding: "0 10px 6px" }}>Intelligence</p>
        <nav className="sb-nav" aria-label="Intelligence">{renderNav(intelligence)}</nav>
        <div className="sb-sep" />
        <nav className="sb-nav" aria-label="Administration">{renderNav(admin)}</nav>
        <div className="sb-foot">
          <div className="sb-user">
            <span className="avatar" aria-hidden="true">{initials(p.user.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="sb-user-name">{p.user.name}</div>
              <div className="sb-user-role" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.user.email}</div>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="sb-link" style={{ width: "100%", border: 0, background: "none", cursor: "pointer" }}>
              <Icon name="signout" /> <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="main">
        {p.org.isDemo ? (
          <div className="demo-banner" role="note">
            <Icon name="info" size={14} />
            <span><strong>Illustrative demo organization.</strong> All data is synthetic. Predictions you record here are a sandbox and reset daily.</span>
          </div>
        ) : null}
        <header className="topbar">
          <button type="button" className="icon-btn mobile-nav-toggle" onClick={() => setNavOpen((v) => !v)} aria-label="Open navigation" aria-expanded={navOpen}><Icon name="menu" /></button>
          <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Search matters and actions">
            <Icon name="search" size={15} /> <span>Search matters, attorneys, actions…</span> <span className="kbd" aria-hidden="true">⌘K</span>
          </button>
          <div style={{ marginLeft: "auto" }} className="row">
            <button type="button" className="icon-btn" style={{ position: "relative" }} aria-label={`Activity${unread ? `, ${unread} new` : ""}`}
              onClick={() => { setActivityOpen(true); if (unread) { setUnread(0); void markActivityReadAction(); } }}>
              <Icon name="bell" />
              {unread ? <span aria-hidden="true" style={{ position: "absolute", top: 5, right: 5, width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} /> : null}
            </button>
          </div>
        </header>
        <main className="content" id="content">{p.children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Dialog open={orgOpen} onClose={() => setOrgOpen(false)} title="Organizations" sub="Data is never shared between organizations.">
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }} className="stack-sm">
          {p.memberships.map((m) => (
            <li key={m.orgId}>
              <form action={switchOrgAction.bind(null, m.orgId)}>
                <button type="submit" className="choice" aria-current={m.orgId === p.org.id ? "true" : undefined} style={m.orgId === p.org.id ? { borderColor: "var(--accent)" } : undefined}>
                  <span className="choice-title">{m.name}</span>
                  <span className="help" style={{ display: "block", marginTop: 3 }}>{ROLE_LABEL[m.role as Role] ?? m.role}{m.isDemo ? " · Synthetic demonstration data" : ""}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Dialog>
      <Dialog open={activityOpen} onClose={() => setActivityOpen(false)} variant="drawer" title="Activity" sub={`Recent activity in ${p.org.name}`}>
        {p.activity.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {p.activity.map((a) => (
              <li key={a.id} style={{ padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <div style={{ fontSize: 13 }}>{a.summary}</div>
                <div className="help" style={{ marginTop: 2 }}>{a.actor} · {a.at}</div>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No activity yet.</p>}
      </Dialog>
    </div>
  );
}

type PaletteItem = { key: string; label: string; sub?: string; href: string; group: string };
const ACTIONS: PaletteItem[] = [
  { key: "a-matters", label: "Search matters", href: "/app/matters", group: "Go to" },
  { key: "a-predict", label: "Record prediction", sub: "Choose an open matter", href: "/app/matters?status=open&hint=record", group: "Actions" },
  { key: "a-import", label: "Import data", href: "/app/imports/new", group: "Actions" },
  { key: "a-cal", label: "Open Calibration", href: "/app/calibration", group: "Go to" },
  { key: "a-econ", label: "Open Economics", href: "/app/economics", group: "Go to" },
  { key: "a-ins", label: "Open Insights", href: "/app/insights", group: "Go to" },
  { key: "a-watch", label: "Open Portfolio Watch", href: "/app/watch", group: "Go to" },
  { key: "a-dq", label: "Open Data quality", href: "/app/data-quality", group: "Go to" },
];

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);
  const [, start] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); setQ(""); setHits([]); setSel(0); }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => start(async () => setHits(await searchAction(q))), 160);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo<PaletteItem[]>(() => {
    const ql = q.trim().toLowerCase();
    const acts = ACTIONS.filter((a) => !ql || a.label.toLowerCase().includes(ql));
    return [...hits.map((h) => ({ key: h.id, label: h.name, sub: h.sub, href: `/app/matters/${h.id}`, group: "Matters" })), ...acts];
  }, [hits, q]);
  const go = useCallback((it: PaletteItem | undefined) => { if (!it) return; onClose(); router.push(it.href); }, [onClose, router]);

  return (
    <dialog ref={ref} className="palette" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label="Command palette">
      <input
        className="palette-input" autoFocus placeholder="Search matters by name, ID, attorney, category or referral source…" value={q}
        onChange={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          if (e.key === "Enter") { e.preventDefault(); go(items[sel]); }
        }}
        role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[sel] ? `pi-${items[sel]!.key}` : undefined}
      />
      <ul className="palette-list" id="palette-list" role="listbox">
        {items.length === 0 ? <li className="palette-group">No results</li> : null}
        {items.map((it, i) => (
          <li key={it.key} id={`pi-${it.key}`} role="option" aria-selected={i === sel} className="palette-item" onMouseEnter={() => setSel(i)} onClick={() => go(it)}>
            <span>{it.label}</span>
            <span className="sub">{it.sub ?? it.group}</span>
          </li>
        ))}
      </ul>
    </dialog>
  );
}

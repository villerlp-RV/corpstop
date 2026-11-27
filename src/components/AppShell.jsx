import { Link } from "@tanstack/react-router";
import { CloudOff, LogOut, RefreshCw } from "lucide-react";
import { useOffline } from "@/lib/OfflineQueue";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import { daysToDeadline } from "@/lib/lcri";

const NAV = [
  { to: "/", label: "Portfolio", exact: true },
  { to: "/compliance", label: "Compliance" },
  { to: "/field", label: "Field work" },
  { to: "/notices", label: "Annual notices" },
  { to: "/reports", label: "State reports" },
  { to: "/email", label: "Email", edit: true },
  { to: "/team", label: "Team" },
  { to: "/company", label: "Company" },
];

// App chrome for every signed-in page: brand, deadline countdown, account and section tabs.
export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { loadError, reload, can } = useData();
  const nav = [...NAV.filter((n) => !n.edit || can.edit), ...(can.admin ? [{ to: "/admin", label: "Admin" }] : [])];
  const days = daysToDeadline();
  const { online, summary, syncing } = useOffline();

  return (
    <div className="lcri-app">
      <header className="top">
        <div className="in top-row">
          <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="logo" aria-hidden="true" />
            <b>LineTally</b>
            <span className="muted brand-sub">LCRI operator console</span>
          </Link>
          <span className="clock">
            {days > 0 ? (
              <>
                <b>{days}</b> days to 1 Nov 2027
              </>
            ) : (
              "LCRI compliance date has passed"
            )}
          </span>
          {(!online || summary.total > 0) && (
            <Link to="/field" className={`sync-chip${summary.failed ? " sync-chip--bad" : ""}`}>
              {!online ? <CloudOff size={14} /> : <RefreshCw size={14} className={syncing ? "spin" : undefined} />}
              {!online && "Offline"}
              {!online && summary.total > 0 && " · "}
              {summary.total > 0 && `${summary.total} waiting to upload`}
            </Link>
          )}
          <span className="who">
            {user?.full_name || user?.email}
            <button type="button" className="icon-btn" onClick={() => logout()} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </span>
        </div>
        <nav className="in tabs" aria-label="Sections">
          {nav.map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: !!item.exact }} activeProps={{ className: "active" }}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="in main">
        {loadError && (
          <div className="alert" role="alert">
            Couldn&apos;t load your water systems. Check your connection, then{" "}
            <button type="button" className="linkbtn" onClick={reload}>
              try again
            </button>
            .
          </div>
        )}
        {children}
      </main>
      <footer className="in foot">
        <span>Readiness and targets are planning aids, not compliance advice. Confirm requirements with your state primacy agency.</span>
        <span className="foot-brand">
          LineTally · SKC Software Solutions ·{" "}
          <a href="https://linetally.com/privacy/" target="_blank" rel="noreferrer">Privacy</a> ·{" "}
          <a href="https://linetally.com/terms/" target="_blank" rel="noreferrer">Terms</a> ·{" "}
          <a href="https://linetally.com/support/" target="_blank" rel="noreferrer">Support</a>
        </span>
      </footer>
    </div>
  );
}

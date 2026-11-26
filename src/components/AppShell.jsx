import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import { daysToDeadline } from "@/lib/lcri";

const NAV = [
  { to: "/", label: "Portfolio", exact: true },
  { to: "/field", label: "Field work" },
  { to: "/notices", label: "Annual notices" },
  { to: "/reports", label: "State reports" },
  { to: "/team", label: "Team" },
];

// App chrome for every signed-in page: brand, deadline countdown, account and section tabs.
export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { loadError, reload } = useData();
  const days = daysToDeadline();

  return (
    <div className="lcri-app">
      <header className="top">
        <div className="in top-row">
          <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="logo" aria-hidden="true" />
            <b>Lead Pipe</b>
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
          <span className="who">
            {user?.full_name || user?.email}
            <button type="button" className="icon-btn" onClick={() => logout()} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </span>
        </div>
        <nav className="in tabs" aria-label="Sections">
          {NAV.map((item) => (
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
        Readiness and targets are planning aids, not compliance advice. Confirm requirements with your state primacy agency.
      </footer>
    </div>
  );
}

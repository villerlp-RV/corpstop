import { Link, useRouterState } from "@tanstack/react-router";
import { FileText, LayoutGrid, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";

const LOGO =
  "https://media.base44.com/images/public/6b0891fb0a1bcf3017a35b74/7fae8d6abb71ef953d05db8e186776d0_logo.png";

const NAV = [
  { to: "/", label: "Tracker", icon: LayoutGrid, exact: true },
  { to: "/regulations", label: "Regulations", icon: FileText, exact: false },
];

const navItem =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground";

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isActive = (item) => (item.exact ? pathname === item.to : pathname.startsWith(item.to));

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
        <Link to="/" className="flex items-center gap-2.5 px-2">
          <img src={LOGO} alt="Lead Pipe" className="h-8 w-8 rounded-lg object-cover" />
          <span className="font-heading text-[15px] font-bold tracking-tight text-sidebar-foreground">
            Lead Pipe
          </span>
        </Link>

        <nav className="mt-7 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(navItem, isActive(item) && "bg-sidebar-accent text-sidebar-foreground")}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4">
          <div className="px-2">
            <p className="truncate text-xs font-medium text-sidebar-foreground">
              {user?.full_name || user?.email || "Signed in"}
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/50">{user?.email}</p>
          </div>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur md:hidden">
        <Link to="/" className="flex items-center gap-2">
          <img src={LOGO} alt="Lead Pipe" className="h-7 w-7 rounded-md object-cover" />
          <span className="font-heading text-sm font-bold tracking-tight">Lead Pipe</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground",
                isActive(item) && "bg-secondary font-semibold text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => logout()}
            aria-label="Sign out"
            className="ml-1 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </nav>
      </header>

      <main className="md:pl-60">{children}</main>
    </div>
  );
}
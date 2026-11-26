import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";
import AppShell from "@/components/AppShell";
import { DataProvider } from "@/lib/DataContext";
import { OfflineQueueProvider } from "@/lib/OfflineQueue";

export const Route = createFileRoute("/_authed")({
  ssr: false,
  beforeLoad: requireSignedIn,
  errorComponent: AuthGateError,
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <DataProvider>
      <OfflineQueueProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </OfflineQueueProvider>
    </DataProvider>
  );
}

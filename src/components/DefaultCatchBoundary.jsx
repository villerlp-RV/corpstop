import { useEffect, useState } from "react";
import { ErrorComponent, Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { isStaleBuildError, reloadForNewVersion } from "@/lib/stale-build";

export function DefaultCatchBoundary({ error }) {
  const router = useRouter();
  const isRoot = useMatch({ strict: false, select: (state) => state.id === rootRouteId });
  const stale = isStaleBuildError(error);
  const [reloading, setReloading] = useState(stale);

  // A tab left open across a publish: load the new version instead of erroring.
  useEffect(() => {
    if (stale && !reloadForNewVersion()) setReloading(false);
  }, [stale]);

  if (reloading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-24 text-center">
        <p>LineTally was updated. Loading the new version…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-24">
      {stale ? (
        <p className="text-center">LineTally was updated while this page was open. Reload the page to continue.</p>
      ) : (
        <ErrorComponent error={error} />
      )}
      <div className="flex gap-2">
        {stale ? (
          <Button onClick={() => window.location.reload()}>Reload</Button>
        ) : (
          <Button variant="outline" onClick={() => router.invalidate()}>
            Try again
          </Button>
        )}
        <Button asChild variant={stale ? "outline" : "default"}>{isRoot ? <Link to="/">Home</Link> : <Link to="/" onClick={(e) => { e.preventDefault(); window.history.back(); }}>Go back</Link>}</Button>
      </div>
    </div>
  );
}

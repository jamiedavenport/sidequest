// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useHydrated } from "~/auth/use-hydrated";
import { useState } from "react";
import { revokeConnection } from "~/auth/connections";
import { AuthShell } from "~/auth/components/auth-shell.tsrx";
import { Button } from "~/components/ui/button.tsrx";

export function Component({
  connections,
}: {
  connections: { clientId: string; name: string | null; scopes: ReadonlyArray<string> }[];
}) @{
  const [apps, setApps] = useState(connections);
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function revoke(clientId: string) {
    setBusy(clientId);
    setError(null);
    try {
      await revokeConnection({ data: { clientId } });
      setApps((current) => current.filter((app) => app.clientId !== clientId));
    } catch {
      setError("Could not revoke access. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  <AuthShell title="Connected apps" description={<>Manage apps with access to your tasks.</>}>
    <div className="flex flex-col gap-5">
      @if (apps.length === 0) {
        <p>No connected apps.</p>;
      }
      @for (const app of apps; key app.clientId) {
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="font-medium">{app.name ?? "Unnamed application"}</p>
          <p className="break-all text-xs text-muted-foreground">{app.clientId}</p>
          <p className="text-sm">
            {app.scopes.includes("sidequest:write") ? "Read and write access" : "Read access"}
          </p>
          <Button
            variant="outline"
            disabled={!hydrated || busy !== null}
            onClick={() => {
              void revoke(app.clientId);
            }}
          >
            {busy === app.clientId ? "Revoking…" : "Revoke access"}
          </Button>
        </div>;
      }
      @if (error !== null) {
        <p role="alert" className="text-destructive">
          {error}
        </p>;
      }
      <a href="/" className="text-sm underline">
        Back to your board
      </a>
    </div>
  </AuthShell>;
}

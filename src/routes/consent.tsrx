// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useHydrated } from "~/auth/use-hydrated";
import { useState } from "react";
import { decideConsent } from "~/auth/connections";
import { AuthShell } from "~/auth/components/auth-shell.tsrx";
import { Button } from "~/components/ui/button.tsrx";

export function Component({
  consent,
  oauthQuery,
}: {
  consent: { name: string; clientId: string; scopes: ReadonlyArray<string> };
  oauthQuery: string;
}) @{
  const [write, setWrite] = useState(false);
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      const url = await decideConsent({ data: { oauthQuery, accept, write } });
      window.location.assign(url);
    } catch {
      setError("Could not finish authorization. Try reconnecting from your MCP client.");
      setBusy(false);
    }
  }

  <AuthShell
    title="Connect an app"
    description={<>{consent.name} wants access to your Sidequest tasks.</>}
  >
    <div className="flex flex-col gap-4 text-sm">
      <p className="break-all text-muted-foreground">{consent.clientId}</p>
      <p>This app can read your lanes, tasks, dates, and link attachments.</p>
      @if (consent.scopes.includes("sidequest:write")) {
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            disabled={!hydrated || busy}
            checked={write}
            onChange={(event) => setWrite(event.target.checked)}
          />
          <span>
            Also allow creating, editing, moving, and completing tasks, including descendant
            tasks.
          </span>
        </label>;
      }
      <p>
        Your MCP client controls approval of individual changes. You can revoke access in Connected
        apps.
      </p>
      @if (consent.scopes.includes("offline_access")) {
        <p>Access can continue when you are away using refresh tokens, until revoked.</p>;
      }
      @if (error !== null) {
        <p role="alert" className="text-destructive">
          {error}
        </p>;
      }
      <Button
        disabled={!hydrated || busy || !consent.scopes.includes("sidequest:read")}
        onClick={() => {
          void decide(true);
        }}
      >
        Allow access
      </Button>
      <Button
        variant="outline"
        disabled={!hydrated || busy}
        onClick={() => {
          void decide(false);
        }}
      >
        Deny
      </Button>
    </div>
  </AuthShell>;
}

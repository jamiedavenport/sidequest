// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { Effect } from "effect";
import { Link } from "@tanstack/react-router";
import { AuthShell } from "~/auth/components/auth-shell.tsrx";
import { Route } from "~/routes/settings";
import { Button } from "~/components/ui/button.tsrx";
import { Field, FieldLabel, FieldDescription } from "~/components/ui/field.tsrx";
import { Switch } from "~/components/ui/switch.tsrx";
import { useCalendarSettings } from "~/google/use-settings";

export function Component() @{
  const session = Route.useLoaderData();
  const { settings, pending, error, changeEnabled } = useCalendarSettings(session.user.id);

  <AuthShell title="Settings" description="Connect your tasks to Google Calendar.">
    <div className="flex flex-col gap-5" aria-busy={pending}>
      <Field>
        <div className="flex items-center justify-between gap-4">
          <FieldLabel htmlFor="calendar-sync">Calendar sync</FieldLabel>
          <Switch
            id="calendar-sync"
            aria-describedby="calendar-description"
            checked={settings?.enabled ?? false}
            disabled={pending || !settings?.available}
            onCheckedChange={(enabled) => {
              void Effect.runPromise(changeEnabled(enabled));
            }}
          />
        </div>
        <FieldDescription id="calendar-description">
          Add dated tasks to a dedicated Sidequest calendar, grouped by day. Completed tasks stay
          listed. Turning sync off deletes this calendar and its events.
        </FieldDescription>
      </Field>
      @if (pending) {
        <output className="text-sm text-muted-foreground">
          Updating Calendar settings…
        </output>;
      }
      @if (settings && !settings.available) {
        <p className="text-sm text-muted-foreground">
          Google Calendar is not configured yet.
        </p>;
      }
      @if (error) {
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>;
      }
      @if (
        settings?.error ||
        (settings?.enabled && !settings.authorized)
      ) {
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            void Effect.runPromise(
              changeEnabled(true, settings?.error?.reconnect || !settings?.authorized),
            );
          }}
        >
          {settings?.error?.reconnect || !settings?.authorized
            ? "Reconnect Google"
            : "Retry sync"}
        </Button>;
      }
      <Link to="/" className="text-sm underline">
        Back to your board
      </Link>
    </div>
  </AuthShell>;
}

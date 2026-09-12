import type { CalendarSettings } from "~/google/schema";
import type { Lane } from "~/board/schema";
import { isSystemLane } from "~/board/views";
import type { CommandResult, SettingAction } from "./results";

function setting(action: SettingAction, label: string, description?: string): CommandResult {
  return { id: `setting:${action}`, label, description, target: { kind: "setting", action } };
}

export function getSettingsActions(
  lane: Lane | undefined,
  githubConnected: boolean,
  calendar: CalendarSettings | null,
): CommandResult[] {
  const results: CommandResult[] = [];
  if (lane && !isSystemLane(lane)) {
    results.push({
      id: `github:${lane.id}`,
      label: githubConnected ? "Manage GitHub connection" : "Connect GitHub",
      description: lane.title,
      target: { kind: "lane", viewId: lane.id, action: "github" },
    });
  }
  if (calendar?.available) {
    results.push(...getCalendarActions(calendar));
  }
  results.push(setting("settings", "Open Settings"));
  return results;
}

function getCalendarActions(calendar: CalendarSettings): CommandResult[] {
  const results: CommandResult[] = [];
  if (!calendar.authorized) {
    const reconnect = calendar.enabled || calendar.error?.reconnect;
    results.push(
      setting(
        reconnect ? "reconnect-google" : "connect-google",
        reconnect ? "Reconnect Google" : "Connect Google",
      ),
    );
  } else if (calendar.error?.reconnect) {
    results.push(setting("reconnect-google", "Reconnect Google"));
  } else if (calendar.error) {
    results.push(setting("retry-calendar", "Retry Calendar sync"));
  }
  if (calendar.enabled) {
    results.push(
      setting(
        "disable-calendar",
        "Disable Calendar Sync",
        "Deletes the Sidequest calendar and its events.",
      ),
    );
  } else if (calendar.authorized) {
    results.push(setting("enable-calendar", "Enable Calendar Sync"));
  }
  return results;
}

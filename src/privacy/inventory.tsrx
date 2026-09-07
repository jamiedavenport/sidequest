// Scrollable tables must be keyboard focusable.
// oxlint-disable jsx-a11y/no-noninteractive-tabindex
const storage = [
  [
    "better-auth.session_token (prefixed __Secure- on HTTPS)",
    "Sidequest / Better Auth",
    "HTTP-only cookie",
    "Authenticate your session",
    "7 days; renewed during active use. Removed on sign-out.",
  ],
  [
    "better-auth.session_token.oauth_logout_confirmation (HTTPS: __Secure- prefix)",
    "Sidequest / Better Auth OAuth provider",
    "HTTP-only cookie",
    "Confirm an OAuth client’s sign-out request, when this flow is used",
    "5 minutes, or removed when the confirmation is consumed.",
  ],
  [
    "sidequest-board-<account ID>.sqlite, WAL/journal files and OPFS access-handle pool",
    "Sidequest",
    "SQLite in browser OPFS",
    "Keep board content available locally and synchronise edits",
    "No automatic expiry. Until browser site data is cleared or evicted; signing out does not erase it.",
  ],
  [
    "offline-transactions / transactions",
    "Sidequest",
    "IndexedDB",
    "Persist pending offline edits",
    "Pending entries remain until successfully synchronised or removed; browser data can also be cleared or evicted.",
  ],
  [
    "offline-tx:* (fallback)",
    "Sidequest",
    "localStorage",
    "Persist pending edits when IndexedDB is unavailable",
    "Same lifecycle as the offline outbox; no time-based expiry.",
  ],
  [
    "TLDRAW_USER_DATA_v3 (when whiteboard preferences are saved)",
    "Sidequest / tldraw",
    "localStorage",
    "Remember whiteboard editor preferences and a local editor identifier",
    "No automatic expiry; until browser site data is cleared or evicted.",
  ],
  [
    "sidequest-consent",
    "Sidequest",
    "localStorage",
    "Remember necessary-storage and analytics choices",
    "Valid for 180 days (six months), or until a relevant policy change. The record remains until replaced or site data is cleared.",
  ],
  [
    "OpenPanel event processing",
    "OpenPanel",
    "Network requests and in-memory SDK state",
    "Optional page analytics",
    "No analytics cookies or persistent identifiers are written by this integration. No new events are created after withdrawal. Requests already underway, including SDK retries, may complete. Provider-side retention is separate from browser storage.",
  ],
];

const headings = ["Name", "Provider", "Technology", "Purpose", "Duration"];

export function StorageInventory() @{
  <section id="storage-inventory" className="space-y-4">
    <h2 className="text-xl font-semibold tracking-tight">
      Cookies and browser storage in Sidequest
    </h2>
    <p className="text-sm/7 text-muted-foreground">
      Necessary storage is used to provide the features you request. Analytics is optional for every
      visitor. Cookie settings lets you change your choice at any time. Clearing site data also
      removes local content and may lose edits that have not synchronised.
    </p>
    <section
      className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-4"
      aria-label="Storage inventory"
      tabIndex={0}
    >
      <table className="w-full min-w-3xl border-collapse text-left text-sm/6">
        <caption className="sr-only">
          Storage names, providers, technologies, purposes and durations
        </caption>
        <thead>
          <tr className="bg-muted/50">
            {headings.map((heading) => @{
              <th key={heading} scope="col" className="px-4 py-3 align-top font-medium">
                {heading}
              </th>;
            })}
          </tr>
        </thead>
        <tbody>
          {storage.map((row) => @{
            <tr key={row[0]} className="border-t border-border">
              {row.map((cell) => @{
                <td key={cell} className="px-4 py-3 align-top text-muted-foreground">
                  {cell}
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
    </section>
    <p className="text-sm/7 text-muted-foreground">
      External font requests to rsms.me and whiteboard asset requests to cdn.tldraw.com disclose
      network and browser information. Polar’s hosted checkout and apps you authorise operate their
      own services and may use storage covered by their policies.
    </p>
  </section>;
}

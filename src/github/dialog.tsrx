// oxlint-disable react-perf/jsx-no-new-function-as-prop
import {
  QueryClient,
  QueryClientProvider,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNetworkState } from "@uidotdev/usehooks";
import { useEffect, useState } from "react";
import { Effect } from "effect";
import { fromGithubPromise, GitHubError } from "./schema";
import { authClient } from "~/auth/client";
import { useLaneChrome } from "~/board/components/lane-chrome.tsrx";
import type { BoardLane } from "~/board/types";
import { Badge } from "~/components/ui/badge.tsrx";
import { Button } from "~/components/ui/button.tsrx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog.tsrx";
import { GitHubSyncConfiguration } from "./sync-configuration.tsrx";
import { GitHubIcon } from "./icon.tsrx";
import { disconnectGithubLane, getGithubStatus, syncGithubNow } from "./functions";

const connectGithubAccount = Effect.fn("connectGithubAccount")(function* () {
  const result = yield* fromGithubPromise(() =>
    authClient.linkSocial({
      provider: "github",
      callbackURL: "/",
      errorCallbackURL: "/",
    }),
  );
  if (result.error) {
    return yield* new GitHubError({ message: "Could not connect GitHub. Please try again." });
  }
});

type GitHubSettingsProps = {
  laneId: string;
  laneTitle: string;
};

function GitHubSettingsForm({ laneId, laneTitle }: GitHubSettingsProps) @{
  const queryClient = useQueryClient();
  const { online } = useNetworkState();
  const [authorizationFailed, setAuthorizationFailed] = useState(() =>
    new URLSearchParams(window.location.search).has("error"),
  );
  const statusKey = ["github", "status", laneId];
  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => getGithubStatus({ data: { laneId } }),
  });
  const githubStatus = status.data;
  const connected = githubStatus?.status;
  const connect = useMutation({
    mutationFn: () => Effect.runPromise(connectGithubAccount()),
    onMutate: () => setAuthorizationFailed(false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statusKey }),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectGithubLane({ data: { laneId } }),
    onSuccess: async () => {
      queryClient.setQueryData(statusKey, (current: typeof githubStatus) =>
        current ? { ...current, status: null } : current,
      );
      await queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });
  const sync = useMutation({
    mutationFn: () => syncGithubNow({ data: { laneId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statusKey }),
  });
  const isBusy = useIsMutating() > 0;
  const mutationError = connect.error ?? disconnect.error ?? sync.error;

  async function onSaved() {
    await queryClient.invalidateQueries({ queryKey: statusKey });
    disconnect.reset();
  }

  <div className="flex flex-col gap-4 text-sm">
    <DialogHeader className="flex-row items-center justify-between gap-3">
      <DialogTitle className="flex min-w-0 items-center gap-2 text-lg font-medium">
        <GitHubIcon className="size-5 shrink-0" />
        <span className="truncate">{`GitHub · ${laneTitle}`}</span>
      </DialogTitle>
      @if (connected) {
        <Badge variant="default" className="text-xs">
          Connected
        </Badge>;
      }
    </DialogHeader>
    <DialogDescription className="sr-only">Import GitHub issues into this lane.</DialogDescription>
    @if (!online || status.isPaused) {
      <output>Connect to the internet to configure GitHub.</output>;
    }
    @if (status.isError) {
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-destructive">
          {status.error.message}
        </p>
        <Button
          variant="outline"
          disabled={!online || status.isFetching}
          onClick={() => status.refetch()}
        >
          {status.isFetching ? "Retrying…" : "Retry loading settings"}
        </Button>
      </div>;
    }
    @if (authorizationFailed || mutationError) {
      <p role="alert" className="text-destructive">
        {mutationError?.message ??
          "GitHub authorization was cancelled or failed. Connect your account again to continue."}
      </p>;
    }
    @if (status.isPending) {
      @if (online && !status.isPaused) {
        <output>Loading GitHub settings…</output>;
      }
    } @else if (githubStatus && !githubStatus.enabled) {
      <p>GitHub integration has not been configured for this environment.</p>;
    } @else if (githubStatus?.enabled && !connected) {
      @if (!githubStatus.linked) {
        <>
          <div className="space-y-1">
            <h3 className="font-medium">Connect GitHub</h3>
            <p className="text-muted-foreground">
              Connect your account to start importing issues. You’ll choose a repository next.
            </p>
          </div>
          <Button disabled={!online || connect.isPending} onClick={() => connect.mutate()}>
            <GitHubIcon />
            {connect.isPending ? "Connecting…" : "Connect GitHub account"}
          </Button>
        </>;
      } @else {
        <GitHubSyncConfiguration
          laneId={laneId}
          installUrl={githubStatus.installUrl}
          online={online && !isBusy}
          onSaved={onSaved}
        />;
      }
    }
    @if (connected) {
      <div className="flex flex-col items-start gap-2">
        <p className="break-all">{connected.repository}</p>
        <Button disabled={!online || isBusy} onClick={() => sync.mutate()}>
          {sync.isPending ? "Importing…" : "Sync now"}
        </Button>
        <p className="text-muted-foreground">
          Use Sync now to retry missing imports. If an issue fails to close, close it on
          GitHub or complete the task again.
        </p>
      </div>;
    }
    <DialogFooter className="flex-row justify-end" showCloseButton>
      @if (connected) {
        <Button
          variant="outline"
          disabled={!online || isBusy}
          onClick={() => disconnect.mutate()}
        >
          {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
        </Button>;
      }
    </DialogFooter>
  </div>;
}

function GitHubSettings(props: GitHubSettingsProps) @{
  // Scope cached account data to this open lane dialog, including across sign-outs.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1 } },
      }),
  );

  <QueryClientProvider client={queryClient}>
    <GitHubSettingsForm {...props} />
  </QueryClientProvider>;
}

export function GitHubDialog({ lanes }: { lanes: ReadonlyArray<BoardLane> }) @{
  const { githubLaneId, closeGithubSettings } = useLaneChrome();
  const lane = lanes.find((candidate) => candidate.id === githubLaneId);
  useEffect(() => {
    if (githubLaneId !== null && lane === undefined) {
      closeGithubSettings();
    }
  }, [githubLaneId, lane, closeGithubSettings]);
  <Dialog
    open={lane !== undefined}
    onOpenChange={(open) => {
      if (!open) {
        closeGithubSettings();
      }
    }}
  >
    <DialogContent
      className="max-h-[90dvh] overflow-auto p-6 shadow-lg sm:max-w-lg"
      showCloseButton={false}
    >
      @if (lane) {
        <GitHubSettings key={lane.id} laneId={lane.id} laneTitle={lane.title} />;
      }
    </DialogContent>
  </Dialog>;
}

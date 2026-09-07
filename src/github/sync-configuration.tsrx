// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { skipToken, useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button.tsrx";
import { Checkbox } from "~/components/ui/checkbox.tsrx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select.tsrx";
import { Label } from "~/components/ui/label.tsrx";
import { Switch } from "~/components/ui/switch.tsrx";
import type { GitHubSettings } from "./schema";
import { getGithubLabels, getGithubRepos, saveGithubSettings } from "./functions";

export function GitHubSyncConfiguration({
  laneId,
  installUrl,
  online,
  onSaved,
}: {
  laneId: string;
  installUrl: string | null;
  online: boolean;
  onSaved: () => Promise<void>;
}) @{
  const [repositoryId, setRepositoryId] = useState(0);
  const [labels, setLabels] = useState<string[]>([]);
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const repositories = useQuery({
    queryKey: ["github", "repositories"],
    queryFn: () => getGithubRepos(),
  });
  const repositoryItems = useMemo(
    () =>
      (repositories.data ?? []).map((repository) => ({
        value: repository.id,
        label: repository.name,
      })),
    [repositories.data],
  );
  const selectedRepo = repositories.data?.find((repo) => repo.id === repositoryId);
  const installationId = selectedRepo?.installationId;
  const availableLabels = useQuery({
    queryKey: ["github", "labels", installationId, repositoryId],
    queryFn:
      installationId && repositoryId
        ? () => getGithubLabels({ data: { repositoryId, installationId } })
        : skipToken,
  });
  const save = useMutation({
    mutationFn: (settings: GitHubSettings) => saveGithubSettings({ data: settings }),
    onSuccess: onSaved,
  });
  const disabled = !online || save.isPending;

  <div className="flex flex-col gap-4">
    <div className="space-y-1">
      <h3 className="font-medium">Configure sync</h3>
      <p className="text-muted-foreground">Choose which GitHub issues to import into this lane.</p>
    </div>
    @if (repositories.isPending) {
      <output>
        {repositories.isPaused
          ? "Repositories will load when you’re online."
          : "Loading repositories…"}
      </output>;
    } @else if (repositories.isError) {
      <p role="alert" className="text-destructive">
        {repositories.error.message}
      </p>;
    } @else if (repositories.data.length === 0) {
      <p className="text-muted-foreground">
        Grant the Sidequest GitHub App access to a repository to continue. Organization access
        may need an owner’s approval, and you need permission to manage issues.
      </p>;
    }
    <div className="space-y-2">
      <Label htmlFor="github-repository">Repository</Label>
      <div className="flex items-center gap-2">
        <Select
          items={repositoryItems}
          value={repositoryId || null}
          disabled={disabled || repositoryItems.length === 0}
          onValueChange={(value) => {
            setRepositoryId(value ?? 0);
            setLabels([]);
            save.reset();
          }}
        >
          <SelectTrigger id="github-repository" className="min-w-0 flex-1">
            <SelectValue placeholder="Choose a repository" className="min-w-0 truncate" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              @for (const repository of repositoryItems; key repository.value) {
                <SelectItem value={repository.value}>{repository.label}</SelectItem>;
              }
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh repositories"
          title="Refresh repositories"
          disabled={disabled || repositories.isFetching}
          onClick={() => repositories.refetch()}
        >
          <RefreshCwIcon
            className={repositories.isFetching ? "motion-safe:animate-spin" : undefined}
          />
        </Button>
      </div>
    </div>
    @if (installUrl) {
      <a
        className="self-start underline underline-offset-4"
        href={!disabled ? installUrl : undefined}
        aria-disabled={disabled}
      >
        Manage repository access
      </a>;
    }
    @if (selectedRepo) {
      <>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="github-assigned">Only assigned to me</Label>
          <Switch
            id="github-assigned"
            checked={onlyAssigned}
            onCheckedChange={setOnlyAssigned}
            disabled={disabled}
          />
        </div>
        <GithubLabelPicker
          labels={labels}
          onChange={setLabels}
          availableLabels={availableLabels}
          disabled={disabled}
        />
        <p className="text-muted-foreground">
          {labels.length > 0
            ? "Issues must match all selected labels."
            : "All labels are included."}{" "}
          Filters only affect new imports. Completing a linked task closes its GitHub issue.
        </p>
        @if (save.isError) {
          <p role="alert" className="text-destructive">
            {save.error.message}
          </p>;
        }
        <Button
          disabled={disabled || availableLabels.isPending || availableLabels.isError}
          onClick={() =>
            save.mutate({
              laneId,
              repositoryId: selectedRepo.id,
              installationId: selectedRepo.installationId,
              onlyAssigned,
              labels,
            })
          }
        >
          {save.isPending ? "Saving…" : "Save and import"}
        </Button>
      </>;
    }
  </div>;
}

function GithubLabelPicker({
  labels,
  onChange,
  availableLabels,
  disabled,
}: {
  labels: string[];
  onChange: (labels: string[]) => void;
  availableLabels: UseQueryResult<string[]>;
  disabled: boolean;
}) @{
  <fieldset className="min-w-0" disabled={disabled}>
    <legend className="mb-2 font-medium">Labels</legend>
    <div className="flex max-h-44 flex-col gap-3 overflow-y-auto overscroll-contain rounded-md border border-input bg-muted/30 p-3">
      @if (availableLabels.isPending) {
        <output>
          {availableLabels.isPaused
            ? "Labels will load when you’re online."
            : "Loading labels…"}
        </output>;
      } @else if (availableLabels.isError) {
        <>
          <p role="alert" className="text-destructive">
            {availableLabels.error.message}
          </p>
          <Button
            variant="outline"
            disabled={disabled || availableLabels.isFetching}
            onClick={() => availableLabels.refetch()}
          >
            {availableLabels.isFetching ? "Retrying…" : "Retry loading labels"}
          </Button>
        </>;
      }
      @for (const label of [
          ...new Set([...(availableLabels.data ?? []), ...labels]),
        ]; key label) {
        <label className="flex items-center gap-2">
          <Checkbox
            checked={labels.includes(label)}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(checked ? [...labels, label] : labels.filter((item) => item !== label))
            }
          />
          <span className="min-w-0 break-words">{label}</span>
        </label>;
      }
      @if (
        availableLabels.isSuccess &&
        availableLabels.data.length === 0 &&
        labels.length === 0
      ) {
        <p className="text-muted-foreground">This repository has no labels.</p>;
      }
    </div>
  </fieldset>;
}

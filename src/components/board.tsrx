import { lanes } from "~/components/board/data";
import { ShortcutFooter } from "~/components/board/footer.tsrx";
import { AppHeader } from "~/components/board/header.tsrx";
import { AddLaneButton, TaskLane } from "~/components/board/lane.tsrx";

export function TaskBoard() @{
  <main className="isolate grid h-dvh min-w-80 grid-rows-[3.5rem_minmax(0,1fr)] overflow-hidden bg-background sm:grid-rows-[3.375rem_minmax(0,1fr)_2.375rem]">
    <h1 className="sr-only">Sidequest task board</h1>
    <AppHeader />
    <section className="min-h-0 min-w-0 overflow-hidden" aria-label="Task lanes">
      <div className="flex h-full min-w-0 gap-3 overflow-x-auto overflow-y-hidden px-3 pb-4 sm:gap-0 sm:px-0 sm:pb-0">
        @for (const lane of lanes; key lane.id) {
          <TaskLane lane={lane} />;
        }
        <AddLaneButton />
      </div>
    </section>
    <ShortcutFooter />
  </main>;
}

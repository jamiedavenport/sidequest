import { TaskBoard } from "~/board/components/board.tsrx";

export function Component({ userId }: { userId: string }) @{
  <TaskBoard userId={userId} />;
}

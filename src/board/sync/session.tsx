import { useEffect, useState, type ReactNode } from "react";

import { acquireBoardClient, BoardClientProvider } from "~/board/sync/client";
import type { BoardClient } from "~/board/sync/client";

export function BoardSession({ children, userId }: { children: ReactNode; userId: string }) {
  const [client, setClient] = useState<BoardClient | null>(null);

  useEffect(() => {
    let closed = false;

    setClient(null);
    void acquireBoardClient(userId).then(
      (next) => {
        if (!closed) {
          setClient(next);
        }
      },
      (error: unknown) => {
        console.error("Failed to start the board client", error);
      },
    );

    return () => {
      closed = true;
    };
  }, [userId]);

  return <BoardClientProvider value={client}>{children}</BoardClientProvider>;
}

import { useEffect, useState, type ReactNode } from "react";

import { acquireBoardClient, BoardClientProvider } from "~/board/sync/client";
import type { BoardClient } from "~/board/sync/client";

export function BoardSession({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<BoardClient | null>(null);

  useEffect(() => {
    let closed = false;

    void acquireBoardClient().then(
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
  }, []);

  return <BoardClientProvider value={client}>{children}</BoardClientProvider>;
}

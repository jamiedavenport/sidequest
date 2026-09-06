import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

const clientSnapshot = () => true;

const serverSnapshot = () => false;

/** Keep sensitive actions disabled until React can handle the user's choice. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

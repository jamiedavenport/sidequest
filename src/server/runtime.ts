import { Layer, Logger, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

const ServerLayer = Layer.mergeAll(FetchHttpClient.layer, Logger.layer([Logger.consoleJson]));

export const serverRuntime = ManagedRuntime.make(ServerLayer);

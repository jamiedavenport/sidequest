import { getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/");

export function Component() @{
  const { status } = routeApi.useLoaderData();

  <main className="welcome">
    <div className="mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
    <p className="eyebrow">Local-first task management</p>
    <h1>Sidequest</h1>
    <p className="description">Sidequest is a task management tool for your projects.</p>
    <p className="status">{status}</p>
  </main>;
}

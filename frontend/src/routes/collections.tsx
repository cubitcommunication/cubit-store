import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for /collections and the parent category pages beneath it. Children
 * render here; the /collections page itself lives in collections.index.tsx.
 */
export const Route = createFileRoute("/collections")({
  component: () => <Outlet />,
});

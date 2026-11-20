import { createFileRoute, redirect } from "@tanstack/react-router";

// The old "Website content" hub is gone: its pages now live under Online store and Settings.
export const Route = createFileRoute("/admin/website-content/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard" });
  },
});

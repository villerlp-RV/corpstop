import { createFileRoute } from "@tanstack/react-router";
import Reports from "@/components/lcri/Reports";

export const Route = createFileRoute("/_authed/reports")({
  head: () => ({ meta: [{ title: "State reports — LineTally" }] }),
  component: Reports,
});

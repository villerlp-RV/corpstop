import { createFileRoute } from "@tanstack/react-router";
import Admin from "@/components/lcri/Admin";

export const Route = createFileRoute("/_authed/admin")({
  head: () => ({ meta: [{ title: "Admin — LineTally" }] }),
  component: Admin,
});

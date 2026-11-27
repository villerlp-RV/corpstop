import { createFileRoute } from "@tanstack/react-router";
import Email from "@/components/lcri/Email";

export const Route = createFileRoute("/_authed/email")({
  head: () => ({ meta: [{ title: "Email — LineTally" }] }),
  component: Email,
});

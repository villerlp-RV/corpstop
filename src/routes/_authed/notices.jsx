import { createFileRoute } from "@tanstack/react-router";
import Notices from "@/components/lcri/Notices";

export const Route = createFileRoute("/_authed/notices")({
  head: () => ({ meta: [{ title: "Annual notices — Lead Pipe" }] }),
  component: Notices,
});

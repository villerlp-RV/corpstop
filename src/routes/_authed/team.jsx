import { createFileRoute } from "@tanstack/react-router";
import Team from "@/components/lcri/Team";

export const Route = createFileRoute("/_authed/team")({
  head: () => ({ meta: [{ title: "Team — Lead Pipe" }] }),
  component: Team,
});

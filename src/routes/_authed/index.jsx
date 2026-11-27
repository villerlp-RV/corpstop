import { createFileRoute } from "@tanstack/react-router";
import Portfolio from "@/components/lcri/Portfolio";

export const Route = createFileRoute("/_authed/")({
  head: () => ({ meta: [{ title: "Portfolio — Linetally" }] }),
  component: Portfolio,
});

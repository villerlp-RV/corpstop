import { createFileRoute } from "@tanstack/react-router";
import Compliance from "@/components/lcri/Compliance";

export const Route = createFileRoute("/_authed/compliance")({
  head: () => ({ meta: [{ title: "Compliance — LineTally" }] }),
  component: Compliance,
});

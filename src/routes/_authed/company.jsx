import { createFileRoute } from "@tanstack/react-router";
import Company from "@/components/lcri/Company";

export const Route = createFileRoute("/_authed/company")({
  head: () => ({ meta: [{ title: "Company — LineTally" }] }),
  component: Company,
});

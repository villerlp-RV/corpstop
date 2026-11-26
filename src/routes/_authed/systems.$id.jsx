import { createFileRoute } from "@tanstack/react-router";
import SystemDetail from "@/components/lcri/SystemDetail";

export const Route = createFileRoute("/_authed/systems/$id")({
  head: () => ({ meta: [{ title: "Water system — Lead Pipe" }] }),
  component: SystemPage,
});

function SystemPage() {
  const { id } = Route.useParams();
  return <SystemDetail id={id} />;
}

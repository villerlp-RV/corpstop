import { createFileRoute } from "@tanstack/react-router";
import FieldWork from "@/components/lcri/FieldWork";

export const Route = createFileRoute("/_authed/field")({
  head: () => ({ meta: [{ title: "Field work — LineTally" }] }),
  component: FieldWork,
});

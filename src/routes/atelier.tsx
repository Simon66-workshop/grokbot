import { createFileRoute } from "@tanstack/react-router";
import { Atelier } from "@/components/atelier/Atelier";

export const Route = createFileRoute("/atelier")({ component: AtelierPage });

function AtelierPage() {
  return <Atelier />;
}

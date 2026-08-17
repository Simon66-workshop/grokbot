import { createFileRoute } from "@tanstack/react-router";
import { Desktop } from "@/components/desktop/Desktop";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Desktop />;
}

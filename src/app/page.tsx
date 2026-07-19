import { AppShell } from "@/components/app-shell";
import { getConditions } from "@/lib/conditions";

export default function Home() {
  return <AppShell initialData={getConditions()} />;
}


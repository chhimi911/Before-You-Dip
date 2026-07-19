import { AppShell } from "@/components/app-shell";
import { getLiveConditions } from "@/lib/live-conditions";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <AppShell initialData={await getLiveConditions()} />;
}

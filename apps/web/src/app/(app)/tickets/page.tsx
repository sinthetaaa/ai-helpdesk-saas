import { Suspense } from "react";
import TicketsClient from "./tickets-client";

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading tickets…</div>}>
      <TicketsClient />
    </Suspense>
  );
}

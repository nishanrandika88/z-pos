import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";

export function AuditLogsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="text-muted-foreground">Immutable security and operational event trail.</p>
      </div>
      <Card>
        <CardHeader><h2 className="font-semibold">Events</h2></CardHeader>
        <CardContent className="grid min-h-64 place-items-center text-muted-foreground">
          <ShieldCheck className="mb-2 h-8 w-8" />
          Audit events are inserted by database triggers and privileged RPC functions.
        </CardContent>
      </Card>
    </div>
  );
}

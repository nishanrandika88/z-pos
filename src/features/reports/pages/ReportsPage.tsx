import { Download } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";

export function ReportsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-muted-foreground">Daily sales, monthly sales, item sales, discounts, and cashier performance.</p>
        </div>
        <Button><Download className="h-4 w-4" />Export</Button>
      </div>
      <Card>
        <CardHeader><h2 className="font-semibold">Report workspace</h2></CardHeader>
        <CardContent className="grid min-h-64 place-items-center text-muted-foreground">
          Report queries are served by read-only database views and RPC endpoints.
        </CardContent>
      </Card>
    </div>
  );
}

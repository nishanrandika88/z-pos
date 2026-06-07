import { Printer, Store } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Company, branch, tax, receipt, and printer configuration.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><h2 className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4" />Company</h2></CardHeader>
          <CardContent className="text-muted-foreground">Company profile and receipt footer fields.</CardContent>
        </Card>
        <Card>
          <CardHeader><h2 className="flex items-center gap-2 font-semibold"><Printer className="h-4 w-4" />Printers</h2></CardHeader>
          <CardContent className="text-muted-foreground">58mm/80mm ESC/POS and generic thermal printer settings.</CardContent>
        </Card>
      </div>
    </div>
  );
}

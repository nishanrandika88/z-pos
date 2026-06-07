import { Percent, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";

export function DiscountsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Discounts</h1>
          <p className="text-muted-foreground">Automatic item and category discount rules.</p>
        </div>
        <Button><Plus className="h-4 w-4" />Discount</Button>
      </div>
      <Card>
        <CardHeader><h2 className="font-semibold">Active rules</h2></CardHeader>
        <CardContent>
          <div className="grid min-h-48 place-items-center rounded-md border border-dashed text-muted-foreground">
            <Percent className="mb-2 h-8 w-8" />
            Create item or category discounts to apply during billing.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

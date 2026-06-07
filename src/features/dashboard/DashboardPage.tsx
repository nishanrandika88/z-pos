import { BarChart3, CreditCard, Receipt, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/shared/ui/card";

const widgets = [
  { label: "Sales Today", value: "LKR 0.00", icon: TrendingUp },
  { label: "Orders Today", value: "0", icon: Receipt },
  { label: "Revenue", value: "LKR 0.00", icon: BarChart3 },
  { label: "Card / Cash", value: "0 / 0", icon: CreditCard },
];

export function DashboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Sales, order, payment, and cashier performance overview.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {widgets.map((widget) => (
          <Card key={widget.label}>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{widget.label}</p>
                <p className="mt-1 text-2xl font-semibold">{widget.value}</p>
              </div>
              <widget.icon className="h-8 w-8 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

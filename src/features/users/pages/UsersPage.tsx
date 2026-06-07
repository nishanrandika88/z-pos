import { Plus, UserRoundCog } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";

export function UsersPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-muted-foreground">Admin-only user, role, and account status management.</p>
        </div>
        <Button><Plus className="h-4 w-4" />User</Button>
      </div>
      <Card>
        <CardHeader><h2 className="font-semibold">Team</h2></CardHeader>
        <CardContent className="grid min-h-64 place-items-center text-muted-foreground">
          <UserRoundCog className="mb-2 h-8 w-8" />
          User administration is protected by admin route guards and RLS.
        </CardContent>
      </Card>
    </div>
  );
}

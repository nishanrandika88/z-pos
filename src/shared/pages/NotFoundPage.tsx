import { Link } from "react-router";
import { Button } from "@/shared/ui/button";

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="mt-3 text-muted-foreground">The page you requested is not available.</p>
        <Link to="/pos">
          <Button className="mt-6">Back to POS</Button>
        </Link>
      </div>
    </main>
  );
}

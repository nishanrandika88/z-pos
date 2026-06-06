import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "@/app/router";
import { AppProviders } from "@/app/providers";
import { useAuthStore } from "@/features/auth/stores/auth.store";

export function App() {
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

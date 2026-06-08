import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router";
import { LockKeyhole, Mail } from "lucide-react";
import { loginSchema, type LoginForm } from "@/features/auth/auth.schemas";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  async function onSubmit(values: LoginForm) {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate("/pos", { replace: true });
    } catch {
      setError("Invalid email or password.");
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-3 py-6 sm:p-4">
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="px-5 pt-7 text-center sm:px-8 sm:pt-8">
          <BrandLogo />
          <h1 className="mt-6 text-2xl font-semibold">Login</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Secure access for retail billing and back office operations.</p>
        </CardHeader>
        <CardContent className="px-5 pb-7 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Email</span>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" autoComplete="email" {...form.register("email")} />
              </div>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Password</span>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" type="password" autoComplete="current-password" {...form.register("password")} />
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input className="h-4 w-4 accent-black" type="checkbox" {...form.register("rememberMe")} />
              Remember me
            </label>
            {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              Sign in
            </Button>
            <Link className="block text-center text-sm text-primary" to="/reset-password">
              Forgot password?
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

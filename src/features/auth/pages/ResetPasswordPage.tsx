import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router";
import { LockKeyhole, Mail } from "lucide-react";
import { onPasswordRecovery, requestPasswordReset, signOut, updatePassword } from "@/features/auth/auth.repository";
import {
  resetPasswordSchema,
  type ResetPasswordForm,
  updatePasswordSchema,
  type UpdatePasswordForm,
} from "@/features/auth/auth.schemas";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [isRecovery, setIsRecovery] = useState(() => hasRecoveryParams());
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  const requestForm = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: "" },
  });
  const updateForm = useForm<UpdatePasswordForm>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const title = useMemo(() => (isRecovery ? "Create new password" : "Reset password"), [isRecovery]);
  const subtitle = useMemo(
    () =>
      isRecovery
        ? "Enter a strong new password for your Zestora POS account."
        : "A reset link will be sent to the registered email address.",
    [isRecovery],
  );

  useEffect(() => onPasswordRecovery(() => setIsRecovery(true)), []);

  async function onRequestReset(values: ResetPasswordForm) {
    setError(null);
    try {
      await requestPasswordReset(values.email);
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send reset link.");
    }
  }

  async function onUpdatePassword(values: UpdatePasswordForm) {
    setError(null);
    try {
      await updatePassword(values.password);
      await signOut();
      setUpdated(true);
      window.setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update password.");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="px-8 pt-8 text-center">
          <BrandLogo />
          <h1 className="mt-6 text-2xl font-semibold">{title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-6">
          {updated ? (
            <p className="rounded-2xl bg-brand-lime/20 p-4 text-center text-sm font-medium text-brand-forest">
              Password updated. Redirecting to login...
            </p>
          ) : isRecovery ? (
            <form className="space-y-4" onSubmit={updateForm.handleSubmit(onUpdatePassword)}>
              <label className="block space-y-2">
                <span className="text-sm font-medium">New password</span>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" type="password" autoComplete="new-password" {...updateForm.register("password")} />
                </div>
                {updateForm.formState.errors.password ? (
                  <span className="text-xs text-destructive">{updateForm.formState.errors.password.message}</span>
                ) : null}
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Confirm password</span>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" type="password" autoComplete="new-password" {...updateForm.register("confirmPassword")} />
                </div>
                {updateForm.formState.errors.confirmPassword ? (
                  <span className="text-xs text-destructive">{updateForm.formState.errors.confirmPassword.message}</span>
                ) : null}
              </label>
              {error ? <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
              <Button className="w-full" type="submit" disabled={updateForm.formState.isSubmitting}>
                Update password
              </Button>
            </form>
          ) : sent ? (
            <div className="space-y-4 text-center">
              <p className="rounded-2xl bg-brand-lime/20 p-4 text-sm font-medium text-brand-forest">
                Check your inbox for the reset link.
              </p>
              <Link className="block text-sm font-medium text-primary" to="/login">
                Back to login
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={requestForm.handleSubmit(onRequestReset)}>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Email</span>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" autoComplete="email" {...requestForm.register("email")} />
                </div>
                {requestForm.formState.errors.email ? (
                  <span className="text-xs text-destructive">{requestForm.formState.errors.email.message}</span>
                ) : null}
              </label>
              {error ? <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
              <Button className="w-full" type="submit" disabled={requestForm.formState.isSubmitting}>
                Send reset link
              </Button>
              <Link className="block text-center text-sm text-primary" to="/login">
                Back to login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function hasRecoveryParams() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return search.get("type") === "recovery" || hash.get("type") === "recovery";
}

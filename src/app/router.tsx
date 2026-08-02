import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "@/app/shell/AppShell";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { NotFoundPage } from "@/shared/pages/NotFoundPage";

const LoginPage = lazyRoute(() => import("@/features/auth/pages/LoginPage"), "LoginPage");
const ResetPasswordPage = lazyRoute(() => import("@/features/auth/pages/ResetPasswordPage"), "ResetPasswordPage");
const DashboardPage = lazyRoute(() => import("@/features/dashboard/DashboardPage"), "DashboardPage");
const PosPage = lazyRoute(() => import("@/features/pos/pages/PosPage"), "PosPage");
const CatalogPage = lazyRoute(() => import("@/features/catalog/pages/CatalogPage"), "CatalogPage");
const DiscountsPage = lazyRoute(() => import("@/features/discounts/pages/DiscountsPage"), "DiscountsPage");
const OrdersPage = lazyRoute(() => import("@/features/orders/pages/OrdersPage"), "OrdersPage");
const ReportsPage = lazyRoute(() => import("@/features/reports/pages/ReportsPage"), "ReportsPage");
const UsersPage = lazyRoute(() => import("@/features/users/pages/UsersPage"), "UsersPage");
const SettingsPage = lazyRoute(() => import("@/features/settings/pages/SettingsPage"), "SettingsPage");
const AuditLogsPage = lazyRoute(() => import("@/features/audit/pages/AuditLogsPage"), "AuditLogsPage");
const ExpensesPage = lazyRoute(() => import("@/features/expenses/pages/ExpensesPage"), "ExpensesPage");
const ExpenseFormPage = lazyRoute(() => import("@/features/expenses/pages/ExpenseFormPage"), "ExpenseFormPage");
const ExpenseDetailPage = lazyRoute(() => import("@/features/expenses/pages/ExpenseDetailPage"), "ExpenseDetailPage");
const ReceiptReviewPage = lazyRoute(() => import("@/features/expenses/pages/ReceiptReviewPage"), "ReceiptReviewPage");

function lazyRoute<T extends Record<string, ComponentType>>(
  loader: () => Promise<T>,
  exportName: keyof T,
) {
  return lazy(async () => ({ default: (await loader())[exportName] }));
}

function page(node: ReactNode) {
  return <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: page(<LoginPage />),
  },
  {
    path: "/reset-password",
    element: page(<ResetPasswordPage />),
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/pos" replace /> },
      { path: "dashboard", element: page(<ProtectedRoute permission="dashboard:read"><DashboardPage /></ProtectedRoute>) },
      { path: "pos", element: page(<ProtectedRoute permission="pos:bill"><PosPage /></ProtectedRoute>) },
      { path: "catalog", element: page(<ProtectedRoute permission="catalog:manage"><CatalogPage /></ProtectedRoute>) },
      { path: "discounts", element: page(<ProtectedRoute permission="discounts:manage"><DiscountsPage /></ProtectedRoute>) },
      { path: "orders", element: page(<ProtectedRoute permission="orders:read"><OrdersPage /></ProtectedRoute>) },
      { path: "expenses", element: page(<ProtectedRoute permission="expenses:read"><ExpensesPage /></ProtectedRoute>) },
      { path: "expenses/new", element: page(<ProtectedRoute permission="expenses:create"><ExpenseFormPage /></ProtectedRoute>) },
      { path: "expenses/:expenseId/edit", element: page(<ProtectedRoute permission="expenses:update"><ExpenseFormPage /></ProtectedRoute>) },
      { path: "expenses/receipts/:receiptId/review", element: page(<ProtectedRoute permission="expenses:receipts"><ReceiptReviewPage /></ProtectedRoute>) },
      { path: "expenses/:expenseId", element: page(<ProtectedRoute permission="expenses:read"><ExpenseDetailPage /></ProtectedRoute>) },
      { path: "reports", element: page(<ProtectedRoute permission="reports:read"><ReportsPage /></ProtectedRoute>) },
      { path: "users", element: page(<ProtectedRoute permission="users:manage"><UsersPage /></ProtectedRoute>) },
      { path: "settings", element: page(<ProtectedRoute permission="settings:manage"><SettingsPage /></ProtectedRoute>) },
      { path: "audit-logs", element: page(<ProtectedRoute permission="audit:read"><AuditLogsPage /></ProtectedRoute>) },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, CircleDollarSign, ClipboardList, LayoutDashboard, Plus, RefreshCw, Tags, Users } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import type { ExpenseFilters, ExpenseFormType, UnitType } from "@/domain/expenses/types";
import { can } from "@/features/auth/rbac";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import { ExpenseStatusBadge } from "@/features/expenses/components/ExpenseStatusBadge";
import {
  createInventoryItem,
  listEmployeeOptions,
  listEmployees,
  listExpenseCategories,
  listExpenses,
  listInventoryItems,
  saveExpenseCategory,
  saveEmployee,
} from "@/features/expenses/expenses.repository";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

type ExpenseView = "dashboard" | "list" | "reimbursements" | "salaries" | "employees" | "categories" | "inventory";
const pageSize = 20;
const currency = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const tabs: Array<{ id: ExpenseView; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "list", label: "All expenses", icon: ClipboardList },
  { id: "reimbursements", label: "Reimbursements", icon: CircleDollarSign },
  { id: "salaries", label: "Salaries", icon: Users },
  { id: "employees", label: "Employees", icon: Users },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "inventory", label: "Inventory", icon: Boxes },
];

export function ExpensesPage() {
  const profile = useAuthStore((state) => state.profile);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get("view") as ExpenseView) || "dashboard";
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const categoriesQuery = useQuery({ queryKey: ["expense-categories", "all"], queryFn: () => listExpenseCategories(true) });
  const salaryCategory = categoriesQuery.data?.find((category) => category.kind === "SALARY" && category.active);
  const queryFilters = useMemo<ExpenseFilters>(() => {
    if (view === "dashboard") return { dateFrom: firstDayOfMonth(), dateTo: localDate() };
    if (view === "reimbursements") return { ...filters, fundSource: "PERSONAL" };
    if (view === "salaries") return { ...filters, categoryId: salaryCategory?.id };
    return filters;
  }, [filters, salaryCategory?.id, view]);
  const expensesQuery = useQuery({
    queryKey: ["expenses", view, queryFilters, page],
    queryFn: () => listExpenses(queryFilters, { page: view === "dashboard" ? 1 : page, pageSize: view === "dashboard" ? 500 : pageSize }),
    enabled: !["categories", "inventory", "employees"].includes(view) && (view !== "salaries" || Boolean(salaryCategory)),
  });
  const expenses = expensesQuery.data?.expenses ?? [];
  const visibleTabs = tabs.filter((tab) => {
    if (tab.id === "categories") return can(profile?.role, "expenses:categories", profile?.permissions);
    if (tab.id === "inventory") return can(profile?.role, "expenses:inventory", profile?.permissions);
    if (["salaries", "employees"].includes(tab.id)) return can(profile?.role, "expenses:salaries", profile?.permissions);
    return true;
  });

  function changeView(next: ExpenseView) {
    setSearchParams(next === "dashboard" ? {} : { view: next });
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Expense management</h1>
          <p className="text-sm text-muted-foreground">Track shop costs, stock purchases, salaries, receipts, and personal reimbursements.</p>
        </div>
        {can(profile?.role, "expenses:create", profile?.permissions) ? (
          <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" to="/expenses/new"><Plus className="h-4 w-4" />New expense</Link>
        ) : null}
      </div>

      <div className="pos-scrollbar flex gap-2 overflow-x-auto pb-1">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" onClick={() => changeView(tab.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${view === tab.id ? "border-brand-orange bg-brand-orange text-white" : "bg-white text-brand-espresso/70"}`}>
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {view === "dashboard" ? <ExpenseDashboard expenses={expenses} loading={expensesQuery.isLoading} /> : null}
      {view === "list" || view === "reimbursements" || view === "salaries" ? (
        <>
          <ExpenseFiltersPanel filters={filters} onChange={(next) => { setFilters(next); setPage(1); }} categories={categoriesQuery.data ?? []} lockCategory={view === "salaries"} />
          <ExpenseTable expenses={expenses.filter((expense) => view !== "reimbursements" || expense.reimbursementStatus !== "NOT_REQUIRED")} loading={expensesQuery.isLoading} error={expensesQuery.error} />
          <div className="flex items-center justify-between text-sm">
            <span>{expensesQuery.data?.count ?? 0} record(s)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={!expensesQuery.data?.hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </>
      ) : null}
      {view === "categories" && profile ? <CategoryManager branchId={profile.branchId} userId={profile.id} categories={categoriesQuery.data ?? []} /> : null}
      {view === "inventory" && profile ? <InventoryManager branchId={profile.branchId} userId={profile.id} /> : null}
      {view === "employees" && profile ? <EmployeeManager branchId={profile.branchId} userId={profile.id} /> : null}
    </div>
  );
}

function ExpenseDashboard({ expenses, loading }: { expenses: Awaited<ReturnType<typeof listExpenses>>["expenses"]; loading: boolean }) {
  const active = expenses.filter((expense) => !["DRAFT", "VOID"].includes(expense.status));
  const total = active.reduce((sum, expense) => sum + Number(expense.grandTotal), 0);
  const personal = active.reduce((sum, expense) => sum + Number(expense.personalAmount), 0);
  const pending = active.reduce((sum, expense) => sum + Math.max(0, Number(expense.reimbursableAmount) - Number(expense.reimbursedAmount)), 0);
  const cards = [
    { label: "This month's expenses", value: currency.format(total) },
    { label: "Approved / paid records", value: active.length.toLocaleString() },
    { label: "Personally funded", value: currency.format(personal) },
    { label: "Pending reimbursement", value: currency.format(pending) },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <Card key={card.label}><CardContent><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-1 text-2xl font-semibold">{loading ? "…" : card.value}</p></CardContent></Card>)}
      </div>
      <ExpenseTable expenses={expenses.slice(0, 10)} loading={loading} title="Recent expenses" />
    </div>
  );
}

function ExpenseFiltersPanel({ filters, onChange, categories, lockCategory }: { filters: ExpenseFilters; onChange: (filters: ExpenseFilters) => void; categories: Awaited<ReturnType<typeof listExpenseCategories>>; lockCategory: boolean }) {
  return (
    <Card><CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-6">
      <Input placeholder="Reference, payee, invoice" value={filters.search ?? ""} onChange={(event) => onChange({ ...filters, search: event.target.value })} />
      <Input type="date" value={filters.dateFrom ?? ""} onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })} />
      <Input type="date" value={filters.dateTo ?? ""} onChange={(event) => onChange({ ...filters, dateTo: event.target.value })} />
      <select className="h-10 rounded-md border bg-white px-3 text-sm" value={filters.categoryId ?? ""} disabled={lockCategory} onChange={(event) => onChange({ ...filters, categoryId: event.target.value || undefined })}>
        <option value="">All categories</option>{categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="h-10 rounded-md border bg-white px-3 text-sm" value={filters.status ?? ""} onChange={(event) => onChange({ ...filters, status: (event.target.value || undefined) as ExpenseFilters["status"] })}>
        <option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PENDING_APPROVAL">Pending approval</option><option value="APPROVED">Approved</option><option value="PAID">Paid</option><option value="VOID">Void</option>
      </select>
      <Button variant="outline" onClick={() => onChange({})}><RefreshCw className="h-4 w-4" />Clear</Button>
    </CardContent></Card>
  );
}

function ExpenseTable({ expenses, loading, error, title }: { expenses: ExpenseSummaryLike[]; loading: boolean; error?: Error | null; title?: string }) {
  return (
    <Card>
      {title ? <CardHeader><h2 className="font-semibold">{title}</h2></CardHeader> : null}
      <CardContent className="p-0">
        {error ? <p className="p-4 text-sm text-destructive">{error.message}</p> : loading ? <p className="p-6 text-center text-sm text-muted-foreground">Loading expenses…</p> : expenses.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No expenses match these filters.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b bg-muted/40"><tr><th className="p-3">Reference</th><th className="p-3">Date</th><th className="p-3">Category</th><th className="p-3">Payee</th><th className="p-3">Funding</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th></tr></thead><tbody>
            {expenses.map((expense) => <tr key={expense.id} className="border-b last:border-0"><td className="p-3 font-medium"><Link className="text-brand-orange hover:underline" to={`/expenses/${expense.id}`}>{expense.expenseNumber}</Link></td><td className="p-3">{new Date(expense.expenseDate).toLocaleString()}</td><td className="p-3">{expense.categoryName}</td><td className="p-3">{expense.payee || "—"}</td><td className="p-3">{expense.fundingSources.map(labelWords).join(" + ")}</td><td className="p-3"><ExpenseStatusBadge status={expense.status} /></td><td className="p-3 text-right font-semibold">{currency.format(Number(expense.grandTotal))}</td></tr>)}
          </tbody></table></div>
        )}
      </CardContent>
    </Card>
  );
}

type ExpenseSummaryLike = Awaited<ReturnType<typeof listExpenses>>["expenses"][number];

function CategoryManager({ branchId, userId, categories }: { branchId: string; userId: string; categories: Awaited<ReturnType<typeof listExpenseCategories>> }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [formType, setFormType] = useState<ExpenseFormType>("GENERAL");
  const mutation = useMutation({
    mutationFn: () => saveExpenseCategory({ branchId, userId, name, kind: kindForFormType(formType), formType, active: true, displayOrder: categories.length * 10 + 10 }),
    onSuccess: async () => { setName(""); await queryClient.invalidateQueries({ queryKey: ["expense-categories"] }); },
  });
  return <Card><CardHeader><h2 className="font-semibold">Expense categories</h2><p className="text-sm text-muted-foreground">Archive categories to preserve historical reports; add new categories at any time.</p></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-2 sm:grid-cols-[1fr_220px_auto]"><Input placeholder="New category name" value={name} onChange={(event) => setName(event.target.value)} /><select className="h-10 rounded-md border bg-white px-3 text-sm" value={formType} onChange={(event) => setFormType(event.target.value as ExpenseFormType)}><option value="GENERAL">General expense</option><option value="SALARY">Salary</option><option value="RENT">Rent</option><option value="UTILITY">Utility bill</option><option value="INVENTORY_PURCHASE">Inventory purchase</option><option value="EQUIPMENT_REPAIR">Equipment or repair</option></select><Button disabled={name.trim().length < 2 || mutation.isPending} onClick={() => mutation.mutate()}><Plus className="h-4 w-4" />Add</Button></div>
    {mutation.error ? <p className="text-sm text-destructive">{mutation.error.message}</p> : null}
    <div className="divide-y rounded-md border">{categories.map((category) => <div key={category.id} className="flex items-center justify-between p-3"><div><p className="font-medium">{category.name}</p><p className="text-xs text-muted-foreground">{labelWords(category.formType)} · {category.active ? "Active" : "Archived"}</p></div><Button variant="outline" size="sm" onClick={() => void saveExpenseCategory({ id: category.id, branchId, userId, name: category.name, kind: category.kind, formType: category.formType, active: !category.active, displayOrder: category.displayOrder }).then(() => queryClient.invalidateQueries({ queryKey: ["expense-categories"] }))}>{category.active ? "Archive" : "Restore"}</Button></div>)}</div>
  </CardContent></Card>;
}

function EmployeeManager({ branchId, userId }: { branchId: string; userId: string }) {
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({ queryKey: ["expense-employees", "all"], queryFn: () => listEmployees(true) });
  const optionsQuery = useQuery({ queryKey: ["expense-employee-options"], queryFn: listEmployeeOptions });
  const [fullName, setFullName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [profileId, setProfileId] = useState("");
  const mutation = useMutation({
    mutationFn: () => saveEmployee({ branchId, userId, fullName, employeeNumber, jobTitle, profileId, active: true }),
    onSuccess: async () => {
      setFullName(""); setEmployeeNumber(""); setJobTitle(""); setProfileId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["expense-employees"] }),
        queryClient.invalidateQueries({ queryKey: ["expense-employee-options"] }),
      ]);
    },
  });
  const availableUsers = (optionsQuery.data ?? []).filter((option) => option.source === "USER");
  async function toggleEmployee(employee: Awaited<ReturnType<typeof listEmployees>>[number]) {
    await saveEmployee({ id: employee.id, branchId, userId, profileId: employee.profileId, employeeNumber: employee.employeeNumber, fullName: employee.fullName, jobTitle: employee.jobTitle, active: !employee.active });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["expense-employees"] }),
      queryClient.invalidateQueries({ queryKey: ["expense-employee-options"] }),
    ]);
  }
  return <Card><CardHeader><h2 className="font-semibold">Employees</h2><p className="text-sm text-muted-foreground">Employees can be linked to a system login, but a login is not required.</p></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_150px_1fr_1fr_auto]"><Input placeholder="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} /><Input placeholder="Employee no." value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} /><Input placeholder="Job title (optional)" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /><select className="h-10 rounded-md border bg-white px-3 text-sm" value={profileId} onChange={(event) => { const next = event.target.value; setProfileId(next); const selected = availableUsers.find((option) => option.profileId === next); if (selected && !fullName.trim()) setFullName(selected.fullName); }}><option value="">No login linked</option>{availableUsers.map((option) => <option key={option.value} value={option.profileId}>{option.fullName}</option>)}</select><Button disabled={fullName.trim().length < 2 || mutation.isPending} onClick={() => mutation.mutate()}><Plus className="h-4 w-4" />Add</Button></div>
    {mutation.error ? <p className="text-sm text-destructive">{mutation.error.message}</p> : null}
    <div className="divide-y rounded-md border">{(employeesQuery.data ?? []).map((employee) => <div key={employee.id} className="flex items-center justify-between gap-3 p-3"><div><p className="font-medium">{employee.fullName}</p><p className="text-xs text-muted-foreground">{[employee.employeeNumber, employee.jobTitle, employee.profileId ? "Login linked" : undefined].filter(Boolean).join(" · ") || "Employee"}</p></div><Button variant="outline" size="sm" onClick={() => void toggleEmployee(employee)}>{employee.active ? "Archive" : "Restore"}</Button></div>)}</div>
  </CardContent></Card>;
}

function InventoryManager({ branchId, userId }: { branchId: string; userId: string }) {
  const queryClient = useQueryClient();
  const inventoryQuery = useQuery({ queryKey: ["expense-inventory"], queryFn: listInventoryItems });
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<UnitType>("UNIT");
  const mutation = useMutation({ mutationFn: () => createInventoryItem({ branchId, userId, name, baseUnit: unit }), onSuccess: async () => { setName(""); await queryClient.invalidateQueries({ queryKey: ["expense-inventory"] }); } });
  return <Card><CardHeader><h2 className="font-semibold">Stockable ingredients and materials</h2><p className="text-sm text-muted-foreground">Purchases post to these items only after expense approval.</p></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]"><Input placeholder="Ingredient or material" value={name} onChange={(event) => setName(event.target.value)} /><UnitSelect value={unit} onChange={setUnit} /><Button disabled={name.trim().length < 2 || mutation.isPending} onClick={() => mutation.mutate()}><Plus className="h-4 w-4" />Add</Button></div>
    {mutation.error ? <p className="text-sm text-destructive">{mutation.error.message}</p> : null}
    <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Item</th><th className="p-3">Base unit</th><th className="p-3 text-right">On hand</th><th className="p-3 text-right">Average cost</th></tr></thead><tbody>{(inventoryQuery.data ?? []).map((item) => <tr key={item.id} className="border-b"><td className="p-3 font-medium">{item.name}</td><td className="p-3">{labelWords(item.baseUnit)}</td><td className="p-3 text-right">{item.quantityOnHand}</td><td className="p-3 text-right">{currency.format(Number(item.averageCost))}</td></tr>)}</tbody></table></div>
  </CardContent></Card>;
}

function UnitSelect({ value, onChange }: { value: UnitType; onChange: (value: UnitType) => void }) {
  const units: UnitType[] = ["UNIT", "GRAM", "KILOGRAM", "MILLILITRE", "LITRE", "PACK", "BOTTLE", "BOX", "OTHER"];
  return <select className="h-10 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value as UnitType)}>{units.map((item) => <option key={item} value={item}>{labelWords(item)}</option>)}</select>;
}

function labelWords(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function kindForFormType(formType: ExpenseFormType) { return formType === "SALARY" ? "SALARY" as const : formType === "INVENTORY_PURCHASE" ? "INVENTORY" as const : "OPERATIONAL" as const; }
function localDate() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function firstDayOfMonth() { return `${localDate().slice(0, 8)}01`; }

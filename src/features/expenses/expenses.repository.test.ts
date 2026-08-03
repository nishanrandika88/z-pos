import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/shared/lib/supabase", () => ({ supabase: { rpc } }));

import { reopenVoidExpense } from "@/features/expenses/expenses.repository";

describe("reopenVoidExpense", () => {
  beforeEach(() => rpc.mockReset());

  it("uses the version-checked admin recovery RPC", async () => {
    rpc.mockResolvedValue({ data: 8, error: null });

    await expect(reopenVoidExpense("expense-1", 7)).resolves.toBe(8);
    expect(rpc).toHaveBeenCalledWith("reopen_void_expense", {
      target_expense_id: "expense-1",
      expected_version: 7,
    });
  });

  it("surfaces a rejected reopen", async () => {
    const error = new Error("Only a voided expense can be reopened");
    rpc.mockResolvedValue({ data: null, error });

    await expect(reopenVoidExpense("expense-1", 7)).rejects.toBe(error);
  });
});

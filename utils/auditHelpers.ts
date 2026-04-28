import { Request } from "express";

import Expense from "../models/ExpenseSchema";
import ExpenseAuditLog from "../models/ExpenseAuditLogSchema";
import { IUser, IExpense } from "../types/models";

interface Change {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface BudgetSnapshot {
  totalBudget?: number;
  totalExpenses?: number;
  remainingBudget?: number;
  budgetExists?: boolean;
}

interface LogExpenseActionParams {
  actionType: string;
  expense: IExpense | Record<string, unknown>;
  previousExpense?: IExpense | Record<string, unknown> | null;
  user: IUser;
  reason?: string;
  description?: string;
  budgetStatusBefore?: BudgetSnapshot | null;
  budgetStatusAfter?: BudgetSnapshot | null;
  req: Request;
}

// ============= PERMISSION LOG HELPERS =============
const canPerformExpenseAction = (
  user: IUser,
  expense: IExpense | null,
  action: string,
): boolean => {
  if (action === "view") return true;
  if (user.role === "viewer") return false;

  if (action === "delete" && expense && expense.paymentStatus === "paid") {
    return user.role === "super_admin";
  }

  return ["planner", "admin", "super_admin"].includes(user.role);
};

const canViewAuditLogs = (user: IUser): boolean => {
  return ["admin", "super_admin"].includes(user.role);
};

// ============= AUDIT LOG HELPERS =============
const getChangedFields = (
  oldExpense: IExpense | Record<string, unknown>,
  newExpense: IExpense | Record<string, unknown>,
): Change[] => {
  const changes: Change[] = [];
  if (!oldExpense || !newExpense) return changes;

  const fields = [
    "amount",
    "description",
    "category",
    "vendor",
    "paymentStatus",
    "paymentDate",
    "dueDate",
    "notes",
    "receiptUrl",
  ];

  fields.forEach((field) => {
    const oldValue = (oldExpense as Record<string, unknown>)[field];
    const newValue = (newExpense as Record<string, unknown>)[field];

    if (field === "vendor") {
      const getVendorId = (value: unknown): string | null => {
        if (!value) return null;
        if (typeof value === "string") return value;
        if (typeof value === "object" && value !== null) {
          const obj = value as Record<string, unknown>;
          if (obj._id) return String(obj._id);
          return String(value);
        }
        return null;
      };

      const oldVendorId = getVendorId(oldValue);
      const newVendorId = getVendorId(newValue);

      if (oldVendorId !== newVendorId) {
        changes.push({
          field,
          oldValue: oldVendorId,
          newValue: newVendorId,
        });
      }
    } else if (field === "paymentDate" || field === "dueDate") {
      // Handle date comparisons properly
      const oldDate = oldValue
        ? new Date(oldValue as string).toISOString()
        : null;
      const newDate = newValue
        ? new Date(newValue as string).toISOString()
        : null;

      if (oldDate !== newDate) {
        changes.push({ field, oldValue: oldDate, newValue: newDate });
      }
    } else if (oldValue !== newValue) {
      changes.push({ field, oldValue, newValue });
    }
  });

  return changes;
};

const determineActionType = (
  changes: Change[],
  isCreate: boolean,
  isDelete: boolean,
): string => {
  if (isCreate) return "CREATE";
  if (isDelete) return "DELETE";
  if (changes.find((c) => c.field === "amount")) return "AMOUNT_CHANGE";
  if (changes.find((c) => c.field === "paymentStatus")) return "STATUS_CHANGE";
  return "UPDATE";
};

const logExpenseAction = async ({
  actionType,
  expense,
  previousExpense = null,
  user,
  reason = "",
  description = "",
  budgetStatusBefore,
  budgetStatusAfter,
  req,
}: LogExpenseActionParams): Promise<void> => {
  try {
    const changes = previousExpense
      ? getChangedFields(
          previousExpense as Record<string, unknown>,
          expense as Record<string, unknown>,
        )
      : [];

    const expenseObj =
      typeof (expense as IExpense).toObject === "function"
        ? (expense as IExpense).toObject()
        : (expense as Record<string, unknown>);

    const createdBySnapshot = (expenseObj as Record<string, unknown>)
      .createdBySnapshot ?? {
      _id: (expenseObj as any).createdBy?._id ?? (expenseObj as any).createdBy,
      firstName: (expenseObj as any).createdBy?.firstName,
      lastName: (expenseObj as any).createdBy?.lastName,
      email: (expenseObj as any).createdBy?.email,
      role: (expenseObj as any).createdBy?.role,
    };

    const logData: Record<string, unknown> = {
      expenseId: expense._id,
      eventId: (expense as IExpense).eventId,
      organizationId: user.organization,
      actionType,
      performedBy: user._id,
      performedBySnapshot: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
      createdBy: expenseObj.createdBy?._id ?? expenseObj.createdBy,
      createdBySnapshot,

      changes,
      reason,
      description,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      isAmountChange: changes.some((c) => c.field === "amount"),
      isPaymentStatusChange: changes.some((c) => c.field === "paymentStatus"),
      isVendorChange: changes.some((c) => c.field === "vendor"),
    };

    if (previousExpense) {
      logData.previousData =
        typeof (previousExpense as IExpense).toObject === "function"
          ? (previousExpense as IExpense).toObject()
          : previousExpense;
    }
    if (actionType !== "DELETE") {
      logData.newData = {
        ...(expenseObj as object),
        createdBySnapshot: expenseObj.createdBySnapshot ?? createdBySnapshot,
      };
    } else {
      logData.deletedData = {
        ...(expenseObj as object),
        createdBySnapshot: expenseObj.createdBySnapshot ?? createdBySnapshot,
      };
    }

    if (budgetStatusBefore || budgetStatusAfter) {
      logData.budgetImpact = {
        before: budgetStatusBefore || {},
        after: budgetStatusAfter || {},
      };
    }

    await ExpenseAuditLog.create(logData);
  } catch (error: unknown) {
    console.error("Failed to create audit log:", error);
  }
};

export {
  canPerformExpenseAction,
  canViewAuditLogs,
  getChangedFields,
  determineActionType,
  logExpenseAction,
};

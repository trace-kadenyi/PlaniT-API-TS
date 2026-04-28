import { Types } from "mongoose";

import Budget from "../models/BudgetSchema";
import Expense from "../models/ExpenseSchema";

interface BudgetStatus {
  totalBudget: number;
  spentAmount?: number;
  reservedAmount?: number;
  totalExpenses: number;
  remainingBudget: number;
  deletedPaidTotal?: number;
  budgetExists: boolean;
}

export const getBudgetStatus = async (
  eventId: Types.ObjectId | string,
  organizationId: Types.ObjectId | string,
): Promise<BudgetStatus> => {
  const budget = await Budget.findOne({ eventId, organizationId });

  if (!budget) {
    return {
      totalBudget: 0,
      totalExpenses: 0,
      remainingBudget: 0,
      budgetExists: false,
    };
  }

  // Optional: keep this for UI charts / summaries
  const totalExpensesAgg = await Expense.aggregate([
    { $match: { eventId: budget.eventId, organizationId } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  const totalExpenses = totalExpensesAgg[0]?.total || 0;

  return {
    totalBudget: budget.totalBudget,
    spentAmount: budget.spentAmount,
    reservedAmount: budget.reservedAmount,
    totalExpenses, // informational only
    remainingBudget: budget.remainingBudget,
    deletedPaidTotal: budget.deletedPaidTotal || 0,
    budgetExists: true,
  };
};

import { Document, Types } from "mongoose";

export type AuditActionType =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "STATUS_CHANGE"
  | "AMOUNT_CHANGE"
  | "EVENT_DELETE_CASCADE";

export interface IAuditChange {
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface IBudgetImpactSnapshot {
  totalBudget?: number;
  totalExpenses?: number;
  remainingBudget?: number;
}

export interface IPerformedBySnapshot {
  _id?: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

export interface IExpenseAuditLog extends Document {
  _id: Types.ObjectId;
  expenseId: Types.ObjectId;
  eventId: Types.ObjectId;
  organizationId: Types.ObjectId;
  actionType: AuditActionType;
  performedBy: Types.ObjectId;
  performedBySnapshot?: IPerformedBySnapshot;
  changes?: IAuditChange[];
  previousData?: unknown;
  newData?: unknown;
  deletedData?: unknown;
  reason?: string;
  description?: string;
  budgetImpact?: {
    before?: IBudgetImpactSnapshot;
    after?: IBudgetImpactSnapshot;
  };
  ipAddress?: string;
  userAgent?: string;
  isAmountChange?: boolean;
  isPaymentStatusChange?: boolean;
  isVendorChange?: boolean;
  isDeleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

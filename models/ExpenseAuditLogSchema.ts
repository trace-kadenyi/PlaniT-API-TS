import mongoose, { Schema } from "mongoose";
import { IExpenseAuditLog } from "../types/models";

const expenseAuditLogSchema = new Schema<IExpenseAuditLog>(
  {
    // Core identifiers
    expenseId: {
      type: Schema.Types.ObjectId,
      ref: "Expense",
      required: true,
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    // Action metadata
    actionType: {
      type: String,
      enum: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "STATUS_CHANGE",
        "AMOUNT_CHANGE",
        "EVENT_DELETE_CASCADE",
      ],
      required: true,
    },

    // User who performed the action
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    performedBySnapshot: {
      _id: {
        type: Schema.Types.ObjectId,
      },
      firstName: String,
      lastName: String,
      email: String,
      role: String,
    },

    // Track specific changes
    changes: [
      {
        field: String,
        oldValue: Schema.Types.Mixed,
        newValue: Schema.Types.Mixed,
      },
    ],

    // Data snapshots for context
    previousData: {
      type: Schema.Types.Mixed,
    },
    newData: {
      type: Schema.Types.Mixed,
    },

    // For DELETE actions - store complete expense data
    deletedData: {
      type: Schema.Types.Mixed,
    },

    // Context and notes
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    // Budget impact (important for financial tracking)
    budgetImpact: {
      before: {
        totalBudget: Number,
        totalExpenses: Number,
        remainingBudget: Number,
      },
      after: {
        totalBudget: Number,
        totalExpenses: Number,
        remainingBudget: Number,
      },
    },

    // Technical metadata
    ipAddress: String,
    userAgent: String,

    // Flags for quick filtering of high-risk actions
    isAmountChange: Boolean,
    isPaymentStatusChange: Boolean,
    isVendorChange: Boolean,
    isDeleted: Boolean,
  },
  {
    timestamps: true,
  },
);

// Enhanced indexes
expenseAuditLogSchema.index({ expenseId: 1 });
expenseAuditLogSchema.index({ eventId: 1 });
expenseAuditLogSchema.index({ performedBy: 1 });
expenseAuditLogSchema.index({ actionType: 1 });
expenseAuditLogSchema.index({ "changes.field": 1 });
expenseAuditLogSchema.index({ createdAt: -1 });
expenseAuditLogSchema.index({ isAmountChange: 1 });
expenseAuditLogSchema.index({ isPaymentStatusChange: 1 });
expenseAuditLogSchema.index({ isDeleted: 1 });

export default mongoose.model<IExpenseAuditLog>(
  "ExpenseAuditLog",
  expenseAuditLogSchema,
);

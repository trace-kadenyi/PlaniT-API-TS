import mongoose, { Schema } from "mongoose";
import { IBudget } from "../types/models";

const budgetSchema = new Schema<IBudget>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      unique: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    // Original planned budget
    totalBudget: {
      type: Number,
      required: true,
      min: 0,
    },

    // Money that has ACTUALLY been paid (irreversible)
    spentAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Money reserved by unpaid expenses
    reservedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // deleted paid expenses
    deletedPaidTotal: {
      type: Number,
      default: 0,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [300, "Notes must be 300 characters or fewer"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// 🔹 Derived values (never stored directly)
budgetSchema.virtual("remainingBudget").get(function () {
  return this.totalBudget - this.spentAmount - this.reservedAmount;
});

budgetSchema.virtual("availableBudget").get(function () {
  // alias, useful semantically
  return this.remainingBudget;
});

export default mongoose.model<IBudget>("Budget", budgetSchema);

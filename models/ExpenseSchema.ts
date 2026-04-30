import mongoose, { Schema } from "mongoose";
import { IExpense } from "../types/models";

const expenseSchema = new Schema<IExpense>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Must be linked to an event"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: 0,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [150, "Description too long"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: [
        "venue", // Location rental
        "catering", // Food, drinks, cake
        "decorations", // Design, florals, signage
        "equipment", // Rentals: tents, furniture, A/V
        "staffing", // Wait staff, ushers, cleaners
        "entertainment", // DJs, MCs, performers
        "transportation", // Guest or vendor transport
        "marketing", // Invites, digital promo, posters
        "photography/videography", // photos, videos
        "other", // Any unique/unclassified vendors
      ],
      default: "other",
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    paymentDate: Date,
    dueDate: Date,
    notes: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    receiptUrl: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/, "Invalid receipt URL"],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdBySnapshot: {
      _id: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      firstName: String,
      lastName: String,
      email: String,
      role: String,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

expenseSchema.index({ eventId: 1, category: 1 });
expenseSchema.index({ organizationId: 1, eventId: 1 });

export default mongoose.model<IExpense>("Expense", expenseSchema);

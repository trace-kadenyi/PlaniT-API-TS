import { Document, Types } from "mongoose";

export interface IBudget extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  organizationId: Types.ObjectId;
  totalBudget: number;
  spentAmount: number;
  reservedAmount: number;
  deletedPaidTotal: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  // Virtuals
  remainingBudget: number;
  availableBudget: number;
}

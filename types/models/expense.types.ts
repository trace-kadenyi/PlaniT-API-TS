import { Document, Types } from "mongoose";
import { VendorService } from "./vendor.types";

export type PaymentStatus = "pending" | "paid";

export interface IExpenseSnapshot {
  _id?: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

export interface IExpense extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  eventId: Types.ObjectId;
  amount: number;
  description: string;
  category: VendorService;
  vendor?: Types.ObjectId;
  paymentStatus: PaymentStatus;
  paymentDate?: Date;
  dueDate?: Date;
  notes?: string;
  receiptUrl?: string;
  createdBy: Types.ObjectId;
  createdBySnapshot?: IExpenseSnapshot;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

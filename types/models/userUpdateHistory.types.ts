import { Document, Types } from "mongoose";
import { UserRole } from "./user.types";

export type UpdateHistoryType =
  | "profile_update"
  | "password_change"
  | "role_change"
  | "deactivation"
  | "reactivation";

export interface IHistoryChange {
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface IUserUpdateHistory extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  organization: Types.ObjectId;
  updatedBy: Types.ObjectId;
  updatedByRole: UserRole;
  changes: IHistoryChange[];
  type: UpdateHistoryType;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

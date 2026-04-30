import { Document, Types } from "mongoose";

export type UserRole = "super_admin" | "admin" | "planner" | "viewer";

export interface IUserContact {
  phone?: string;
  emergencyContact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  organization: Types.ObjectId;
  role: UserRole;
  password: string;
  contact?: IUserContact;
  profilePicture?: string | null;
  assignedEvents: Types.ObjectId[];
  isActive: boolean;
  isDeactivated: boolean;
  lastLogin?: Date | null;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  correctPassword(
    candidatePassword: string,
    userPassword: string,
  ): Promise<boolean>;
  changedPasswordAfter(JWTTimestamp: number): boolean;
  createPasswordResetToken(): string;
}

import { Document, Types } from "mongoose";

export interface IOrganizationSettings {
  allowExternalEmails: boolean;
  defaultUserRole: "admin" | "planner" | "viewer";
}

export interface IOrganization extends Document {
  _id: Types.ObjectId;
  name: string;
  plan: "free" | "premium" | "enterprise";
  isActive: boolean;
  settings: IOrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}
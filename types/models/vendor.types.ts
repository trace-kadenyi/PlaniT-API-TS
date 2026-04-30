import { Document, Types } from "mongoose";

export type VendorService =
  | "venue"
  | "catering"
  | "decorations"
  | "equipment"
  | "staffing"
  | "entertainment"
  | "transportation"
  | "marketing"
  | "photography/videography"
  | "other";

export interface IVendorContact {
  email?: string;
  phone?: string;
  website?: string;
}

export interface IVendor extends Document {
  _id: Types.ObjectId;
  name: string;
  services: VendorService;
  organizationId: Types.ObjectId;
  contact?: IVendorContact;
  address?: string;
  notes?: string;
  isArchived: boolean;
  isDeleted: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

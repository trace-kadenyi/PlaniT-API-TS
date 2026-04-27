import { Document, Types } from "mongoose";

export interface IClientContact {
  email?: string;
  phone?: string;
}

export interface IClient extends Document {
  _id: Types.ObjectId;
  name: string;
  contact?: IClientContact;
  preferences?: string;
  notes?: string;
  company?: string;
  organizationId: Types.ObjectId;
  isArchived: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  archivedAt?: Date | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

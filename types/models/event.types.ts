import { Document, Types } from "mongoose";

export type EventStatus =
  | "Planning"
  | "In Progress"
  | "Completed"
  | "Cancelled";

export interface IEventLocation {
  venue: string;
  address?: string;
  city: string;
  country: string;
}

export interface IEvent extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  date: Date;
  location: IEventLocation;
  status: EventStatus;
  type: string;
  summary?: string;
  createdBy: Types.ObjectId;
  assignedUsers: Types.ObjectId[];
  client?: Types.ObjectId;
  vendors: Types.ObjectId[];
  organizationId: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isArchived: boolean;
  archivedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

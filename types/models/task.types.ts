import { Document, Types } from "mongoose";

export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "To Do" | "In Progress" | "In Review" | "Completed";

export interface ITask extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  eventId: Types.ObjectId;
  createdBy: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  deadline: Date;
  priority: TaskPriority;
  status: TaskStatus;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

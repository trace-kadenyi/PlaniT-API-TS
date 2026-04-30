import mongoose, { Schema } from "mongoose";
import { ITask } from "../types/models";

const taskSchema = new Schema<ITask>(
  {
    title: {
      type: String,
      maxlength: [50, "Task name must be 50 characters or fewer"],
      required: true,
    },
    description: {
      type: String,
      maxlength: [150, "Description must be 150 characters or fewer"],
      required: [true, "Description is required"],
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    deadline: {
      type: Date,
      required: [true, "Date is required"],
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["To Do", "In Progress", "In Review", "Completed"],
      default: "To Do",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

export default mongoose.model<ITask>("Task", taskSchema);

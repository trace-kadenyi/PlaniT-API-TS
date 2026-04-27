import mongoose, { Schema } from "mongoose";
import { IUserUpdateHistory } from "../types/models";

const userUpdateHistorySchema = new Schema<IUserUpdateHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedByRole: {
      type: String,
      enum: ["super_admin", "admin", "planner", "viewer"],
      required: true,
    },
    changes: [
      {
        field: String,
        oldValue: Schema.Types.Mixed,
        newValue: Schema.Types.Mixed,
      },
    ],
    type: {
      type: String,
      enum: [
        "profile_update",
        "password_change",
        "role_change",
        "deactivation",
        "reactivation",
      ],
      default: "profile_update",
    },
    description: String,
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
  },
);

// Index for faster queries
userUpdateHistorySchema.index({ userId: 1, createdAt: -1 });
userUpdateHistorySchema.index({ updatedBy: 1 });

export default mongoose.model<IUserUpdateHistory>(
  "UserUpdateHistory",
  userUpdateHistorySchema,
);

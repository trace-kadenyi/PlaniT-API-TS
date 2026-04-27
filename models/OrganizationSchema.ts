import mongoose, { Schema } from "mongoose";
import { IOrganization } from "../types/models";

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      trim: true,
    },
    plan: {
      type: String,
      enum: ["free", "premium", "enterprise"],
      default: "free",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    settings: {
      allowExternalEmails: {
        type: Boolean,
        default: true, // Allow any email domains
      },
      defaultUserRole: {
        type: String,
        enum: ["admin", "planner", "viewer"],
        default: "viewer",
      },
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IOrganization>(
  "Organization",
  organizationSchema,
);

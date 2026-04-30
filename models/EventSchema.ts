import mongoose, { Schema } from "mongoose";
import { IEvent } from "../types/models";

const eventSchema = new Schema<IEvent>(
  {
    name: {
      type: String,
      maxlength: [70, "Event name must be 70 characters or fewer"],
      required: [true, "Event name is required"],
    },
    description: {
      type: String,
      maxlength: [300, "Description must be 300 characters or fewer"],
      required: [true, "Description is required"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      index: true,
      // get: (date: Date) => date?.toISOString(),
    },
    location: {
      venue: {
        type: String,
        required: [true, "Venue is required"],
      },
      address: String,
      city: {
        type: String,
        required: [true, "City is required"],
      },
      country: {
        type: String,
        required: [true, "Country is required"],
      },
    },
    status: {
      type: String,
      enum: ["Planning", "In Progress", "Completed", "Cancelled"],
      default: "Planning",
    },
    type: {
      type: String,
      required: [true, "Type of Event is required"],
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Event must have a creator"],
    },
    assignedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    client: {
      type: Schema.Types.ObjectId,
      ref: "Client",
    },
    vendors: [
      {
        type: Schema.Types.ObjectId,
        ref: "Vendor",
      },
    ],
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: Date,

    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
    // Enable getters when converting to JSON
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

export default mongoose.model<IEvent>("Event", eventSchema);

import mongoose, { Schema } from "mongoose";
import { IClient } from "../types/models";

const clientSchema = new Schema<IClient>(
  {
    name: {
      type: String,
      required: true,
    },
    contact: {
      email: String,
      phone: String,
    },
    preferences: {
      type: String,
      maxlength: [150, "Description must be 150 characters or fewer"],
    },
    notes: {
      type: String,
      maxlength: [200, "Description must be 200 characters or fewer"],
    },
    company: {
      type: String,
      default: "Individual",
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      // soft deletion flag
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    archivedAt: Date,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// Add middleware to handle population of deleted clients
// clientSchema.post("find", function (docs) {
//   docs.forEach((doc) => {
//     if (doc.isDeleted) {
//       doc.name = `${doc.name} (Deleted)`;
//     }
//   });
// });

// clientSchema.post("findOne", function (doc) {
//   if (doc && doc.isDeleted) {
//     doc.name = `${doc.name} (Deleted)`;
//   }
// });

export default mongoose.model<IClient>("Client", clientSchema);

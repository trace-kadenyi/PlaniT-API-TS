import { Request, Response } from "express";
import Vendor from "../models/VendorSchema";

const MAX_NOTES = 200;

// Create new vendor
const createVendor = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check notes length if provided
    if (req.body.notes && req.body.notes.length > MAX_NOTES) {
      res.status(400).json({
        error: "ValidationError",
        message: `Vendor notes cannot exceed ${MAX_NOTES} characters`,
        field: "notes",
        maxLength: MAX_NOTES,
        currentLength: req.body.notes.length,
      });
      return;
    }

    const vendorData = {
      ...req.body,
      organizationId: req.user.organization,
      createdBy: req.user._id,
    };

    const vendor = await Vendor.create(vendorData);

    res.status(201).json(vendor);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ValidationError") {
      res.status(400).json({
        message: Object.values((err as any).errors)
          .map((e: any) => e.message)
          .join(", "),
      });
      return;
    }
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

// Get all vendors
const getAllVendors = async (req: Request, res: Response): Promise<void> => {
  try {
    const { service, archived } = req.query;

    // filter by org
    const filter: Record<string, unknown> = {
      organizationId: req.user.organization,
      isDeleted: false,
    };

    if (service) {
      filter.services = service;
    }
    // Viewers cannot see archived vendors
    if (req.user.role === "viewer") {
      filter.isArchived = false;
    }

    if (archived !== undefined) {
      // Only apply archived filter for non-viewers
      if (req.user.role !== "viewer") {
        filter.isArchived = archived === "true";
      }
    }

    const vendors = await Vendor.find(filter).sort({ name: 1 });
    res.json(vendors);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

// Get vendor by ID
const getVendorById = async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await Vendor.findOne({
      _id: req.params.id,
      organizationId: req.user.organization,
      isDeleted: false,
    });

    if (!vendor) {
      res.status(404).json({ message: "Vendor not found" });
      return;
    }

    // Block viewers from accessing archived vendors directly
    if (vendor.isArchived && req.user.role === "viewer") {
      res.status(403).json({
        message: "You do not have permission to view archived vendors.",
      });
      return;
    }
    const vendorData = vendor.toObject();

    res.json(vendorData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

// Update vendor
const updateVendor = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check notes length if provided in update
    if (req.body.notes && req.body.notes.length > MAX_NOTES) {
      res.status(400).json({
        error: "ValidationError",
        message: `Notes cannot exceed ${MAX_NOTES} characters`,
        field: "notes",
        maxLength: MAX_NOTES,
        currentLength: req.body.notes.length,
      });
      return;
    }

    const updatedVendor = await Vendor.findOneAndUpdate(
      {
        _id: req.params.id,
        organizationId: req.user.organization,
        isDeleted: false,
      },
      req.body,
      { new: true, runValidators: true },
    );

    if (!updatedVendor) {
      res.status(404).json({ message: "Vendor not found" });
      return;
    }

    if (updatedVendor.isArchived) {
      res.status(409).json({
        message: "Cannot update an archived vendor. Unarchive it first.",
      });
      return;
    }

    res.json(updatedVendor);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ValidationError") {
      res.status(400).json({
        message: Object.values((err as any).errors)
          .map((e: any) => e.message)
          .join(", "),
      });
      return;
    }
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

// Archive/unarchive vendor
const toggleVendorArchive = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const vendor = await Vendor.findOne({
      _id: req.params.id,
      organizationId: req.user.organization,
      isDeleted: false,
    });

    if (!vendor) {
      res.status(404).json({ message: "Vendor not found" });
      return;
    }

    vendor.isArchived = !vendor.isArchived;
    await vendor.save();

    res.json({
      message: `Vendor ${
        vendor.isArchived ? "archived" : "unarchived"
      } successfully`,
      vendor,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

// Get vendor statistics
const getVendorStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await Vendor.aggregate([
      {
        $match: {
          organizationId: req.user.organization,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$services",
          count: { $sum: 1 },
          archived: { $sum: { $cond: [{ $eq: ["$isArchived", true] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

// Soft-delete vendor
const deleteVendor = async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await Vendor.findOneAndUpdate(
      {
        _id: req.params.id,
        organizationId: req.user.organization,
        isDeleted: false,
      },
      {
        isDeleted: true,
        isArchived: false,
        deletedAt: new Date(),
      },
      { new: true },
    );

    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }

    res.json({
      message: "Vendor deleted successfully",
      deletedVendor: {
        _id: vendor._id,
        name: `${vendor.name} (Deleted)`,
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

// Soft-delete all vendors
const deleteAllVendors = async (req: Request, res: Response): Promise<void> => {
  try {
    // Delete all vendors
    const deletedVendors = await Vendor.updateMany(
      {
        organizationId: req.user.organization,
        isDeleted: false,
      },
      {
        isDeleted: true,
        isArchived: false,
        deletedAt: new Date(),
      },
    );
    res.json({
      message: "All vendors deleted successfully",
      deletedCount: deletedVendors.modifiedCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

export {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  toggleVendorArchive,
  getVendorStats,
  deleteVendor,
  deleteAllVendors,
};

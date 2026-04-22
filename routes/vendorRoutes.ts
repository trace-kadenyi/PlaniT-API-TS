import express, { Router } from "express";

import {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  toggleVendorArchive,
  getVendorStats,
  deleteVendor,
  deleteAllVendors,
} from "../controllers/vendorController";
import { authorize } from "../middleware/authmiddleware";
import { PERMISSIONS, RESOURCES } from "../services/permissionService";

import authController from "../controllers/authController";

const router: Router = express.Router();

// ========== PROTECT ALL ROUTES ==========
router.use(authController.protect);

// Create vendor
router.post("/", authorize(PERMISSIONS.CREATE, RESOURCES.VENDOR), createVendor);

// Get all vendors
router.get("/", authorize(PERMISSIONS.VIEW, RESOURCES.VENDOR), getAllVendors);

// Get vendor stats
router.get(
  "/stats",
  authorize(PERMISSIONS.VIEW, RESOURCES.VENDOR),
  getVendorStats,
);

// Get single vendor
router.get(
  "/:id",
  authorize(PERMISSIONS.VIEW, RESOURCES.VENDOR),
  getVendorById,
);

// Update vendor
router.put("/:id", authorize(PERMISSIONS.EDIT, RESOURCES.VENDOR), updateVendor);

// Archive/unarchive vendor
router.patch(
  "/:id/archive",
  authorize(PERMISSIONS.ARCHIVE, RESOURCES.VENDOR),
  toggleVendorArchive,
);

// DELETE /api/vendor/id
router.delete(
  "/:id",
  authorize(PERMISSIONS.DELETE, RESOURCES.VENDOR),
  deleteVendor,
);

// DELETE /api/vendors
router.delete(
  "/",
  authorize(PERMISSIONS.DELETE_ALL, RESOURCES.VENDOR),
  deleteAllVendors,
);

export default router;

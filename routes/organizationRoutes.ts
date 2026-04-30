import express, { Router } from "express";

import {
  getOrganizationDetails,
  updateOrganization,
} from "../controllers/organizationController";
import * as authController from "../controllers/authController";
import { authorize } from "../middleware/authmiddleware";
import { PERMISSIONS, RESOURCES } from "../services/permissionService";

const router: Router = express.Router();

// 🔐 Protect all routes
router.use(authController.protect);

// get org details
router.get(
  "/",
  authorize(PERMISSIONS.VIEW, RESOURCES.ORGANIZATION),
  getOrganizationDetails,
);

// PATCH route - Super Admin only
router.patch(
  "/",
  authorize(PERMISSIONS.EDIT, RESOURCES.ORGANIZATION),
  updateOrganization,
);

export default router;

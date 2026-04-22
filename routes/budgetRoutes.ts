import express, { Router } from "express";

import {
  getBudgetByEventId,
  updateBudget,
} from "../controllers/budgetController";
import { authorize } from "../middleware/authmiddleware";
import { PERMISSIONS, RESOURCES } from "../services/permissionService";
import authController from "../controllers/authController";

const router: Router = express.Router();
// protect all routes
router.use(authController.protect);

// Get budget by event ID
router.get(
  "/:eventId",
  authorize(PERMISSIONS.VIEW, RESOURCES.BUDGET),
  getBudgetByEventId,
);

// Update event by ID
router.put(
  "/:eventId",
  authorize(PERMISSIONS.EDIT, RESOURCES.BUDGET),
  updateBudget,
);

export default router;

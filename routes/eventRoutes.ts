import express, { Router } from "express";

import {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  archiveEvent,
  restoreEvent,
} from "../controllers/eventController";
import * as authController from "../controllers/authController";
import { authorize } from "../middleware/authmiddleware";
import { PERMISSIONS, RESOURCES } from "../services/permissionService";

const router: Router = express.Router();
// 🔐 Protect all routes
router.use(authController.protect);

// Create new event
router.post("/", authorize(PERMISSIONS.CREATE, RESOURCES.EVENT), createEvent);

// Get all events
router.get("/", authorize(PERMISSIONS.VIEW, RESOURCES.EVENT), getAllEvents);

// Get event by ID
router.get("/:id", authorize(PERMISSIONS.VIEW, RESOURCES.EVENT), getEventById);

// Update event by ID
router.put("/:id", authorize(PERMISSIONS.EDIT, RESOURCES.EVENT), updateEvent);

// Archive event
router.patch(
  "/:id/archive",
  authorize(PERMISSIONS.ARCHIVE, RESOURCES.EVENT),
  archiveEvent,
);

// Restore archived event
router.patch(
  "/:id/restore",
  authorize(PERMISSIONS.ARCHIVE, RESOURCES.EVENT),
  restoreEvent,
);

// Delete event by ID
router.delete(
  "/:id",
  authorize(PERMISSIONS.DELETE, RESOURCES.EVENT),
  deleteEvent,
);

export default router;

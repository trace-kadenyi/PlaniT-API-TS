import express, { Router } from "express";

import {
  createClient,
  getAllClients,
  getClientWithEvents,
  updateClient,
  archiveClient,
  restoreClient,
  deleteClient,
  deleteAllClients,
} from "../controllers/clientController";
import { authorize } from "../middleware/authmiddleware";
import { PERMISSIONS, RESOURCES } from "../services/permissionService";

import * as authController from "../controllers/authController";

const router: Router = express.Router();

// ========== PROTECT ALL ROUTES ==========
router.use(authController.protect);

// POST /api/clients
router.post("/", authorize(PERMISSIONS.CREATE, RESOURCES.CLIENT), createClient);

// GET /api/clients
router.get("/", authorize(PERMISSIONS.VIEW, RESOURCES.CLIENT), getAllClients);

// GET /api/clients/:id
router.get(
  "/:id",
  authorize(PERMISSIONS.VIEW, RESOURCES.CLIENT),
  getClientWithEvents,
);

// PUT /api/clients/:id
router.put("/:id", authorize(PERMISSIONS.EDIT, RESOURCES.CLIENT), updateClient);

// PATCH /api/clients/id/archive
router.patch(
  "/:id/archive",
  authorize(PERMISSIONS.ARCHIVE, RESOURCES.CLIENT),
  archiveClient,
);

// PATCH /api/clients/id/restore
router.patch(
  "/:id/restore",
  authorize(PERMISSIONS.ARCHIVE, RESOURCES.CLIENT),
  restoreClient,
);

// DELETE /api/clients/id
router.delete(
  "/:id",
  authorize(PERMISSIONS.DELETE, RESOURCES.CLIENT),
  deleteClient,
);

// DELETE /api/clients
router.delete(
  "/",
  authorize(PERMISSIONS.DELETE_ALL, RESOURCES.CLIENT),
  deleteAllClients,
);

export default router;

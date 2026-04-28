import express, { Router } from "express";

import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  updateUserRole,
  deleteUser,
  getUserUpdateHistory,
  reactivateUser,
} from "../controllers/userController";
import * as authController from "../controllers/authController";
import { authorize } from "../middleware/authmiddleware";
import { PERMISSIONS, RESOURCES } from "../services/permissionService";

const router: Router = express.Router();

// 🔐 Protect all routes
router.use(authController.protect);

// Get all users in organization
router.get("/", authorize(PERMISSIONS.VIEW, RESOURCES.USER), getUsers);

// Get single user
router.get("/:userId", authorize(PERMISSIONS.VIEW, RESOURCES.USER), getUser);

// Get user's update history
router.get(
  "/:userId/history",
  authorize(PERMISSIONS.VIEW, RESOURCES.USER_HISTORY),
  getUserUpdateHistory,
);

// Add new user
router.post(
  "/",
  authorize(PERMISSIONS.MANAGE_USERS, RESOURCES.USER),
  createUser,
);

// Update user details
router.patch(
  "/:userId",
  authorize(PERMISSIONS.EDIT, RESOURCES.USER),
  updateUser,
);

// Update user role
router.patch(
  "/:userId/role",
  authorize(PERMISSIONS.MANAGE_USERS, RESOURCES.USER),
  updateUserRole,
);

// Delete user
router.delete(
  "/:userId",
  authorize(PERMISSIONS.DELETE, RESOURCES.USER),
  deleteUser,
);

// reactivate user
router.patch(
  "/:userId/reactivate",
  authorize(PERMISSIONS.MANAGE_USERS, RESOURCES.USER),
  reactivateUser,
);

export default router;

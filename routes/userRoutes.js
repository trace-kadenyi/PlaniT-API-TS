const express = require("express");
const router = express.Router();
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  updateUserRole,
  deleteUser,
  getUserUpdateHistory,
  reactivateUser,
} = require("../controllers/userController");
const authController = require("../controllers/authController");
const { authorize } = require("../middleware/authmiddleware");
const { PERMISSIONS, RESOURCES } = require("../services/permissionService");

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

module.exports = router;

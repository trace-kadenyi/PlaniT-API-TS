import express, { Router } from "express";


import {
  getAllTasks,
  createTask,
  updateTask,
  getTaskById,
  deleteTask,
} from "../controllers/taskController";
import * as authController from "../controllers/authController";
import { authorize } from "../middleware/authmiddleware";
import { PERMISSIONS, RESOURCES } from "../services/permissionService";

const router: Router = express.Router();

// 🔐 Protect all task routes
router.use(authController.protect);

// Get all tasks
router.get("/", authorize(PERMISSIONS.VIEW, RESOURCES.TASK), getAllTasks);

// Create a new task
router.post("/", authorize(PERMISSIONS.CREATE, RESOURCES.TASK), createTask);

// Get task by id
router.get("/:id", authorize(PERMISSIONS.VIEW, RESOURCES.TASK), getTaskById);

// Update a task by ID
router.put("/:id", authorize(PERMISSIONS.EDIT, RESOURCES.TASK), updateTask);

// Delete a task by ID
router.delete(
  "/:id",
  authorize(PERMISSIONS.DELETE, RESOURCES.TASK),
  deleteTask,
);

export default router;

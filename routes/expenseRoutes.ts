import express, { Router } from "express";

import {
  createExpense,
  getExpensesByEventId,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getExpensesSummary,
  getAllExpenses,
  getBudgetStatusForAllEvents,
  getExpenseAuditLogs,
  getDeletedEventExpenseLogs,
} from "../controllers/expenseController";

import authController from "../controllers/authController";
import { authorize } from "../middleware/authmiddleware";
import { PERMISSIONS, RESOURCES } from "../services/permissionService";

const router: Router = express.Router();

// 🔐 Protect all routes
router.use(authController.protect);

// 🔴 Audit log for deleted events
router.get(
  "/audit-logs/deleted-events",
  authorize(PERMISSIONS.VIEW_AUDIT_LOGS, RESOURCES.AUDIT_LOG),
  getDeletedEventExpenseLogs,
);

// Audit logs
router.get(
  "/audit-logs",
  authorize(PERMISSIONS.VIEW_AUDIT_LOGS, RESOURCES.AUDIT_LOG),
  getExpenseAuditLogs,
);

// get budget status
router.get(
  "/budget-status",
  authorize(PERMISSIONS.VIEW, RESOURCES.EXPENSE),
  getBudgetStatusForAllEvents,
);

// get expenses by event id
router.get(
  "/event/:eventId",
  authorize(PERMISSIONS.VIEW, RESOURCES.EXPENSE),
  getExpensesByEventId,
);

// get all expenses
router.get("/", authorize(PERMISSIONS.VIEW, RESOURCES.EXPENSE), getAllExpenses);

// create expense
router.post(
  "/",
  authorize(PERMISSIONS.CREATE, RESOURCES.EXPENSE),
  createExpense,
);

// expenses summary
router.get(
  "/:eventId/summary",
  authorize(PERMISSIONS.VIEW, RESOURCES.EXPENSE),
  getExpensesSummary,
);

// get single expense
router.get(
  "/:id",
  authorize(PERMISSIONS.VIEW, RESOURCES.EXPENSE),
  getExpenseById,
);

// update expense
router.put(
  "/:id",
  authorize(PERMISSIONS.EDIT, RESOURCES.EXPENSE),
  updateExpense,
);

// delete expense
router.delete(
  "/:id",
  authorize(PERMISSIONS.DELETE, RESOURCES.EXPENSE),
  deleteExpense,
);

export default router;

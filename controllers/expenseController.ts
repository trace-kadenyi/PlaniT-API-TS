import { Request, Response } from "express";
import mongoose from "mongoose";

import Event from "../models/EventSchema";
import Expense from "../models/ExpenseSchema";
import Budget from "../models/BudgetSchema";
import ExpenseAuditLog from "../models/ExpenseAuditLogSchema";
import Vendor from "../models/VendorSchema";
import { getBudgetStatus } from "../utils/budgetHelpers";
import {
  getChangedFields,
  determineActionType,
  logExpenseAction,
} from "../utils/auditHelpers";
import { IEvent } from "../types/models";

const MAX_DESCRIPTION = 150;
const MAX_NOTES = 200;

interface ValidationError {
  error: string;
  message: string;
  field: string;
  maxLength: number;
  currentLength: number;
}

//  validate field lengths
const validateFieldLengths = (
  body: Record<string, any>,
): ValidationError | null => {
  if (body.description && body.description.length > MAX_DESCRIPTION) {
    return {
      error: "ValidationError",
      message: `Description cannot exceed ${MAX_DESCRIPTION} characters`,
      field: "description",
      maxLength: MAX_DESCRIPTION,
      currentLength: body.description.length,
    };
  }
  if (body.notes && body.notes.length > MAX_NOTES) {
    return {
      error: "ValidationError",
      message: `Notes cannot exceed ${MAX_NOTES} characters`,
      field: "notes",
      maxLength: MAX_NOTES,
      currentLength: body.notes.length,
    };
  }
  return null;
};

// Create new expense
const createExpense = async (req: Request, res: Response): Promise<void> => {
  try {
    const eventId = req.body.eventId;

    // Check description and notes length if provided
    const validationError = validateFieldLengths(req.body);
    if (validationError) {
      res.status(400).json(validationError);
      return;
    }

    // Fetch event, budget status, and vendor all in parallel
    const [event, budgetStatus, vendorCheck] = await Promise.all([
      Event.findOne({ _id: eventId, organizationId: req.user.organization }),
      getBudgetStatus(eventId, req.user.organization),
      req.body.vendor
        ? Vendor.findOne({
            _id: req.body.vendor,
            organizationId: req.user.organization,
            isDeleted: false,
          })
        : Promise.resolve(true), // no vendor supplied — skip check
    ]);
    // 3️⃣ Event validation
    if (!event) {
      res.status(404).json({
        error: "EventNotFound",
        message: "Event not found or does not belong to your organization",
      });
      return;
    }

    if (event.isArchived) {
      res.status(403).json({
        error: "EventArchived",
        message:
          "Cannot add expenses for archived events. Please restore the event first.",
      });
      return;
    }

    // budget validation
    if (budgetStatus.totalBudget === 0) {
      res.status(404).json({
        error: "BudgetNotFound",
        message: "Event budget not found",
      });
      return;
    }

    // Vendor validation
    if (req.body.vendor && !vendorCheck) {
      res.status(400).json({
        error: "InvalidVendor",
        message: "Selected vendor does not exist or has been removed",
      });
      return;
    }

    // control: expense must be less than remaining budget
    if (req.body.amount > budgetStatus.remainingBudget) {
      res.status(400).json({
        message: `Expense exceeds remaining budget ($${budgetStatus.remainingBudget.toFixed(
          2,
        )} available). Top up your overall budget with $${(
          req.body.amount - budgetStatus.remainingBudget
        ).toFixed(2)} to add this expense.`,
        remainingBudget: budgetStatus.remainingBudget,
        attemptedAmount: req.body.amount,
      });
      return;
    }

    // Add createdBy from authenticated user
    const expenseData = {
      ...req.body,
      organizationId: event.organizationId,
      createdBy: req.user._id,

      createdBySnapshot: {
        _id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        role: req.user.role,
      },
    };

    const expense = new Expense(expenseData);
    // Save expense and fetch budget in parallel
    const [, budget] = await Promise.all([
      expense.save(),
      Budget.findOne({ eventId, organizationId: expense.organizationId }),
    ]);

    if (!budget) {
      throw new Error("Budget missing after validation");
    }

    if (expense.paymentStatus === "paid") {
      budget.spentAmount += expense.amount;
    } else {
      budget.reservedAmount += expense.amount;
    }

    // Save budget and populate expense in parallel
    const [populatedExpense] = await Promise.all([
      Expense.findById(expense._id)
        .populate("vendor", "name services")
        .populate("createdBy", "firstName lastName email"),
      budget.save(),
    ]);

    res.status(201).json({
      expense: populatedExpense,
      budgetStatus: await getBudgetStatus(
        req.body.eventId,
        req.user.organization,
      ),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ValidationError") {
      res.status(400).json({
        message: Object.values((err as any).errors)
          .map((e: any) => e.message)
          .join(", "),
      });
      return;
    }
    const message = err instanceof Error ? err.message : "An error occurred.";
    res.status(500).json({ message });
  }
};

// Get all expenses
const getAllExpenses = async (req: Request, res: Response): Promise<void> => {
  try {
    const expenses = await Expense.find({
      organizationId: req.user.organization,
    });

    res.json(expenses);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ message });
  }
};

// Get all expenses for an event
const getExpensesByEventId = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const expenses = await Expense.find({
      eventId: req.params.eventId,
      organizationId: req.user.organization,
    })
      .populate("vendor", "name services isArchived isDeleted")
      .populate("createdBy", "firstName lastName email isActive")
      .populate("updatedBy", "firstName lastName email isActive")
      .sort({ createdAt: -1 });

    const budgetStatus = await getBudgetStatus(
      req.params.eventId as string,
      req.user.organization,
    );

    // Always return success with empty array if no expenses exist
    res.json({
      expenses: expenses || [],
      budgetStatus,
    });
  } catch {
    // Return empty state instead of error
    res.json({
      expenses: [],
      budgetStatus: {
        totalBudget: 0,
        totalExpenses: 0,
        remainingBudget: 0,
        budgetExists: false,
      },
    });
  }
};

// Get expense by ID
const getExpenseById = async (req: Request, res: Response): Promise<void> => {
  try {
    const expense = await Expense.findOne({
      _id: req.params.id,
      organizationId: req.user.organization,
    })
      .populate("vendor", "name services isDeleted")
      .populate("createdBy", "firstName lastName email isActive")
      .populate("updatedBy", "firstName lastName email isActive");

    if (!expense) {
      {
        res.status(404).json({ message: "Expense not found" });
        return;
      }
    }

    res.json(expense);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ message });
  }
};

// Update expense
const updateExpense = async (req: Request, res: Response): Promise<void> => {
  try {
    const existingExpense = req.targetExpense;

    // 🔒 Planners can only edit expenses they created
    const isPlanner = req.user.role === "planner";
    const isOwner =
      existingExpense.createdBy.toString() === req.user._id.toString();

    if (isPlanner && !isOwner) {
      res.status(403).json({
        error: "Forbidden",
        code: "INSUFFICIENT_PERMISSION",
        message: "Planners can only edit expenses that they created.",
      });
      return;
    }

    // cache event id
    const eventId = existingExpense.eventId;

    // Check description and notes length if provided in update
    const validationError = validateFieldLengths(req.body);
    if (validationError) {
      res.status(400).json(validationError);
      return;
    }

    // Fetch event, budget, and budget status all in parallel
    const [event, budget, budgetStatusBefore] = await Promise.all([
      Event.findOne({ _id: eventId, organizationId: req.user.organization }),
      Budget.findOne({ eventId, organizationId: req.user.organization }),
      getBudgetStatus(eventId, req.user.organization),
    ]);

    if (!event) {
      res.status(404).json({
        error: "EventNotFound",
        message: "Associated event not found",
      });
      return;
    }
    if (event.isArchived) {
      res.status(403).json({
        error: "EventArchived",
        message:
          "Cannot update expenses for archived events. Please restore the event first.",
      });
      return;
    }

    // PREVENT EDITING OF PAID EXPENSES
    if (existingExpense.paymentStatus === "paid") {
      res.status(400).json({
        error: "CannotEditPaidExpense",
        message: "Paid expenses cannot be edited",
        resolution: "If changes are needed, delete and recreate the expense",
      });
      return;
    }

    // 4️⃣ Budget math (only if budget exists)
    const oldAmount = existingExpense.amount;
    const newAmount = req.body.amount ?? oldAmount;
    const delta = newAmount - oldAmount;

    if (budget && existingExpense.paymentStatus === "pending") {
      if (budget.remainingBudget < delta) {
        res.status(400).json({
          message: `Update would exceed remaining budget by $${delta.toFixed(
            2,
          )}. Please work within the available budget or increase it.`,
          remainingBudget: budget.remainingBudget,
        });
        return;
      }
    }

    // Prevent assigning deleted vendors on update
    if (
      req.body.vendor &&
      req.body.vendor !== existingExpense.vendor?.toString()
    ) {
      const vendor = await Vendor.findOne({
        _id: req.body.vendor,
        organizationId: req.user.organization,
        isDeleted: false,
      });

      if (!vendor) {
        res.status(400).json({
          error: "InvalidVendor",
          message: "Selected vendor does not exist or has been removed",
        });
        return;
      }
    }

    // Add updatedBy to the update data
    const { createdBy, ...safeUpdateData } = req.body; // Remove createdBy from request body
    const updateData = {
      ...safeUpdateData, // Spread everything EXCEPT createdBy
      updatedBy: req.user._id, // Set the user who made the update
    };

    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true },
    )
      .populate("vendor", "name services isDeleted")
      .populate("createdBy", "firstName lastName email isActive")
      .populate("updatedBy", "firstName lastName email isActive");

    // budget handling
    if (budget && existingExpense.paymentStatus === "pending") {
      budget.reservedAmount -= oldAmount;
      budget.reservedAmount += newAmount;
    }

    if (
      budget &&
      existingExpense.paymentStatus === "pending" &&
      updatedExpense.paymentStatus === "paid"
    ) {
      budget.reservedAmount -= updatedExpense.amount;
      budget.spentAmount += updatedExpense.amount;
    }
    if (budget) {
      await budget.save();
    }
    // ALWAYS log the update
    const changes = getChangedFields(existingExpense, updatedExpense);
    const budgetStatusAfter = await getBudgetStatus(
      eventId,
      req.user.organization,
    );

    logExpenseAction({
      actionType: determineActionType(changes, false, false),
      expense: updatedExpense,
      previousExpense: existingExpense,
      user: req.user,
      reason: "Expense updated",
      description: `Updated expense: ${updatedExpense.description} (${changes.length} fields changed)`,
      budgetStatusBefore,
      budgetStatusAfter,
      req,
    });

    res.json({
      expense: updatedExpense,
      budgetStatus: budgetStatusAfter,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ValidationError") {
      res.status(400).json({
        message: Object.values((err as any).errors)
          .map((e: any) => e.message)
          .join(", "),
      });
      return;
    }
    const message = err instanceof Error ? err.message : "An error occurred.";
    res.status(500).json({ message });
  }
};

// Delete expense
const deleteExpense = async (req: Request, res: Response): Promise<void> => {
  try {
    const expense = req.targetExpense;

    // 2️⃣ Fetch event + budget in parallel
    const [event, budget] = await Promise.all([
      Event.findOne({
        _id: expense.eventId,
        organizationId: req.user.organization,
      }),
      Budget.findOne({
        eventId: expense.eventId,
        organizationId: req.user.organization,
      }),
    ]);

    if (!event) {
      res.status(404).json({ message: "Associated event not found" });
      return;
    }

    // 🚫 PREVENT DELETING EXPENSES FOR ARCHIVED EVENTS
    if (event.isArchived) {
      res.status(403).json({
        error: "EventArchived",
        message:
          "Cannot delete expenses for archived events. Please restore the event first.",
      });
      return;
    }

    if (event.status === "Completed") {
      res.status(400).json({
        message: "Cannot delete expenses for completed events",
        resolution: "Please reopen the event if changes are needed",
      });
      return;
    }

    if (!budget) {
      res.status(404).json({ message: "Associated budget not found" });
      return;
    }

    // 4️⃣ Budget snapshot BEFORE mutation
    const budgetStatusBefore = await getBudgetStatus(
      expense.eventId,
      req.user.organization,
    );

    // 🔄 Mutate budget safely
    if (expense.paymentStatus === "pending") {
      budget.reservedAmount -= expense.amount;
    }

    if (expense.paymentStatus === "paid") {
      budget.deletedPaidTotal += expense.amount;
    }

    // 6️⃣ Save budget + delete expense in parallel
    const [_, deletedExpense] = await Promise.all([
      budget.save(),
      Expense.findByIdAndDelete(expense._id),
    ]);

    // 7️⃣ Budget snapshot AFTER mutation
    const budgetStatusAfter = await getBudgetStatus(
      expense.eventId,
      req.user.organization,
    );

    // 📝 Log AFTER mutation
    logExpenseAction({
      actionType: "DELETE",
      expense,
      user: req.user,
      reason:
        expense.paymentStatus === "paid"
          ? "Paid expense deleted by super administrator"
          : "Expense deleted",
      description: `Deleted expense: ${expense.description} (${expense.paymentStatus}, $${expense.amount})`,
      budgetStatusBefore,
      budgetStatusAfter,
      req,
    });

    res.json({
      message: "Expense deleted successfully",
      budgetStatus: budgetStatusAfter,
      deletedExpense: {
        _id: deletedExpense._id,
        amount: deletedExpense.amount,
        category: deletedExpense.category,
        description: deletedExpense.description,
        date: deletedExpense.createdAt,
        wasPaid: deletedExpense.paymentStatus === "paid",
        deletedBy: {
          id: req.user._id,
          name: `${req.user.firstName} ${req.user.lastName}`,
          role: req.user.role,
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred.";
    res.status(500).json({
      message: "Failed to delete expense",
      systemMessage: message,
      errorCode: "EXPENSE_DELETION_FAILED",
    });
  }
};

// Get expenses summary by category
const getExpensesSummary = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const summary = await Expense.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(String(req.params.eventId)),
          organizationId: new mongoose.Types.ObjectId(
            String(req.user.organization),
          ),
        },
      },
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({
      categories: summary,
      budgetStatus: await getBudgetStatus(
        req.params.eventId as string,
        req.user.organization,
      ),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ message });
  }
};

// get budget status for all events
const getBudgetStatusForAllEvents = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const budgets = await Budget.find({
      organizationId: req.user.organization,
    }).populate("eventId", "name");

    const response = budgets.map((b) => ({
      eventId: (b.eventId as any)._id,
      eventName: (b.eventId as any).name,
      budgetStatus: {
        totalBudget: b.totalBudget,
        spentAmount: b.spentAmount,
        reservedAmount: b.reservedAmount,
        remainingBudget: b.remainingBudget,
      },
    }));

    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res
      .status(500)
      .json({ message: "Failed to get budget status", error: message });
  }
};

// Get expense audit logs
const getExpenseAuditLogs = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      eventId,
      actionType,
      startDate,
      endDate,
      limit = 100,
      userId,
    } = req.query;
    let query: Record<string, any> = {
      organizationId: req.user.organization,
    };

    // FIXED: Proper event filtering
    if (eventId && mongoose.Types.ObjectId.isValid(eventId as string)) {
      query.eventId = eventId;
    }

    if (actionType) query.actionType = actionType;
    if (userId && req.user.role === "super_admin") query.performedBy = userId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const logs = await ExpenseAuditLog.find(query)
      .populate("eventId", "name")
      .populate("performedBy", "firstName lastName email role")
      .populate("expenseId", "description amount category paymentStatus")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string));

    const populatedLogs = await Promise.all(
      logs.map(async (log) => {
        // Create a copy of the log
        const logObj = log.toObject();

        // Determine which data to use
        let expenseData: Record<string, any> = {};
        if (log.actionType === "DELETE" && log.deletedData) {
          expenseData = { ...(log.deletedData as object) };
        } else if (log.newData) {
          expenseData = { ...(log.newData as object) };
        } else if (log.previousData) {
          expenseData = { ...(log.previousData as object) };
        }

        expenseData.createdBy = expenseData.createdBySnapshot;

        // MANUALLY populate vendor if it's an ObjectId
        if (
          expenseData.vendor &&
          mongoose.Types.ObjectId.isValid(expenseData.vendor)
        ) {
          try {
            const vendor = await Vendor.findById(
              expenseData.vendor,
              "name services email phone isDeleted",
            );
            expenseData.vendor = vendor || {
              _id: expenseData.vendor,
              name: "Unknown Vendor",
            };
          } catch (err) {
            console.error("Error populating vendor:", err.message);
            expenseData.vendor = {
              _id: expenseData.vendor,
              name: "Unknown Vendor",
            };
          }
        }

        return {
          ...logObj,
          expenseData: expenseData,
        };
      }),
    );

    // Format for frontend
    const formattedLogs = populatedLogs.map((log) => {
      return {
        _id: log._id,
        expenseId: log.expenseId?._id || log.expenseId,
        performedBy: log.performedBy,
        performedBySnapshot: log.performedBySnapshot,
        createdAt: log.createdAt,
        expenseData: {
          description: log.expenseData?.description,
          amount: log.expenseData?.amount,
          category: log.expenseData?.category,
          vendor: log.expenseData?.vendor,
          paymentStatus: log.expenseData?.paymentStatus,
          paymentDate: log.expenseData?.paymentDate,
          dueDate: log.expenseData?.dueDate,
          notes: log.expenseData?.notes,
          receiptUrl: log.expenseData?.receiptUrl,
          createdAt: log.expenseData?.createdAt,
          createdBy: log.expenseData?.createdBy,
          createdBySnapshot: log.expenseData?.createdBySnapshot,
        },
        event: {
          _id: (log.eventId as unknown as IEvent)?._id || log.eventId,
          name: (log.eventId as unknown as IEvent)?.name || "Unknown Event",
        },
        deletedBy:
          log.actionType === "DELETE" ? log.performedBySnapshot : undefined,
        deletedAt: log.actionType === "DELETE" ? log.createdAt : undefined,
        reason: log.reason,
        metadata: log.budgetImpact
          ? {
              budgetRemainingBefore: log.budgetImpact.before?.remainingBudget,
              budgetRemainingAfter: log.budgetImpact.after?.remainingBudget,
            }
          : {},
        actionType: log.actionType,
        changes: log.changes || [],
      };
    });

    res.json({
      deletedPaidExpenses: formattedLogs,
      auditLogs: formattedLogs,
      count: formattedLogs.length,
      filters: { eventId, actionType, startDate, endDate, userId },
      userPermissions: {
        role: req.user.role,
        canViewAll: req.user.role === "super_admin",
      },
    });
  } catch (err) {
    console.error("Audit log error:", err);
    res.status(500).json({
      message: "Failed to fetch expense audit logs",
      error: err.message,
    });
  }
};

// 🔴 deleted events expense logs
const getDeletedEventExpenseLogs = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { eventId } = req.query;
    let query: Record<string, any> = {
      organizationId: req.user.organization,
      actionType: "EVENT_DELETE_CASCADE",
    };

    if (eventId && mongoose.Types.ObjectId.isValid(eventId as string)) {
      query.eventId = eventId;
    }

    const logs = await ExpenseAuditLog.find(query)
      .populate("eventId", "name")
      .populate("performedBy", "firstName lastName email role")
      .populate({
        path: "newData.vendor",
        select: "name email phone address",
        model: "Vendor",
      })
      .lean()
      .sort({ createdAt: -1 })
      .limit(parseInt((req.query.limit as string) || "100"));

    const formattedLogs = logs.map((log) => {
      const expenseData = (log.newData as Record<string, any>) || {};

      return {
        _id: log._id,
        expenseId: log.expenseId,
        eventId: log.eventId,
        // ✅ ADD THIS - Who deleted the event (the person who triggered the cascade)
        performedBy: log.performedBy,
        performedBySnapshot: log.performedBySnapshot, // ← CRITICAL!
        createdAt: log.createdAt,
        // ✅ ADD THIS - Who created the expense originally
        expenseData: {
          _id: log.expenseId,
          description: expenseData.description,
          amount: expenseData.amount,
          category: expenseData.category,
          vendor: expenseData.vendor,
          paymentStatus: expenseData.paymentStatus,
          paymentDate: expenseData.paymentDate,
          dueDate: expenseData.dueDate,
          notes: expenseData.notes,
          receiptUrl: expenseData.receiptUrl,
          createdAt: expenseData.createdAt,
          createdBy: expenseData.createdBy,
          createdBySnapshot: expenseData.createdBySnapshot, // ← CRITICAL!
        },
        event: {
          _id: log.eventId?._id || log.eventId,
          name:
            (log.eventId as any)?.name ||
            extractEventName(log) ||
            "Unknown Event",
        },
        // ✅ ADD THIS - Make it match the regular audit log structure
        deletedBy: log.performedBySnapshot, // For AuditLogsOverview component
        reason: log.reason,
        description: log.description,
        actionType: log.actionType,
        changes: log.changes || [], // Add changes array
        metadata: log.budgetImpact
          ? {
              budgetRemainingBefore: log.budgetImpact.before?.remainingBudget,
              budgetRemainingAfter: log.budgetImpact.after?.remainingBudget,
            }
          : {},
      };
    });

    // Group by event for frontend
    const groupedByEvent = formattedLogs.reduce((acc, log) => {
      const eventId =
        (log.eventId as any)?._id.toString() || String(log.eventId);
      if (!acc[eventId]) {
        acc[eventId] = {
          eventId,
          eventName: log.event?.name || "Unknown Event",
          deletedAt: log.createdAt,
          expenses: [],
          totalAmount: 0,
        };
      }
      acc[eventId].expenses.push(log);
      acc[eventId].totalAmount += log.expenseData?.amount || 0;
      return acc;
    }, {});

    res.json({
      success: true,
      logs: formattedLogs,
      groupedByEvent: Object.values(groupedByEvent),
      count: formattedLogs.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({
      message: "Failed to fetch deleted event expense logs",
      error: message,
    });
  }
};

// Helper function to extract event name from description
const extractEventName = (log: Record<string, any>): string | null => {
  const match = log.description?.match(/event "([^"]+)"/);
  return match ? match[1] : null;
};

export {
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
};

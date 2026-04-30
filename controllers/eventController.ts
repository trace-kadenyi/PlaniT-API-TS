import { Request, Response } from "express";
import mongoose from "mongoose";

import Event from "../models/EventSchema";
import Task from "../models/TaskSchema";
import Budget from "../models/BudgetSchema";
import Expense from "../models/ExpenseSchema";
import User from "../models/UserSchema";
import Client from "../models/ClientSchema";
import supabaseAdmin from "../utils/supabaseAdmin";
import { logExpenseAction } from "../utils/auditHelpers";

const maxChars = 300;
const maxNameChars = 70;
const maxSummaryChars = 200;

const validateEventFieldLengths = (
  data: Record<string, unknown>,
): { message: string } | null => {
  if (((data.name as string) || "").length > maxNameChars) {
    return { message: `Event name cannot exceed ${maxNameChars} characters.` };
  }
  if (((data.description as string) || "").length > maxChars) {
    return { message: `Description cannot exceed ${maxChars} characters.` };
  }
  if (((data.summary as string) || "").length > maxSummaryChars) {
    return {
      message: `Event summary cannot exceed ${maxSummaryChars} characters.`,
    };
  }
  return null;
};

// Date normalization middleware
const normalizeEventDate = (date: unknown): Date | null => {
  if (!date) return null;
  const d = new Date(date as string);
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
    ),
  );
};

// Create a new event
const createEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    // If assigning a client, check if that client exists and is not deleted
    if (req.body.client) {
      const client = await Client.findOne({
        _id: req.body.client,
        organizationId: req.user.organization,
        isDeleted: false,
        isArchived: false,
      });

      if (!client) {
        res.status(400).json({
          message:
            "Cannot assign a deleted, archived or non-existent client to an event",
        });
        return;
      }
    }

    // Normalize the date before creating
    const eventDate = normalizeEventDate(req.body.date);

    // Check if event date is in the past
    if (eventDate !== null && eventDate < new Date()) {
      res.status(400).json({
        message: "Event date cannot be in the past",
      });
      return;
    }

    const eventData = {
      ...req.body,
      organizationId: req.user.organization,
      date: eventDate,
      createdBy: req.user._id,
    };

    // field lengths
    const validationError = validateEventFieldLengths(eventData);
    if (validationError) {
      res.status(400).json(validationError);
      return;
    }

    const event = new Event(eventData); // Use normalized data
    const savedEvent = await event.save();

    // Create associated budget
    const budget = new Budget({
      eventId: savedEvent._id,
      organizationId: req.user.organization,
      totalBudget: req.body.initialBudget || 0,
      notes: req.body.budgetNotes || "",
    });
    await budget.save();

    // assignedto user
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { assignedEvents: savedEvent._id },
    });

    res.status(201).json({
      event: savedEvent,
      budgetId: budget._id,
    });
  } catch (err: unknown) {
    // Keep existing error handling
    if (err instanceof Error && err.name === "ValidationError") {
      const messages = Object.values((err as any).errors).map(
        (e: any) => e.message,
      );
      res.status(400).json({ message: messages.join(", ") });
      return;
    }

    const message = err instanceof Error ? err.message : "An error ocurred";
    res.status(400).json({
      message,
    });
  }
};
// Get all events
const getAllEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const isPermitted =
      req.user.role === "admin" ||
      req.user.role === "super_admin" ||
      req.user.role === "planner";

    const filter: Record<string, unknown> = {
      organizationId: req.user.organization,
      isDeleted: false,
    };

    // Non-admins should not see archived events
    if (!isPermitted) {
      filter.isArchived = false;
    }
    // Show events created by ANY user in the same organization
    const events = await Event.find(filter)
      .populate("client")
      .populate("createdBy", "firstName lastName")
      .populate("updatedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean();

    // Get all expenses grouped by event
    const expensesByEvent = await Expense.aggregate([
      {
        $match: {
          organizationId: req.user.organization,
        },
      },
      {
        $group: {
          _id: "$eventId",
          expenseIds: { $push: "$_id" },
        },
      },
    ]);

    // Get vendors for each event's expenses
    const eventsWithVendors = await Promise.all(
      events.map(async (event) => {
        const eventExpenses = expensesByEvent.find(
          (e) => e._id.toString() === event._id.toString(),
        );

        let vendors = [];
        if (eventExpenses) {
          const expenses = await Expense.find({
            _id: { $in: eventExpenses.expenseIds },
          }).populate("vendor", "name services isArchived isDeleted");

          const vendorMap = new Map();
          expenses.forEach((expense) => {
            if (
              expense.vendor &&
              !vendorMap.has(expense.vendor._id.toString())
            ) {
              vendorMap.set(expense.vendor._id.toString(), expense.vendor);
            }
          });
          vendors = Array.from(vendorMap.values());
        }

        return {
          ...event,
          vendors,
          date: event.date?.toISOString(),
          createdAt: event.createdAt?.toISOString(),
          updatedAt: event.updatedAt?.toISOString(),
        };
      }),
    );

    res.json(eventsWithVendors);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ message });
  }
};

// Get event by ID
const getEventById = async (req: Request, res: Response): Promise<void> => {
  try {
    // find event
    const event = req.targetEvent;

    await event.populate([
      { path: "client" },
      { path: "createdBy", select: "firstName lastName isActive" },
      { path: "updatedBy", select: "firstName lastName email isActive" },
    ]);

    // restrict access for archived events
    if (event.isArchived && ["viewer"].includes(req.user.role)) {
      res.status(403).json({
        message: "You do not have permission to view archived events",
      });
      return;
    }

    // Get all expenses for this event to calculate totals and get vendors
    const expenses = await Expense.find({
      eventId: req.params.id,
      organizationId: req.user.organization,
    }).populate("vendor", "name services isArchived isDeleted");

    // Calculate total expenses
    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0,
    );

    // Get unique vendors from expenses
    const vendorMap = new Map();
    expenses.forEach((expense) => {
      if (expense.vendor && !vendorMap.has(expense.vendor._id.toString())) {
        vendorMap.set(expense.vendor._id.toString(), expense.vendor);
      }
    });
    const vendors = Array.from(vendorMap.values());

    // Get budget
    const budget = await Budget.findOne({
      eventId: req.params.id,
      organizationId: req.user.organization,
    }).lean();

    const eventObj = event.toObject();

    const responseData = {
      ...eventObj,
      vendors,
      budget: budget || null,
      totalExpenses,
      date: event.date
        ? event.date instanceof Date
          ? event.date.toISOString()
          : new Date(event.date).toISOString()
        : null,

      createdAt: event.createdAt
        ? event.createdAt instanceof Date
          ? event.createdAt.toISOString()
          : new Date(event.createdAt).toISOString()
        : null,

      updatedAt: event.updatedAt
        ? event.updatedAt instanceof Date
          ? event.updatedAt.toISOString()
          : new Date(event.updatedAt).toISOString()
        : null,
    };

    res.json(responseData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ message });
  }
};

// Update an event
const updateEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const existingEvent = req.targetEvent;

    if (existingEvent.isArchived) {
      res.status(403).json({
        message:
          "Cannot update archived events. Please restore the event first.",
      });
      return;
    }

    // Normalize the date if provided
    let eventDate: Date | undefined;
    if (req.body.date) {
      eventDate = normalizeEventDate(req.body.date);
      // Check if event date is in the past
      if (eventDate !== null && eventDate < new Date()) {
        res.status(400).json({
          message: "Event date cannot be in the past",
        });
        return;
      }
    }

    const updateData = req.body.date
      ? { ...req.body, date: eventDate, updatedBy: req.user._id }
      : { ...req.body, updatedBy: req.user._id };

    // SANITIZATION: Handle empty strings for ObjectId fields
    if (updateData.client === "") {
      updateData.client = null; // Convert empty string to null
    }

    // field lengths validation
    const validationError = validateEventFieldLengths(updateData);
    if (validationError) {
      res.status(400).json(validationError);
      return;
    }

    const event = req.targetEvent;

    // Apply updates
    Object.assign(event, updateData);

    await event.save();

    await event.populate([
      { path: "client" },
      { path: "createdBy", select: "firstName lastName email isActive" },
      { path: "updatedBy", select: "firstName lastName email isActive" },
    ]);

    res.json(event);
  } catch (err: unknown) {
    // Keep existing error handling
    if (err instanceof Error && err.name === "ValidationError") {
      const messages = Object.values((err as any).errors).map(
        (e: any) => e.message,
      );
      res.status(400).json({ message: messages.join(", ") });
      return;
    }
    const message = err instanceof Error ? err.message : "An error occurred.";
    res.status(400).json({
      message,
    });
  }
};

// archive an event
const archiveEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = req.targetEvent;

    if (event.isDeleted) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    if (event.isArchived) {
      res.status(409).json({ message: "Event is already archived." });
      return;
    }

    event.isArchived = true;
    event.archivedAt = new Date();
    await event.save();

    res.json({
      message: "Event archived successfully",
      event,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred.";
    res.status(500).json({ message });
  }
};

// restore archived event
const restoreEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = req.targetEvent;

    if (event.isDeleted) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    if (!event.isArchived) {
      res.status(409).json({ message: "Event is already active." });
      return;
    }

    event.isArchived = false;
    event.archivedAt = null;

    await event.save();

    res.json({
      message: "Event restored successfully",
      event,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred";
    res.status(500).json({ message });
  }
};

// Soft-delete event
const deleteEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const deletedEvent = req.targetEvent;

    const eventId = deletedEvent._id;
    const organizationId = req.user.organization;

    // 🔹 fetch expenses FIRST (for receipts)
    const expensesWithReceipts = await Expense.find({
      eventId: req.params.id,
      organizationId: req.user.organization,
      receiptUrl: { $exists: true, $ne: null },
    }).select("receiptUrl");

    // 🔹 SOFT DELETE event (never remove from DB)

    deletedEvent.isDeleted = true;
    deletedEvent.isArchived = false;
    deletedEvent.deletedAt = new Date();
    deletedEvent.deletedBy = req.user._id;
    deletedEvent.updatedBy = req.user._id;

    await deletedEvent.save();

    // handle expense logs for deleted events
    const expensesToDelete = await Expense.find({
      eventId,
      organizationId,
    });

    for (const expense of expensesToDelete) {
      await logExpenseAction({
        actionType: "EVENT_DELETE_CASCADE",
        expense,
        user: req.user,
        reason: "Expense removed due to event deletion",
        description: `Expense removed because event "${deletedEvent.name}" was deleted`,
        budgetStatusBefore: null,
        budgetStatusAfter: null,
        req,
      });
    }

    // 🔹 Cascade delete domain data (budget intentionally preserved)
    await Promise.all([
      Task.deleteMany({ eventId }),
      Expense.deleteMany({ eventId, organizationId }),
    ]);

    // 🔹 DELETE RECEIPTS FROM SUPABASE (non-blocking)
    for (const expense of expensesWithReceipts) {
      try {
        const filePath = new URL(expense.receiptUrl).pathname.split(
          "planit-receipts/",
        )[1];

        if (filePath) {
          await supabaseAdmin.storage
            .from("planit-receipts")
            .remove([filePath]);
        }
      } catch (err) {
        console.warn(
          "Receipt deletion failedddddd:",
          expense.receiptUrl,
          err.message,
        );
        // intentionally non-blocking
      }
    }

    // If event had a client, check if client should be hard-deleted
    let clientHardDeleted = false;
    let clientName = null;

    if (deletedEvent.client) {
      // Check if client is soft-deleted and has no other events
      const client = await Client.findById(deletedEvent.client);

      if (client && client.isDeleted) {
        // Count remaining events for this client
        const remainingEvents = await Event.countDocuments({
          client: deletedEvent.client,
          organizationId,
          isDeleted: false,
        });

        // If no more events, hard delete the client
        if (remainingEvents === 0) {
          await Client.findByIdAndDelete(deletedEvent.client);
          clientHardDeleted = true;
          clientName = client.name;
        }
      }
    }

    res.json({ message: "Event deleted", clientHardDeleted, clientName });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred";
    res.status(500).json({ message });
  }
};

export {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  archiveEvent,
  restoreEvent,
};

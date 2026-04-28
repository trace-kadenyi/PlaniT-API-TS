import { Request, Response } from "express";
import mongoose from "mongoose";

import Budget from "../models/BudgetSchema";
import Expense from "../models/ExpenseSchema";
import Event from "../models/EventSchema";

// Get budget by event ID
const getBudgetByEventId = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // 1️⃣ Validate event ownership FIRST
    const event = await Event.findOne({
      _id: req.params.eventId,
      organizationId: req.user.organization,
    }).select("_id");

    if (!event) {
      res.status(404).json({
        error: "EventNotFound",
        message: "Event not found or does not belong to your organization",
      });
      return;
    }

    // 2️⃣ Fetch budget (org-scoped)
    const budget = await Budget.findOne({
      eventId: req.params.eventId,
      organizationId: req.user.organization,
    }).lean();

    if (!budget) {
      res.status(404).json({ message: "Budget not found" });
      return;
    }

    // Calculate total expenses
    const expenses = await Expense.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(String(req.params.eventId)),
          organizationId: new mongoose.Types.ObjectId(
            String(req.user.organization),
          ),
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      ...budget,
      totalExpenses: expenses[0]?.total || 0,
      remainingBudget: budget.totalBudget - (expenses[0]?.total || 0),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ message });
  }
};

// Update budget
const updateBudget = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1️⃣ Get the existing budget FIRST
    const existingBudget = await Budget.findOne({
      eventId: req.params.eventId,
      organizationId: req.user.organization,
    });

    if (!existingBudget) {
      res.status(404).json({ message: "Budget not found" });
      return;
    }

    // 2️⃣ Check if anything actually changed
    const { totalBudget, notes } = req.body;
    const budgetChanged =
      (totalBudget !== undefined &&
        totalBudget !== existingBudget.totalBudget) ||
      (notes !== undefined && notes !== existingBudget.notes);

    // 3️⃣ If nothing changed, just return success without any checks
    if (!budgetChanged) {
      res.json(existingBudget);
      return;
    }

    // 4️⃣ ONLY NOW check if event is archived (since something actually changed)
    const event = await Event.findOne({
      _id: req.params.eventId,
      organizationId: req.user.organization,
    }).select("_id isArchived");

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
          "Cannot update budget for archived events. Please restore the event first.",
      });
      return;
    }

    // 5️⃣ Validate new totalBudget against expenses
    if (totalBudget !== undefined) {
      const expenses = await Expense.aggregate([
        {
          $match: {
            eventId: new mongoose.Types.ObjectId(String(req.params.eventId)),
            organizationId: new mongoose.Types.ObjectId(
              String(req.user.organization),
            ),
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const totalExpenses = expenses[0]?.total || 0;
      if (totalBudget < totalExpenses) {
        res.status(400).json({
          message: `New budget must be at least $${totalExpenses.toLocaleString()} (current expenses total)`,
        });
        return;
      }
    }

    // 6️⃣ Update and save
    Object.assign(existingBudget, { totalBudget, notes });
    await existingBudget.save();
    res.json(existingBudget);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ValidationError") {
      res.status(400).json({
        message: Object.values((err as any).errors)
          .map((e: any) => e.message)
          .join(", "),
      });
      return;
    }
    res.status(500).json({ message: (err as any).message });
  }
};

export { getBudgetByEventId, updateBudget };

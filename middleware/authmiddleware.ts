import { Request, Response, NextFunction } from "express";

import {
  checkPermission,
  PERMISSIONS,
  RESOURCES,
} from "../services/permissionService";

import User from "../models/UserSchema";
import Expense from "../models/ExpenseSchema";
import Event from "../models/EventSchema";
import { IUser } from "../types/models";

export const authorize = (permission: string, resource: string) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // ===============================
      // 1️⃣ Authentication check
      // ===============================
      if (!req.user) {
        res.status(401).json({
          error: "Unauthorized",
          code: "AUTH_REQUIRED",
          message: "You must be logged in to perform this action.",
        });
        return;
      }

      let targetUser = null;
      let expense = null;
      let event = null;

      // ===============================
      // 2️⃣ Load target user if needed
      // ===============================
      if (
        (resource === RESOURCES.USER || resource === RESOURCES.USER_HISTORY) &&
        req.params.userId
      ) {
        targetUser = await User.findOne({
          _id: req.params.userId,
          organization: req.user.organization,
        });

        if (!targetUser) {
          res.status(404).json({
            error: "Not Found",
            code: "USER_NOT_FOUND",
            message: "User not found.",
          });
          return;
        }
      }

      // ===============================
      // 3️⃣ Load expense if needed
      // ===============================
      if (resource === RESOURCES.EXPENSE && req.params.id) {
        expense = await Expense.findOne({
          _id: req.params.id,
          organizationId: req.user.organization,
        });

        if (!expense) {
          res.status(404).json({
            error: "Not Found",
            code: "EXPENSE_NOT_FOUND",
            message: "Expense not found.",
          });
          return;
        }

        // ===============================
        // 4️⃣ Context-aware rule:
        // Paid expense deletion
        // ===============================
        if (
          permission === PERMISSIONS.DELETE &&
          expense.paymentStatus === "paid"
        ) {
          const canDeletePaid = checkPermission(
            req.user,
            PERMISSIONS.DELETE_PAID_EXPENSE,
            RESOURCES.EXPENSE,
          );

          if (!canDeletePaid) {
            res.status(403).json({
              error: "Forbidden",
              code: "DELETE_PAID_EXPENSE_RESTRICTED",
              message: "Only Super Admins can delete paid expenses.",
            });
            return;
          }
        }
      }

      // ===============================
      // Load event if needed
      // ===============================
      if (resource === RESOURCES.EVENT && req.params.id) {
        event = await Event.findOne({
          _id: req.params.id,
          organizationId: req.user.organization,
          isDeleted: false,
        });

        if (!event) {
          res.status(404).json({
            error: "Not Found",
            code: "EVENT_NOT_FOUND",
            message: "Event not found.",
          });
          return;
        }
      }

      let permissionTarget: IUser | { role: string } | null = null;

      if (resource === RESOURCES.USER && req.method === "POST") {
        permissionTarget = { role: req.body.role };
      } else {
        permissionTarget = targetUser;
      }

      const hasPermission = checkPermission(
        req.user,
        permission,
        resource,
        permissionTarget || expense || event,
      );

      if (!hasPermission) {
        res.status(403).json({
          error: "Forbidden",
          code: "INSUFFICIENT_PERMISSION",
          message: "You do not have permission to perform this action.",
          details: {
            permission,
            resource,
          },
        });
        return;
      }

      if (targetUser) req.targetUser = targetUser;
      if (expense) req.targetExpense = expense;
      if (event) req.targetEvent = event;

      next();
    } catch (error) {
      console.error("Authorization error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        code: "AUTHORIZATION_CHECK_FAILED",
        message: "Authorization check failed.",
      });
    }
  };
};

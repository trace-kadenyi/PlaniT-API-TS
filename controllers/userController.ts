import { Request, Response } from "express";

import { PASSWORD_REGEX } from "../constants/regex";
import User from "../models/UserSchema";
import UserUpdateHistory from "../models/UserUpdateHistory";
import { generateDescription } from "../utils/generateDescriptions";

// Get all users in current user's organization
const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    let query: Record<string, unknown> = {
      organization: req.user.organization,
    };

    // If user is viewer or planner, exclude deactivated users
    if (req.user.role === "viewer" || req.user.role === "planner") {
      query.isDeactivated = false;
    }

    const users = await User.find(query).select(
      "-password -passwordResetToken -passwordResetExpires",
    );

    res.json(users);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred.";
    res.status(500).json({ message });
  }
};

// Get single user
const getUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findOne({
      _id: req.params.userId,
      organization: req.user.organization,
    }).select("-password -passwordResetToken -passwordResetExpires");

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // PREVENT VIEWERS/PLANNERS FROM ACCESSING DEACTIVATED USERS
    if (
      user.isDeactivated &&
      (req.user.role === "viewer" || req.user.role === "planner")
    ) {
      res.status(403).json({
        message: "You don't have permission to view this user",
      });
      return;
    }

    res.json(user);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred.";
    res.status(500).json({ message });
  }
};

// Add new user
const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, firstName, lastName, role, password } = req.body;

    // Validate password
    if (password) {
      // In userController.js
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/;
      if (!passwordRegex.test(password)) {
        res.status(400).json({
          message:
            "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        });
        return;
      }
    }

    // Check if user already exists in this organization
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      organization: req.user.organization,
    });

    if (existingUser) {
      res.status(400).json({
        message: "User already exists in this organization",
      });
      return;
    }

    // Create the user
    const newUser = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      organization: req.user.organization,
      role: role || "viewer",
      password: password || "TempPass123!",
    });

    await newUser.save();

    const userResponse = await User.findById(newUser._id).select(
      "-password -passwordResetToken -passwordResetExpires",
    );

    res.status(201).json({
      message: "User added successfully",
      user: userResponse,
    });
  } catch (err: unknown) {
    if ((err as any).code === 11000) {
      res.status(400).json({
        message: "User already exists in this organization",
      });
      return;
    }
    const message =
      err instanceof Error ? err.message : "An error has occurred.";
    res.status(500).json({ message });
  }
};

// Update user details
const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, phone, newPassword, currentPassword } =
      req.body;

    // Find the target user
    const targetUser = await User.findOne({
      _id: req.params.userId,
      organization: req.user.organization,
    }).select("+password");

    if (!targetUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (targetUser.isDeactivated) {
      res.status(400).json({
        message: "Cannot update a deactivated user",
      });
      return;
    }

    const isSelf = req.user._id.toString() === req.params.userId;

    // Track changes BEFORE modifying
    const changes = [];
    let updateType = "profile_update";

    // Check for changes BEFORE updating
    if (firstName && firstName !== targetUser.firstName) {
      changes.push({
        field: "firstName",
        oldValue: targetUser.firstName,
        newValue: firstName,
      });
    }

    if (lastName && lastName !== targetUser.lastName) {
      changes.push({
        field: "lastName",
        oldValue: targetUser.lastName,
        newValue: lastName,
      });
    }

    if (email && email.toLowerCase() !== targetUser.email) {
      changes.push({
        field: "email",
        oldValue: targetUser.email,
        newValue: email.toLowerCase(),
      });
    }

    if (phone && phone !== targetUser.contact?.phone) {
      changes.push({
        field: "phone",
        oldValue: targetUser.contact?.phone || "",
        newValue: phone,
      });
    }

    // Handle password change
    if (newPassword) {
      // If changing own password, verify current password
      if (isSelf) {
        if (!currentPassword) {
          res.status(400).json({
            message: "Current password is required to set a new password",
          });
          return;
        }

        // Verify current password
        const isPasswordCorrect = await targetUser.correctPassword(
          currentPassword,
          targetUser.password,
        );

        if (!isPasswordCorrect) {
          res.status(401).json({
            message: "Current password is incorrect",
          });
          return;
        }
      }

      // Validate new password
      if (!PASSWORD_REGEX.test(newPassword)) {
        res.status(400).json({
          message:
            "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        });
        return;
      }

      changes.push({
        field: "password",
        oldValue: "********",
        newValue: "********",
      });
      updateType = "password_change";
    }

    // If no changes, return early
    if (changes.length === 0) {
      const currentUser = await User.findOne({
        _id: targetUser._id,
        organization: req.user.organization,
      }).select("-password -passwordResetToken -passwordResetExpires");

      res.json({
        message: "No changes detected",
        user: currentUser,
      });
      return;
    }

    // Apply ALL changes at once
    if (firstName) targetUser.firstName = firstName;
    if (lastName) targetUser.lastName = lastName;
    if (email) targetUser.email = email.toLowerCase();
    if (phone) targetUser.contact = { ...targetUser.contact, phone };
    if (newPassword) targetUser.password = newPassword;

    await targetUser.save();

    // Create update history entry
    const updateHistory = new UserUpdateHistory({
      userId: targetUser._id,
      organization: req.user.organization,
      updatedBy: req.user._id,
      updatedByRole: req.user.role,
      changes,
      type: updateType,
      description: generateDescription(changes, targetUser, req.user, isSelf),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await updateHistory.save();

    // Keep only last 50 updates
    await UserUpdateHistory.deleteMany({
      userId: targetUser._id,
      organization: req.user.organization,
      _id: {
        $nin: await UserUpdateHistory.find({
          userId: targetUser._id,
          organization: req.user.organization,
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .select("_id")
          .then((records) => records.map((r) => r._id)),
      },
    });

    const updatedUser = await User.findById(targetUser._id).select(
      "-password -passwordResetToken -passwordResetExpires",
    );

    res.json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (err: unknown) {
    if ((err as any).code === 11000) {
      res.status(400).json({ message: "Email already exists" });
      return;
    }
    const message =
      err instanceof Error ? err.message : "An error has occurred.";
    res.status(500).json({ message });
  }
};

// Update user role
const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role } = req.body;

    const targetUser = req.targetUser;

    if (targetUser.isDeactivated) {
      res.status(400).json({
        message: "Cannot update a deactivated user",
      });
      return;
    }

    // Track role change
    const changes = [
      {
        field: "role",
        oldValue: targetUser.role,
        newValue: role,
      },
    ];

    targetUser.role = role;
    await targetUser.save();

    // Log the role change
    const updateHistory = new UserUpdateHistory({
      userId: targetUser._id,
      organization: req.user.organization,
      updatedBy: req.user._id,
      updatedByRole: req.user.role,
      changes,
      type: "role_change",
      description: `${targetUser.firstName}'s role changed from ${changes[0].oldValue} to ${changes[0].newValue} by ${req.user.firstName} ${req.user.lastName}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await updateHistory.save();

    const updatedUser = await User.findById(targetUser._id).select(
      "-password -passwordResetToken -passwordResetExpires",
    );

    res.json({
      message: "User role updated successfully",
      user: updatedUser,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred.";
    res.status(500).json({ message });
  }
};

// Delete user
const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // Prevent users from removing themselves
    if (req.params.userId === req.user._id.toString()) {
      res.status(400).json({
        message: "Cannot remove yourself",
      });
      return;
    }

    const targetUser = req.targetUser;

    if (targetUser.isDeactivated) {
      res.status(400).json({
        message: "User is already deactivated.",
      });
      return;
    }

    // log deletions
    await UserUpdateHistory.create({
      userId: targetUser._id,
      organization: req.user.organization,
      updatedBy: req.user._id,
      updatedByRole: req.user.role,
      type: "deactivation",
      changes: [
        {
          field: "status",
          oldValue: "Active",
          newValue: "Deactivated",
        },
      ],
      description: `${targetUser.firstName} ${targetUser.lastName} was deactivated by ${req.user.firstName} ${req.user.lastName} on ${new Date().toLocaleString()}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    targetUser.isDeactivated = true;
    targetUser.isActive = false;
    await targetUser.save();

    res.json({
      message: "User removed successfully",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred.";
    res.status(500).json({ message });
  }
};

// Get user update history
const getUserUpdateHistory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const history = await UserUpdateHistory.find({
      userId: req.params.userId,
      organization: req.user.organization,
    })
      .populate("updatedBy", "firstName lastName email role isActive")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(history);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred.";
    res.status(500).json({ message });
  }
};

// reactivate user
const reactivateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const targetUser = await User.findOne({
      _id: req.params.userId,
      organization: req.user.organization,
      isDeactivated: true,
    });

    if (!targetUser) {
      res.status(404).json({
        message: "Deactivated user not found",
      });
      return;
    }

    targetUser.isDeactivated = false;
    targetUser.isActive = true;

    await targetUser.save();

    // Log reactivation
    await UserUpdateHistory.create({
      userId: targetUser._id,
      organization: req.user.organization,
      updatedBy: req.user._id,
      updatedByRole: req.user.role,
      type: "reactivation",
      changes: [
        {
          field: "status",
          oldValue: "Deactivated",
          newValue: "Active",
        },
      ],
      description: `${targetUser.firstName} ${targetUser.lastName} was reactivated by ${req.user.firstName} ${req.user.lastName}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const cleanUser = await User.findById(targetUser._id).select(
      "-password -passwordResetToken -passwordResetExpires",
    );

    res.json({
      message: "User reactivated successfully",
      user: cleanUser,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred.";
    res.status(500).json({ message });
  }
};

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  updateUserRole,
  deleteUser,
  getUserUpdateHistory,
  reactivateUser,
};

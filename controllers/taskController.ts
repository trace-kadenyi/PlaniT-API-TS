import { Request, Response } from "express";

import Task from "../models/TaskSchema";
import Event from "../models/EventSchema";
import User from "../models/UserSchema";

const maxChars = 150;
const maxNameChars = 50;

// Get all tasks
const getAllTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get all users in the same organization
    const organizationUsers = await User.find({
      organization: req.user.organization,
    }).select("_id");

    const organizationUserIds = organizationUsers.map((user) => user._id);

    // Base filter - only tasks created by users in same organization
    const filter: Record<string, unknown> = {
      createdBy: { $in: organizationUserIds },
    };

    if (req.query.eventId) {
      filter.eventId = req.query.eventId;
    }

    const tasks = await Task.find(filter)
      .sort({ createdAt: -1 })
      .populate({
        path: "eventId",
        select: "name date", // Only get name and date
        options: { retainNullValues: true }, // Keep null if eventId is null
      })
      .populate("assignedTo", "firstName lastName email")
      .populate("createdBy", "firstName lastName email isActive")
      .populate("updatedBy", "firstName lastName email isActive");

    // Transform tasks to include eventName at top level
    const tasksWithEventName = tasks.map((task) => ({
      ...task.toObject(),
      eventName: (task.eventId as any)?.name || "Unassigned", // Add eventName field
    }));

    res.json(tasksWithEventName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ message });
  }
};

// Create a new task
const createTask = async (req: Request, res: Response): Promise<void> => {
  try {
    // name word limit
    const taskName = req.body.title || "";
    if (taskName.length > maxNameChars) {
      res.status(400).json({
        message: `Task name cannot exceed ${maxNameChars} characters.`,
      });
      return;
    }

    // description word limit
    const description = req.body.description || "";
    if (description.length > maxChars) {
      res
        .status(400)
        .json({ message: `Description cannot exceed ${maxChars} characters.` });
      return;
    }

    // Validate event exists and get event date
    const event = await Event.findById(req.body.eventId);
    if (!event) {
      res.status(404).json({ message: "Associated event not found" });
      return;
    }

    // 🚫 PREVENT CREATING TASKS FOR ARCHIVED EVENTS
    if (event.isArchived) {
      res.status(403).json({
        error: "EventArchived",
        message:
          "Cannot create tasks for archived events. Please restore the event first.",
      });
      return;
    }

    // verify user has access to this event (event must be in same org)
    const organizationUsers = await User.find({
      organization: req.user.organization,
    }).select("_id");
    const organizationUserIds = organizationUsers.map((user) => user._id);

    // Check if the event was created by someone in the same organization
    const eventCreatorInOrg = await Event.findOne({
      _id: req.body.eventId,
      createdBy: { $in: organizationUserIds },
    });

    if (!eventCreatorInOrg) {
      res.status(403).json({
        message: "Access denied to this event",
      });
      return;
    }

    // Convert dates to consistent format for comparison
    const taskDeadline = new Date(req.body.deadline);
    const eventDate = new Date(event.date);

    // Clear time components for date-only comparison if needed
    taskDeadline.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);

    if (taskDeadline > eventDate) {
      res.status(400).json({
        message: "Task deadline cannot be after the event date",
        validation: {
          field: "deadline",
          message: "Task deadline must be before the event date",
        },
      });
      return;
    }

    if (taskDeadline < new Date()) {
      res.status(400).json({
        message: "Task deadline cannot be in the past",
        validation: {
          field: "deadline",
          message: "Task deadline must be a date in the future",
        },
      });
      return;
    }

    // Only create task if validation passes
    const taskData = {
      ...req.body,
      createdBy: req.user._id,
    };

    const task = new Task(taskData);
    await task.save();

    // Populate the response with user details
    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "firstName lastName email")
      .populate("createdBy", "firstName lastName email");

    res.status(201).json(populatedTask);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ValidationError") {
      const messages = Object.values((err as any).errors).map(
        (e: any) => e.message,
      );
      res.status(400).json({
        message: messages.join(", "),
        validationErrors: (err as any).errors,
      });
      return;
    }

    const message = err instanceof Error ? err.message : "An error occurred.";

    res.status(400).json({
      message,
    });
  }
};
// Update a task
const updateTask = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get all users in the same organization
    const organizationUsers = await User.find({
      organization: req.user.organization,
    }).select("_id");
    const organizationUserIds = organizationUsers.map((user) => user._id);

    // Check if task exists and user has access (any task in the organization)
    const existingTask = await Task.findOne({
      _id: req.params.id,
      createdBy: { $in: organizationUserIds },
    });

    if (!existingTask) {
      res.status(404).json({
        message: "Task not found or access denied",
      });
      return;
    }

    // 🚫 CHECK IF ASSOCIATED EVENT IS ARCHIVED
    if (existingTask.eventId) {
      const event = await Event.findOne({
        _id: existingTask.eventId,
        organizationId: req.user.organization,
      }).select("isArchived");

      if (event && event.isArchived) {
        res.status(403).json({
          error: "EventArchived",
          message:
            "Cannot update tasks for archived events. Please restore the event first.",
        });
        return;
      }
    }

    // name word limit
    const taskName = req.body.title || "";
    if (taskName.length > maxNameChars) {
      res.status(400).json({
        message: `Task name cannot exceed ${maxNameChars} characters.`,
      });
      return;
    }

    // description word limit
    const description = req.body.description || "";
    if (description.length > maxChars) {
      res
        .status(400)
        .json({ message: `Description cannot exceed ${maxChars} characters.` });
      return;
    }

    // Check if task deadline is being updated
    if (req.body.deadline) {
      // Get the current task to find the associated event
      const task = await Task.findById(req.params.id);
      if (!task) {
        res.status(404).json({ message: "Task not found" });
        return;
      }

      const event = await Event.findById(task.eventId);
      if (!event) {
        res.status(404).json({ message: "Associated event not found" });
        return;
      }

      // Convert dates to consistent format for comparison
      const newDeadline = new Date(req.body.deadline);
      const eventDate = new Date(event.date);

      // Clear time components for date-only comparison if needed
      newDeadline.setHours(0, 0, 0, 0);
      eventDate.setHours(0, 0, 0, 0);

      if (newDeadline > eventDate) {
        res.status(400).json({
          message: "Task deadline cannot be after the event date",
          validation: {
            field: "deadline",
            message: "Task deadline must be before the event date",
          },
        });
        return;
      }

      if (newDeadline < new Date()) {
        res.status(400).json({
          message: "Task deadline cannot be in the past",
          validation: {
            field: "deadline",
            message: "Task deadline must be a date in the future",
          },
        });
        return;
      }
    }

    const updateData = {
      ...req.body,
      updatedBy: req.user._id,
    };

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      },
    )
      .populate("assignedTo", "firstName lastName email")
      .populate("createdBy", "firstName lastName email isActive")
      .populate("updatedBy", "firstName lastName email isActive");

    if (!updatedTask) {
      res.status(404).json({ message: "Task not found" });
      return;
    }

    res.json(updatedTask);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred.";
    res.status(400).json({ message });
  }
};

// Get a single task by ID
const getTaskById = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get all users in the same organization
    const organizationUsers = await User.find({
      organization: req.user.organization,
    }).select("_id");

    const organizationUserIds = organizationUsers.map((user) => user._id);

    const task = await Task.findOne({
      _id: req.params.id,
      createdBy: { $in: organizationUserIds },
    })
      .populate("eventId", "name date")
      .populate("assignedTo", "firstName lastName email")
      .populate("createdBy", "firstName lastName email isActive")
      .populate("updatedBy", "firstName lastName email isActive");

    if (!task) {
      res.status(404).json({ message: "Task not found" });
      return;
    }
    res.json(task);
  } catch (err: unknown) {
    // Handle Mongoose validation errors
    if (err instanceof Error && err.name === "ValidationError") {
      const messages = Object.values((err as any).errors).map(
        (e: any) => e.message,
      );
      res.status(400).json({ message: messages.join(", ") });
      return;
    }

    // General error fallback
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(400).json({
      message,
    });
  }
};

// Delete a task
const deleteTask = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get all users in the same organization
    const organizationUsers = await User.find({
      organization: req.user.organization,
    }).select("_id");
    const organizationUserIds = organizationUsers.map((user) => user._id);

    // Check if task exists and user has access
    const existingTask = await Task.findOne({
      _id: req.params.id,
      createdBy: { $in: organizationUserIds },
    });

    if (!existingTask) {
      res.status(404).json({
        message: "Task not found or access denied",
      });
      return;
    }

    // 🚫 CHECK IF ASSOCIATED EVENT IS ARCHIVED
    if (existingTask.eventId) {
      const event = await Event.findOne({
        _id: existingTask.eventId,
        organizationId: req.user.organization,
      }).select("isArchived");

      if (event && event.isArchived) {
        res.status(403).json({
          error: "EventArchived",
          message:
            "Cannot delete tasks for archived events. Please restore the event first.",
        });
        return;
      }
    }

    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) {
      res.status(404).json({ message: "Task not found" });
      return;
    }
    res.json({ message: "Task deleted successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(400).json({ message });
  }
};

export { getAllTasks, createTask, updateTask, getTaskById, deleteTask };

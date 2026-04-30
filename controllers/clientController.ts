import { Request, Response } from "express";
import mongoose from "mongoose";

import Client from "../models/ClientSchema";
import Event from "../models/EventSchema";

const MAX_NOTES = 200;
const MAX_PREFERENCES = 150;

// Create new client
const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check notes length if provided
    if (req.body.notes && req.body.notes.length > MAX_NOTES) {
      res.status(400).json({
        error: "ValidationError",
        message: `Client notes cannot exceed ${MAX_NOTES} characters`,
        field: "notes",
        maxLength: MAX_NOTES,
        currentLength: req.body.notes.length,
      });
      return;
    }

    // Check prereferences length if provided
    if (req.body.preferences && req.body.preferences.length > MAX_PREFERENCES) {
      res.status(400).json({
        error: "ValidationError",
        message: `Client preferences cannot exceed ${MAX_PREFERENCES} characters`,
        field: "preferences",
        maxLength: MAX_PREFERENCES,
        currentLength: req.body.preferences.length,
      });
      return;
    }

    // client data
    const clientData = {
      ...req.body,
      organizationId: req.user.organization,
      createdBy: req.user._id,
    };

    const client = await Client.create(clientData);
    res.status(201).json(client);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(400).json({
      error: (err as any)?.name,
      message,
      details: (err as any)?.errors,
    });
  }
};

// Get all active clients
const getAllClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {
      organizationId: req.user.organization,
      isDeleted: false,
    };

    // Viewers cannot see archived clients
    if (req.user.role === "viewer") {
      filter.isArchived = false;
    }

    const clients = await Client.find(filter).sort({ createdAt: -1 });
    res.json(clients);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

// Get a single client and their events
const getClientWithEvents = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const client = await Client.findOne({
      _id: req.params.id,
      organizationId: req.user.organization,
    });

    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    // Block viewers from accessing archived clients directly
    if (client.isArchived && req.user.role === "viewer") {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to view archived clients.",
      });
      return;
    }

    const events = await Event.find({
      client: client._id,
      organizationId: req.user.organization,
    });

    const clientData = client.toObject();
    if (client.isDeleted) {
      clientData.name = `${client.name} (Deleted)`;
    }

    res.json({ client: clientData, events });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

// Update a client
const updateClient = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check notes length if provided
    if (req.body.notes && req.body.notes.length > MAX_NOTES) {
      res.status(400).json({
        error: "ValidationError",
        message: `Client notes cannot exceed ${MAX_NOTES} characters`,
        field: "notes",
        maxLength: MAX_NOTES,
        currentLength: req.body.notes.length,
      });
      return;
    }

    // Check prereferences length if provided
    if (req.body.preferences && req.body.preferences.length > MAX_PREFERENCES) {
      res.status(400).json({
        error: "ValidationError",
        message: `Client preferences cannot exceed ${MAX_PREFERENCES} characters`,
        field: "preferences",
        maxLength: MAX_PREFERENCES,
        currentLength: req.body.preferences.length,
      });
      return;
    }

    const client = await Client.findOne({
      _id: req.params.id,
      organizationId: req.user.organization,
      isDeleted: false,
    });

    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    if (client.isArchived) {
      res.status(409).json({
        message: "Cannot update an archived client. Unarchive it first.",
      });
      return;
    }

    // Apply updates
    Object.assign(client, req.body);
    await client.save();

    res.json(client);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(400).json({ error: message });
  }
};

// Archive a client
const archiveClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await Client.findOne({
      _id: req.params.id,
      organizationId: req.user.organization,
      isDeleted: false,
    });

    if (!client) {
      res.status(404).json({ error: "Client not found or already deleted" });
      return;
    }

    if (client.isArchived) {
      res.status(409).json({ message: "Client is already archived." });
      return;
    }

    client.isArchived = true;
    client.archivedAt = new Date();
    await client.save();

    res.json({
      message: "Client archived successfully",
      client,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred";
    res.status(500).json({ error: message });
  }
};

// Unarchive archived clients
const restoreClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await Client.findOne({
      _id: req.params.id,
      organizationId: req.user.organization,
      isDeleted: false,
    });

    if (!client) {
      res
        .status(404)
        .json({ error: "Client not found or permanently deleted" });
      return;
    }

    if (!client.isArchived) {
      res.status(409).json({ message: "Client is already active." });
      return;
    }

    client.isArchived = false;
    client.archivedAt = null;
    await client.save();

    res.json({
      message: "Client restored successfully",
      client,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred";
    res.status(500).json({ error: message });
  }
};

// HANDLE CLIENT DELETE
// Permanent soft delete only
const deleteClient = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate that the ID is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id as string)) {
      res.status(400).json({ error: "Invalid client ID" });
      return;
    }

    const client = await Client.findOne({
      _id: req.params.id,
      organizationId: req.user.organization,
    });

    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    // Check if client has any associated events
    const eventCount = await Event.countDocuments({
      client: client._id,
      organizationId: req.user.organization,
    });

    if (eventCount > 0) {
      client.isDeleted = true;
      client.isArchived = false;
      client.deletedAt = new Date();
      await client.save();

      res.json({
        message:
          "Client permanently deleted and removed from active records (records preserved for existing events)",
        client: {
          _id: client._id,
          name: `${client.name} (Deleted)`,
          isDeleted: true,
          deletedAt: client.deletedAt,
          hasEvents: true,
          eventCount,
        },
      });
      return;
    }
    // Client has NO events - HARD DELETE
    await client.deleteOne();

    res.json({
      message: "Client permanently deleted (no associated events)",
      deletedClient: client,
      hasEvents: false,
      eventCount: 0,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An error has occurred";
    res.status(500).json({ error: message });
  }
};

// Delete all clients
const deleteAllClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const clients = await Client.find({
      organizationId: req.user.organization,
      isDeleted: false,
    });

    let softDeleted = 0;
    let hardDeleted = 0;

    for (const client of clients) {
      const eventCount = await Event.countDocuments({
        client: client._id,
        organizationId: req.user.organization,
      });

      if (eventCount > 0) {
        client.isDeleted = true;
        client.isArchived = false;
        client.deletedAt = new Date();
        await client.save();
        softDeleted++;
      } else {
        await client.deleteOne();
        hardDeleted++;
      }
    }

    const deleteCount = softDeleted + hardDeleted;

    res.json({
      message: "All clients deleted for this organization",
      summary: {
        totalProcessed: clients.length,
        softDeleted,
        hardDeleted,
        deleteCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ error: message });
  }
};

export {
  createClient,
  getAllClients,
  getClientWithEvents,
  updateClient,
  archiveClient,
  restoreClient,
  deleteClient,
  deleteAllClients,
};

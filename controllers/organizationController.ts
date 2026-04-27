import { Request, Response } from "express";
import Organization from "../models/OrganizationSchema";

// Get organization details
const getOrganizationDetails = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      res.status(404).json({
        message: "Organization not found",
      });
      return;
    }

    res.json({
      id: organization._id,
      name: organization.name,
      plan: organization.plan,
      settings: organization.settings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ message });
  }
};

// update org
const updateOrganization = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ message: "Organization name is required" });
      return;
    }

    const organization = await Organization.findByIdAndUpdate(
      req.user.organization,
      { name: name.trim() },
      { new: true, runValidators: true },
    );

    if (!organization) {
      res.status(404).json({ message: "Organization not found" });
      return;
    }

    res.json({
      message: "Organization name updated successfully",
      organization: {
        id: organization._id,
        name: organization.name,
        plan: organization.plan,
        settings: organization.settings,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(500).json({ message });
  }
};

export { getOrganizationDetails, updateOrganization };

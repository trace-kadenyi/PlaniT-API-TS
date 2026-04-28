import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import jwt, { JwtPayload } from "jsonwebtoken";

import User from "../models/UserSchema";
import Organization from "../models/OrganizationSchema";
import { getBasePermissionsForRole } from "../services/permissionService";
import { IUser } from "../types/models";

// Generate JWT tokens
const signToken = (id: string): string => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN as any,
  });
};

// In createSendToken function, add logging:
const createSendToken = (
  user: IUser,
  statusCode: number,
  res: Response,
): void => {
  const accessToken = signToken(user._id.toString());
  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN as any },
  );

  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProduction, // true in prod (HTTPS only)
    sameSite: isProduction ? "none" : "lax", // "none" required for cross-subdomain
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Generate permissions based on role
  const permissions = getBasePermissionsForRole(user.role);
  user.password = undefined as any;

  res.status(statusCode).json({
    status: "success",
    accessToken,
    data: {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        organization: user.organization,
        permissions,
      },
    },
  });
};

// Signup
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, password, organizationName } = req.body;

    // Create organization first
    const organization = new Organization({
      name: organizationName || `${firstName}'s Event Planning`,
    });
    await organization.save();

    // Create user as organization super admin
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password,
      organization: organization._id,
      role: "super_admin", // First user becomes super admin
    });

    createSendToken(newUser, 201, res);
  } catch (err: unknown) {
    // Enhanced error handling for duplicate emails
    if ((err as any).code === 11000) {
      // Check if it's an email+organization duplicate
      if (
        (err as any).keyPattern &&
        (err as any).keyPattern.email &&
        (err as any).keyPattern.organization
      ) {
        res.status(400).json({
          status: "error",
          message: "This email is already registered in your organization",
        });
        return;
      }
    }

    // Enhanced error handling
    if (err instanceof Error && err.name === "ValidationError") {
      const messages = Object.values((err as any).errors).map(
        (e: any) => e.message,
      );
      res.status(400).json({
        status: "error",
        message: messages.join(", "),
        validationErrors: (err as any).errors, // Send detailed errors
      });
      return;
    }

    // Handle duplicate email error
    // if (err.code === 11000) {
    //   return res.status(400).json({
    //     status: "error",
    //     message: "Email already exists in an organization"
    //   });
    // }

    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(400).json({ status: "error", message });
  }
};

// Login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Check if email and password exist
    if (!email || !password) {
      res.status(400).json({
        status: "error",
        message: "Please provide email and password",
      });
      return;
    }

    // Check if user email exists
    const userEmail = await User.findOne({ email });

    if (!userEmail) {
      res.status(401).json({
        status: "error",
        message: "Email does not exist on our system",
      });
      return;
    }

    // Check if user exists && password is correct
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.correctPassword(password, user.password))) {
      res.status(401).json({
        status: "error",
        message: "Incorrect password",
      });
      return;
    }

    // check if user is deactivated
    if (user.isDeactivated || !user.isActive) {
      res.status(401).json({
        status: "error",
        message:
          "This account has been deactivated. Contact a super admin to reactivate",
        code: "ACCOUNT_DEACTIVATED",
      });
      return;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // If everything ok, send token to client
    createSendToken(user, 200, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(400).json({
      status: "error",
      message,
    });
  }
};

// Refresh token
export const refreshToken = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const refreshToken = req.cookies.refreshToken; // Get from cookie

    if (!refreshToken) {
      res.status(401).json({ status: "error", message: "No refresh token" });
      return;
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string,
    ) as jwt.JwtPayload;

    // Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      res.status(401).json({
        status: "error",
        message: "The user belonging to this token no longer exists",
      });
      return;
    }

    // Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      res.status(401).json({
        status: "error",
        message: "User recently changed password! Please log in again",
      });
      return;
    }

    // If everything is ok, create new access token
    const accessToken = signToken(currentUser._id.toString());

    const permissions = getBasePermissionsForRole(currentUser.role);

    res.status(200).json({
      status: "success",
      accessToken,
      data: {
        user: {
          _id: currentUser._id,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          email: currentUser.email,
          role: currentUser.role,
          organization: currentUser.organization,
          permissions,
        },
      },
    });
  } catch (err: unknown) {
    res.status(401).json({
      status: "error",
      message: "Invalid refresh token",
    });
  }
};

// Forgot password
export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  let user: IUser | null = null;
  try {
    // 1) Get user based on POSTed email
    user = await User.findOne({ email: req.body.email });
    if (!user) {
      res.status(404).json({
        status: "error",
        message: "There is no user with that email address",
      });
      return;
    }

    // 2) Generate the random reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // 3) Send it to user's email (later implementation)
    // For dev, just return the token
    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
      resetToken, // In production, remove this line and actually send email
    });
  } catch (err: unknown) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(500).json({
      status: "error",
      message: "There was an error sending the email. Try again later!",
    });
  }
};

// Reset password
export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // 1) Get user based on the token
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token as string)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    // 2) If token has not expired, and there is user, set the new password
    if (!user) {
      res.status(400).json({
        status: "error",
        message: "Token is invalid or has expired",
      });
      return;
    }

    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // 3) Update changedPasswordAt property for the user
    // 4) Log the user in, send JWT
    createSendToken(user, 200, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An error occurred";
    res.status(400).json({ status: "error", message });
  }
};

// Protect middleware (to be used in routes)
export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // 1) Getting token and check if it's there
    let token: string | undefined;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      res.status(401).json({
        status: "error",
        message: "You are not logged in! Please log in to get access",
      });
      return;
    }

    // 2) Verification token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as JwtPayload;

    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      res.status(401).json({
        status: "error",
        message: "The user belonging to this token no longer exists",
      });
      return;
    }

    // 4) Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      res.status(401).json({
        status: "error",
        message: "User recently changed password! Please log in again",
      });
      return;
    }

    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    next();
  } catch (err: unknown) {
    res.status(401).json({
      status: "error",
      message: "Invalid token",
    });
  }
};

// Restrict to certain roles
export const restrictTo = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.user.role as string)) {
      res.status(403).json({
        status: "error",
        message: "You do not have permission to perform this action",
      });
      return;
    }
    next();
  };
};

// Logout - clear the refresh token cookie
export const logout = (req: Request, res: Response): void => {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("refreshToken", "loggedout", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 1, // 1ms - effectively expires immediately
  });

  res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
};

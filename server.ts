/// <reference path="./types/express/index.d.ts" />

import express, { Request, Response, NextFunction } from "express";

const app = express();
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import path from "path";
const PORT = process.env.PORT || 4000;

// routes
import root from "./routes/root";
import taskRoutes from "./routes/taskRoutes";
import eventRoutes from "./routes/eventRoutes";
import budgetRoutes from "./routes/budgetRoutes";
import expenseRoutes from "./routes/expenseRoutes";
import clientRoutes from "./routes/clientRoutes";
import vendorRoutes from "./routes/vendorRoutes";
import authRoutes from "./routes/authRoutes";
import organizationRoutes from "./routes/organizationRoutes";
import userRoutes from "./routes/userRoutes";

// connect to MongoDB
mongoose.connect(process.env.DATABASE_URI as string);

// cors
app.use(
  cors({
    origin: "http://localhost:5173",
    // origin: "https://planit.traceykadenyi.com",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

app.use(cookieParser());
app.use(helmet());

// ========== RATE LIMITING SETUP ==========

// More permissive rate limiting for refresh token
const refreshTokenLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 refresh attempts per minute (more permissive)
  message: "Too many token refresh attempts. Please slow down.",
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      status: "error",
      message:
        "Too many token refresh attempts. Please wait a moment before trying again.",
    });
  },
});

// Aggressive rate limiting for sensitive auth routes
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // CHANGE TO 15 AFTER DEVELOPMENT
  max: 100, // CHANGE TO 10 AFTER DEVELOPMENT
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      status: "error",
      message:
        "Too many login attempts. Please wait 15 minutes before trying again.",
    });
  },
});

// Apply refresh token limiter specifically to refresh-token endpoint
app.use("/api/auth/refresh-token", refreshTokenLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);

// ========== END RATE LIMITING SETUP ==========

app.use(express.json());

// middleware to handle static files
app.use(express.static(path.join(__dirname, "public")));

// Add this before your other routes in server.js
app.get("/api/debug-cookies-set", (req: Request, res: Response) => {
  res.cookie("debugCookie", "test-value", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ message: "Debug cookie should be set" });
});

app.get("/api/debug-cookies-check", (req: Request, res: Response) => {
  res.json({
    receivedCookies: req.cookies,
    headers: req.headers,
  });
});

// use routes
app.use("/", root);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/organization", organizationRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/budget", budgetRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/vendors", vendorRoutes);

// ERROR HANDLING MIDDLEWARE (important for auth)
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(error.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Internal server error",
  });
});

// // Fallback for undefined routes
app.all(/.*/, (req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});

// start server
mongoose.connection.once("open", () => {
  console.log("connected to MongoDB");
  app.listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
  });
});

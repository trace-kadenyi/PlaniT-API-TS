import express, { Router } from "express";

import authController from "../controllers/authController";

const router: Router = express.Router();
// signup
router.post("/signup", authController.signup);

// login
router.post("/login", authController.login);

// refresh token
router.post("/refresh-token", authController.refreshToken);

// forgot password
router.post("/forgot-password", authController.forgotPassword);

// reset password
router.patch("/reset-password/:token", authController.resetPassword);

// logout
router.post("/logout", authController.logout);

export default router;

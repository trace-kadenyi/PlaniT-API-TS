import express, { Router } from "express";
const path = require("path");
const router: Router = express.Router();

router.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "..", "views", "index.html"));
});

export default router;

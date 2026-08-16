import express from "express";
import upload from "../middleware/upload.middleware.js";
import { uploadFile } from "../controllers/storage.controller.js";

const router = express.Router();

router.post(
  "/upload",
  upload.single("file"),
  uploadFile
);

export default router;
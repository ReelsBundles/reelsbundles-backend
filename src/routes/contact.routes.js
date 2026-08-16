import express from "express";

import {
    submitContactForm
} from "../controllers/contact.controller.js";


const router = express.Router();


/**
 * Contact Support
 *
 * POST /api/contact
 */
router.post(
    "/",
    submitContactForm
);


export default router;
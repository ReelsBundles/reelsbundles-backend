"use strict";

import express from "express";

import {
    firebaseUserAuth
} from "../middleware/auth.middleware.js";

import {
    getUserLibrary
} from "../controllers/user-library.controller.js";


const router =
    express.Router();


/* ==========================================================
   USER LIBRARY
========================================================== */

router.get(
    "/",
    firebaseUserAuth,
    getUserLibrary
);


export default router;
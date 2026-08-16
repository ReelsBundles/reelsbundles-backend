import express from "express";

import {

    adminLogin,

    createUserSession,

    getCurrentUser,

    sendUserPasswordReset

} from "../controllers/auth.controller.js";

import {
    firebaseUserAuth
} from "../middleware/auth.middleware.js";

const router =
    express.Router();


/* ==========================================================
   ADMIN AUTH
   EXISTING ROUTE - PRESERVED
========================================================== */

router.post(
    "/login",
    adminLogin
);

router.post(
    "/user/forgot-password",
    sendUserPasswordReset
);


/* ==========================================================
   USER AUTH
========================================================== */

router.post(
    "/user/session",
    createUserSession
);


router.get(
    "/user/me",
    firebaseUserAuth,
    getCurrentUser
);


export default router;
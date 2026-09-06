import { readFileSync } from "fs";

import {
    initializeApp,
    cert,
    getApps,
    getApp
} from "firebase-admin/app";

import {
    getFirestore
} from "firebase-admin/firestore";

import {
    getAuth
} from "firebase-admin/auth";

const serviceAccount = JSON.parse(
    readFileSync("./firebase-admin.json", "utf8")
);

const app = getApps().length
    ? getApp()
    : initializeApp({
          credential: cert(serviceAccount)
      });

const db = getFirestore(app);

const auth = getAuth(app);

// Fast circuit breaker for Firestore authentication / credential failures
let firestoreHealthy = true;
let lastFailureTime = 0;
const RETRY_COOLDOWN_MS = 60000; // 60s cooldown

export function isFirestoreAvailable() {
    if (!db) return false;
    if (!firestoreHealthy) {
        if (Date.now() - lastFailureTime > RETRY_COOLDOWN_MS) {
            return true; // Allow one probe after cooldown
        }
        return false;
    }
    return true;
}

export function markFirestoreFailure(err) {
    const msg = String(err?.message || err);
    if (
        msg.includes("16 UNAUTHENTICATED") ||
        msg.includes("invalid_grant") ||
        msg.includes("OAuth 2") ||
        msg.includes("UNAUTHENTICATED") ||
        msg.includes("devconsole-project") ||
        msg.includes("Invalid JWT Signature")
    ) {
        firestoreHealthy = false;
        lastFailureTime = Date.now();
    }
}

export function markFirestoreSuccess() {
    firestoreHealthy = true;
}

export {
    app,
    db,
    auth
};
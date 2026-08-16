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

export {
    app,
    db,
    auth
};
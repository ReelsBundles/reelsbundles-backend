import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from "../config/firebase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'download_logs.json');

function ensureFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2), 'utf8');
    }
}

export function getLocalDownloadLogs() {
    ensureFile();
    try {
        const raw = fs.readFileSync(FILE_PATH, 'utf8');
        return JSON.parse(raw) || [];
    } catch {
        return [];
    }
}

export function saveLocalDownloadLogs(logs) {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(logs, null, 2), 'utf8');
}

export async function saveDownloadLog(logData) {
    if (!logData) {
        throw new Error("Download log data is required.");
    }

    const log = {
        id: "dl_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        orderId: logData.orderId || null,
        category: logData.category || null,
        plan: logData.plan || "free",
        bundleId: logData.bundleId || null,
        bundleName: logData.bundleName || logData.bundleId || "Reels Bundle",
        fileId: logData.fileId || null,
        fileName: logData.fileName || null,
        source: logData.source || "GOOGLE_DRIVE",
        customerName: logData.customerName || logData.displayName || "Customer",
        customerEmail: logData.customerEmail || logData.email || "",
        customerPhone: logData.customerPhone || "",
        amount: logData.amount || 0,
        ip: logData.ip || "127.0.0.1",
        userAgent: logData.userAgent || "Browser",
        status: logData.status || "SUCCESS",
        createdAt: new Date().toISOString()
    };

    // 1. Save to local JSON
    const logs = getLocalDownloadLogs();
    logs.unshift(log);
    saveLocalDownloadLogs(logs);

    // 2. Try Firestore
    try {
        if (db) {
            await db.collection("download_logs").add(log);
        }
    } catch (err) {
        console.warn("[DOWNLOAD LOG] Firestore save warning:", err?.message);
    }

    return true;
}

export function deleteAllLocalDownloadLogs() {
    saveLocalDownloadLogs([]);
    return true;
}
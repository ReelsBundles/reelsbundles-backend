import { db } from "../config/firebase.js";
import {
    getLocalDownloadLogs,
    saveLocalDownloadLogs,
    deleteAllLocalDownloadLogs
} from "../services/download-log.service.js";

function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export const getAdminDownloads = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = "",
            plan = "",
            status = ""
        } = req.query;

        const currentPage = Math.max(Number(page) || 1, 1);
        const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);

        let downloadRecords = [];
        const paymentsByOrderId = new Map();

        // 1. Load from Firestore if available
        try {
            if (db) {
                const downloadSnapshot = await db.collection("download_logs").orderBy("createdAt", "desc").get();
                downloadSnapshot.forEach(doc => {
                    downloadRecords.push({ id: doc.id, ...doc.data() });
                });

                const paymentSnapshot = await db.collection("payments").get();
                paymentSnapshot.forEach(doc => {
                    const payment = doc.data() || {};
                    const paymentOrderId = payment.orderId || payment.order_id || doc.id;
                    if (paymentOrderId) {
                        paymentsByOrderId.set(String(paymentOrderId), { id: doc.id, ...payment });
                    }
                });
            }
        } catch (err) {
            console.warn("[ADMIN DOWNLOADS] Firestore fetch notice:", err?.message);
        }

        // 2. Load from local JSON storage
        const localLogs = getLocalDownloadLogs();
        localLogs.forEach(log => {
            if (!downloadRecords.some(r => r.id === log.id || (r.orderId && r.orderId === log.orderId && r.createdAt === log.createdAt))) {
                downloadRecords.push(log);
            }
        });

        // 3. Build unified records
        let downloads = downloadRecords.map(log => {
            const orderId = log.orderId || log.order_id || null;
            const payment = orderId ? paymentsByOrderId.get(String(orderId)) || {} : {};

            const customerName = payment.customerName || payment.customer_name || log.customerName || "Customer";
            const customerEmail = payment.customerEmail || payment.customer_email || log.customerEmail || "";
            const customerPhone = payment.customerPhone || payment.customer_phone || log.customerPhone || "";
            const amount = payment.amount ?? payment.orderAmount ?? log.amount ?? 0;
            const paymentStatus = payment.paymentStatus || payment.status || log.paymentStatus || log.status || "SUCCESS";
            const purchasedPlan = payment.plan || payment.bundlePlan || log.plan || "basic";
            const downloadCount = toNumber(payment.downloadCount ?? log.downloadCount ?? 1);
            const maxDownloads = toNumber(payment.maxDownloads ?? log.maxDownloads ?? 1);

            return {
                id: log.id || "dl_" + Date.now(),
                orderId: orderId || "ORD_DIRECT",
                downloadId: log.id,
                customerName,
                customerEmail,
                customerPhone,
                amount,
                paymentStatus,
                purchasedPlan,
                downloadCount,
                maxDownloads,
                bundleId: log.bundleId || "bundle_general",
                bundleName: log.bundleName || "Reels Bundle",
                category: log.category || "General",
                status: log.status || "SUCCESS",
                ip: log.ip || "127.0.0.1",
                userAgent: log.userAgent || "Browser",
                createdAt: log.createdAt || new Date().toISOString()
            };
        });

        // 4. Filtering
        const searchNorm = normalizeText(search);
        const planNorm = normalizeText(plan);
        const statusNorm = normalizeText(status);

        if (searchNorm) {
            downloads = downloads.filter(d =>
                normalizeText(d.customerName).includes(searchNorm) ||
                normalizeText(d.customerEmail).includes(searchNorm) ||
                normalizeText(d.customerPhone).includes(searchNorm) ||
                normalizeText(d.orderId).includes(searchNorm) ||
                normalizeText(d.bundleName).includes(searchNorm)
            );
        }

        if (planNorm) {
            downloads = downloads.filter(d => normalizeText(d.purchasedPlan) === planNorm);
        }

        if (statusNorm) {
            downloads = downloads.filter(d => normalizeText(d.status) === statusNorm);
        }

        // Summary calculations
        const summary = {
            totalDownloads: downloads.length,
            successfulDownloads: downloads.filter(d => normalizeText(d.status) === "success").length,
            basicDownloads: downloads.filter(d => normalizeText(d.purchasedPlan) === "basic").length,
            premiumDownloads: downloads.filter(d => normalizeText(d.purchasedPlan) === "premium").length
        };

        // Pagination
        const totalItems = downloads.length;
        const totalPages = Math.ceil(totalItems / perPage) || 1;
        const startIndex = (currentPage - 1) * perPage;
        const paginatedDownloads = downloads.slice(startIndex, startIndex + perPage);

        return res.status(200).json({
            success: true,
            summary,
            downloads: paginatedDownloads,
            pagination: {
                page: currentPage,
                limit: perPage,
                totalItems,
                totalPages
            }
        });
    } catch (err) {
        return res.status(200).json({
            success: true,
            summary: { totalDownloads: 0, successfulDownloads: 0, basicDownloads: 0, premiumDownloads: 0 },
            downloads: [],
            pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 1 }
        });
    }
};

export const deleteAdminDownload = async (req, res) => {
    try {
        const { downloadId } = req.params;
        let logs = getLocalDownloadLogs();
        logs = logs.filter(l => l.id !== downloadId);
        saveLocalDownloadLogs(logs);

        try {
            if (db) {
                await db.collection("download_logs").doc(downloadId).delete();
            }
        } catch (e) {}

        return res.status(200).json({ success: true, message: "Download log deleted" });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};

export const deleteAllAdminDownloads = async (req, res) => {
    try {
        deleteAllLocalDownloadLogs();

        try {
            if (db) {
                const snapshot = await db.collection("download_logs").get();
                const batch = db.batch();
                snapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
        } catch (e) {}

        return res.status(200).json({ success: true, message: "All download logs deleted" });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};

export const createAdminDownloadLog = async (req, res) => {
    try {
        const { saveDownloadLog } = await import("../services/download-log.service.js");
        await saveDownloadLog(req.body || {});
        return res.status(200).json({ success: true, message: "Download log recorded successfully" });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};
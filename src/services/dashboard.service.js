import { db, isFirestoreAvailable, markFirestoreFailure, markFirestoreSuccess } from "../config/firebase.js";
import { loadLocalPayments } from "./payment-storage.service.js";
import { getLocalDownloadLogs } from "./download-log.service.js";
import { loadLocalBundles } from "./bundle.service.js";
import { getAllUsers } from "./user-storage.service.js";

let cachedStats = null;
let lastStatsFetch = 0;
const STATS_CACHE_TTL = 5000; // 5 seconds memory cache

export function invalidateDashboardStatsCache() {
    cachedStats = null;
    lastStatsFetch = 0;
}

export async function getDashboardStats() {
    if (cachedStats && (Date.now() - lastStatsFetch < STATS_CACHE_TTL)) {
        return cachedStats;
    }

    let payments = [];
    let downloads = [];
    let bundles = [];
    let users = [];

    let fetchedFromDb = false;
    if (db && isFirestoreAvailable()) {
        try {
            const paymentsRef = db.collection("payments");
            const downloadsRef = db.collection("download_logs");
            const bundlesRef = db.collection("bundles");
            const usersRef = db.collection("users");

            const [
                paymentsSnap,
                downloadsSnap,
                bundlesSnap,
                usersSnap
            ] = await Promise.all([
                paymentsRef.limit(50).get(),
                downloadsRef.limit(50).get(),
                bundlesRef.limit(50).get(),
                usersRef.limit(50).get()
            ]);

            payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            downloads = downloadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            bundles = bundlesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            fetchedFromDb = true;
            markFirestoreSuccess();
        } catch (err) {
            markFirestoreFailure(err);
            console.warn("[DASHBOARD SERVICE] Firestore getDashboardStats warning (fallback to local):", err.message);
        }
    }

    if (!fetchedFromDb || payments.length === 0) {
        const localP = loadLocalPayments();
        if (localP.length > 0) payments = localP;
    }
    if (!fetchedFromDb || downloads.length === 0) {
        const localD = getLocalDownloadLogs();
        if (localD.length > 0) downloads = localD;
    }
    if (!fetchedFromDb || bundles.length === 0) {
        const localB = loadLocalBundles();
        if (localB.length > 0) bundles = localB;
    }
    if (!fetchedFromDb || users.length === 0) {
        const localU = getAllUsers();
        if (localU.length > 0) users = localU;
    }

    let revenue = 0;
    let paidOrdersCount = 0;
    const recentOrdersList = [];
    const recentDownloadsList = [];

    // Sort payments desc
    const sortedPayments = [...payments].sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
    });

    sortedPayments.forEach(data => {
        const isPaid = String(data.paymentStatus || data.status || "").toUpperCase() === "PAID" || String(data.paymentStatus || data.status || "").toUpperCase() === "SUCCESS";
        if (isPaid) {
            revenue += Number(data.amount || data.orderAmount || 0);
            paidOrdersCount++;
        }

        if (recentOrdersList.length < 5) {
            recentOrdersList.push({
                id: data.id || data.orderId,
                customerName: data.customerName || data.customer_name || data.name || "Customer",
                email: data.customerEmail || data.customer_email || data.email || "—",
                amount: data.amount || data.orderAmount || 0,
                plan: data.bundlePlan || data.plan || "premium",
                status: isPaid ? "PAID" : "PENDING",
                date: data.createdAt || data.updatedAt || new Date().toISOString()
            });
        }
    });

    // Sort downloads desc
    const sortedDownloads = [...downloads].sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
    });

    sortedDownloads.slice(0, 5).forEach(data => {
        recentDownloadsList.push({
            id: data.id,
            customerName: data.customerName || data.name || "Customer",
            bundleName: data.bundleName || "Reels Bundle",
            plan: data.plan || "basic",
            status: data.status || "SUCCESS",
            date: data.createdAt || new Date().toISOString()
        });
    });

    const result = {
        orders: payments.length,
        paidOrders: paidOrdersCount,
        revenue,
        downloads: downloads.length,
        bundles: bundles.length,
        users: users.length,
        recentOrders: recentOrdersList,
        recentDownloads: recentDownloadsList
    };

    cachedStats = result;
    lastStatsFetch = Date.now();

    return result;
}
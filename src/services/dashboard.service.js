import { db } from "../config/firebase.js";

export async function getDashboardStats() {
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
        paymentsRef.get(),
        downloadsRef.get(),
        bundlesRef.get(),
        usersRef.get()
    ]);

    let revenue = 0;
    let paidOrdersCount = 0;
    const recentOrdersList = [];
    const recentDownloadsList = [];

    // Sort payments desc
    const sortedPayments = paymentsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
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
    const sortedDownloads = downloadsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
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

    return {
        orders: paymentsSnap.size,
        paidOrders: paidOrdersCount,
        revenue,
        downloads: downloadsSnap.size,
        bundles: bundlesSnap.size,
        users: usersSnap.size,
        recentOrders: recentOrdersList,
        recentDownloads: recentDownloadsList
    };
}
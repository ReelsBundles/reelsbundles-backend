import {
    getPlan,
    generateOrder
} from "../services/payment.service.js";

import {
    createUroPayOrder,
    verifyUroPayOrder,
    getUroPayCredentials
} from "../services/uropay.service.js";

import {
    savePayment,
    getPayment,
    updatePayment
} from "../services/payment-storage.service.js";

import {
    generateDownloadToken,
    hashDownloadToken,
    getTokenExpiry
} from "../utils/token.js";

import {
    getCouponByCode,
    fetchCouponsAsync,
    incrementCouponUsage
} from "../services/coupon-storage.service.js";

/* ==========================================================
   CREATE PAYMENT ORDER
========================================================== */
export const createOrder = async (req, res) => {
    try {
        const { plan, fullName, phone, couponCode } = req.body;

        if (!req.user?.uid) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const selectedPlan = getPlan(plan);
        if (!selectedPlan) {
            return res.status(400).json({
                success: false,
                message: "Invalid plan selected."
            });
        }

        let baseAmount = Number(selectedPlan.amount || selectedPlan.price || 49);
        let finalAmount = baseAmount;
        let appliedCoupon = null;

        if (couponCode) {
            await fetchCouponsAsync();
            const coupon = getCouponByCode(couponCode);
            if (coupon && coupon.active !== false) {
                const now = new Date();
                const notExpired = !coupon.expiryDate || new Date(coupon.expiryDate) > now;
                const notExceeded = !coupon.maxUses || (coupon.usedCount || 0) < coupon.maxUses;

                if (notExpired && notExceeded) {
                    let discount = 0;
                    const discountType = String(coupon.discountType || "").toLowerCase();
                    const discountVal = Number(coupon.discountValue || 0);

                    if (discountType === "percentage") {
                        discount = Math.round((baseAmount * discountVal) / 100);
                        if (coupon.maxDiscount && discount > Number(coupon.maxDiscount)) {
                            discount = Number(coupon.maxDiscount);
                        }
                    } else if (discountType === "flat" || discountType === "fixed") {
                        discount = discountVal;
                    }

                    finalAmount = Math.max(1, baseAmount - discount);
                    appliedCoupon = coupon;
                }
            }
        }

        const order = generateOrder(selectedPlan);
        order.order_amount = finalAmount;
        order.customer_id = `user_${req.user.uid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}`;
        order.customer_name = fullName ? String(fullName).replace(/[^a-zA-Z0-9\s._-]/g, "").trim().slice(0, 50) || "Customer" : "Customer";
        order.customer_email = req.user.email || req.body?.email || "customer@reelsbundles.com";
        order.customer_phone = phone || req.body?.phone || "9999999999";

        /* --------------------------------------------------
           CHECK EXISTING PAYMENT (IDEMPOTENCY)
        -------------------------------------------------- */
        const existingPayment = await getPayment(order.order_id);
        if (existingPayment) {
            if (existingPayment.userUid && existingPayment.userUid !== req.user.uid) {
                return res.status(403).json({
                    success: false,
                    message: "Payment order belongs to another user."
                });
            }

            const { env } = getUroPayCredentials();
            return res.json({
                success: true,
                environment: env.toLowerCase(),
                openUrl: existingPayment.openUrl || undefined,
                order,
                payment: {
                    id: existingPayment.uropayOrderId || existingPayment.orderId,
                    tenantOrderRef: existingPayment.orderId,
                    status: existingPayment.paymentStatus,
                    openUrl: existingPayment.openUrl
                }
            });
        }

        /* --------------------------------------------------
           CREATE UROPAY ORDER
        -------------------------------------------------- */
        const frontendBaseUrl = process.env.FRONTEND_URL || "https://reelsbundles.github.io";
        const backendBaseUrl = process.env.BACKEND_URL || "https://reelsbundles-backend.onrender.com";

        const uropayOrder = await createUroPayOrder({
            tenantOrderRef: order.order_id,
            amount: order.order_amount,
            currency: order.order_currency || "INR",
            customerEmail: order.customer_email,
            customerPhone: order.customer_phone,
            returnUrl: `${frontendBaseUrl}/success.html?order_id=${encodeURIComponent(order.order_id)}`,
            webhookUrl: `${backendBaseUrl}/api/webhook/uropay`
        });

        if (appliedCoupon) {
            await incrementCouponUsage(appliedCoupon.code);
        }

        const downloadToken = generateDownloadToken();
        const downloadTokenHash = hashDownloadToken(downloadToken);
        const expiresAt = getTokenExpiry(10);

        await savePayment({
            orderId: order.order_id,
            gateway: "UROPAY",
            uropayOrderId: uropayOrder.id || null,
            tenantOrderRef: order.order_id,
            amount: order.order_amount,
            currency: order.order_currency || "INR",
            paymentStatus: uropayOrder.status || "PENDING",
            openUrl: uropayOrder.openUrl || null,
            userUid: req.user.uid,
            bundlePlan: selectedPlan.id,
            customerName: order.customer_name || "",
            customerEmail: order.customer_email || "",
            customerPhone: order.customer_phone || "",
            downloadTokenHash,
            downloadCount: 0,
            maxDownloads: 1,
            downloadLock: false,
            expiresAt,
            createdAt: new Date()
        });

        const { env } = getUroPayCredentials();

        return res.json({
            success: true,
            environment: env.toLowerCase(),
            openUrl: uropayOrder.openUrl,
            order,
            payment: {
                id: uropayOrder.id,
                tenantOrderRef: uropayOrder.tenantOrderRef || order.order_id,
                status: uropayOrder.status || "PENDING",
                openUrl: uropayOrder.openUrl,
                payment_session_id: uropayOrder.openUrl
            },
            download: {
                token: downloadToken,
                expiresAt
            }
        });
    } catch (error) {
        console.error("CREATE ORDER ERROR:", error);
        const statusCode = error.statusCode || error.status || 400;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Unable to create payment order."
        });
    }
};

/* ==========================================================
   VERIFY PAYMENT
========================================================== */
export const verifyOrder = async (req, res) => {
    try {
        if (!req.user?.uid) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const { orderId } = req.params;
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: "Order ID is required."
            });
        }

        console.log("[Payment] Verifying order:", orderId);
        const storedPayment = await getPayment(orderId);

        if (!storedPayment) {
            return res.status(404).json({
                success: false,
                message: "Payment order not found."
            });
        }

        if (storedPayment.userUid !== req.user.uid) {
            return res.status(403).json({
                success: false,
                message: "You are not allowed to verify this payment order."
            });
        }

        /* --------------------------------------------------
           VERIFY WITH UROPAY API
        -------------------------------------------------- */
        let uropayStatus = storedPayment.paymentStatus;
        let uropayPayment = null;

        // If not already verified locally, fetch authoritative status from UroPay
        if (storedPayment.paymentStatus !== "PAID") {
            const targetUroPayId = storedPayment.uropayOrderId || orderId;
            console.log("[Payment] Checking UroPay API for order:", targetUroPayId);

            try {
                uropayPayment = await verifyUroPayOrder(targetUroPayId);
                uropayStatus = uropayPayment?.status || storedPayment.paymentStatus;
            } catch (err) {
                console.warn("[Payment] Error querying UroPay API, falling back to local state:", err.message);
            }
        }

        if (String(uropayStatus).toUpperCase() !== "PAID") {
            return res.status(403).json({
                success: false,
                message: "Payment not completed.",
                orderStatus: uropayStatus || null
            });
        }

        const downloadToken = generateDownloadToken();
        const downloadTokenHash = hashDownloadToken(downloadToken);
        const expiresAt = getTokenExpiry(10);
        const bundlePlan = storedPayment.bundlePlan || storedPayment.bundle_plan || "basic";

        await updatePayment(orderId, {
            paymentStatus: "PAID",
            uropayOrderId: uropayPayment?.id || storedPayment.uropayOrderId || null,
            amount: uropayPayment?.amount || storedPayment.amount,
            currency: uropayPayment?.currency || storedPayment.currency || "INR",
            userUid: storedPayment.userUid,
            bundlePlan,
            downloadTokenHash,
            downloadCount: 0,
            maxDownloads: storedPayment.maxDownloads || 1,
            downloadLock: false,
            expiresAt,
            paidAt: storedPayment.paidAt || new Date(),
            updatedAt: new Date()
        });

        console.log("[Payment] Payment verified successfully:", orderId);

        const currentAmount = uropayPayment?.amount || storedPayment.amount || 49;

        return res.json({
            success: true,
            payment: {
                order_id: orderId,
                order_amount: currentAmount,
                order_currency: storedPayment.currency || "INR",
                order_status: "PAID"
            },
            order: {
                order_id: orderId,
                order_amount: currentAmount,
                order_status: "PAID",
                order_note: "ReelsBundles Purchase"
            },
            download: {
                token: downloadToken,
                expiresAt
            }
        });
    } catch (error) {
        console.error("[Payment] VERIFY ORDER ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error?.message || "Payment verification failed."
        });
    }
};
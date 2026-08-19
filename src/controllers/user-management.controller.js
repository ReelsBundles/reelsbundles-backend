import {
    getAllUsers,
    syncUser,
    deleteUser,
    toggleUserStatus,
    getUserStatus
} from "../services/user-storage.service.js";
import { db } from "../config/firebase.js";

export async function handleSyncUser(req, res) {
    try {
        const userData = req.body || {};
        const uid = userData.uid;
        const email = userData.email ? String(userData.email).trim().toLowerCase() : "";
        let isSuspended = false;
        let suspensionReason = "Account suspended due to security violations.";

        if (db) {
            try {
                if (uid) {
                    const fsDoc = await db.collection("users").doc(uid).get();
                    if (fsDoc.exists) {
                        const fsData = fsDoc.data() || {};
                        if (fsData.locked === true || fsData.status === "SUSPENDED" || fsData.status === "disabled") {
                            isSuspended = true;
                            suspensionReason = fsData.suspensionReason || suspensionReason;
                        }
                    }
                }
                if (!isSuspended && email) {
                    const snap = await db.collection("users").where("email", "==", email).get();
                    if (!snap.empty) {
                        for (const doc of snap.docs) {
                            const fsData = doc.data() || {};
                            if (fsData.locked === true || fsData.status === "SUSPENDED" || fsData.status === "disabled") {
                                isSuspended = true;
                                suspensionReason = fsData.suspensionReason || suspensionReason;
                                break;
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        const synced = syncUser(userData);

        if (!isSuspended && synced) {
            if (synced.locked === true || synced.status === "SUSPENDED" || synced.status === "disabled") {
                isSuspended = true;
                suspensionReason = synced.suspensionReason || suspensionReason;
            }
        }

        if (isSuspended) {
            return res.status(403).json({
                success: false,
                disabled: true,
                status: "SUSPENDED",
                message: suspensionReason
            });
        }

        return res.status(200).json({
            success: true,
            status: synced?.status || "active",
            message: "User profile synced successfully",
            user: synced
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || "Failed to sync user profile"
        });
    }
}

export async function handleGetUserStatus(req, res) {
    try {
        const uid = req.query.uid || req.user?.uid;
        const rawEmail = req.query.email || req.user?.email;
        const email = rawEmail ? String(rawEmail).trim().toLowerCase() : "";

        let isSuspended = false;
        let suspensionReason = "Account suspended due to security violations.";

        if (db) {
            try {
                if (uid) {
                    const fsDoc = await db.collection("users").doc(uid).get();
                    if (fsDoc.exists) {
                        const fsData = fsDoc.data() || {};
                        if (fsData.locked === true || fsData.status === "SUSPENDED" || fsData.status === "disabled") {
                            isSuspended = true;
                            suspensionReason = fsData.suspensionReason || suspensionReason;
                        }
                    }
                }
                if (!isSuspended && email) {
                    const snap = await db.collection("users").where("email", "==", email).get();
                    if (!snap.empty) {
                        for (const doc of snap.docs) {
                            const fsData = doc.data() || {};
                            if (fsData.locked === true || fsData.status === "SUSPENDED" || fsData.status === "disabled") {
                                isSuspended = true;
                                suspensionReason = fsData.suspensionReason || suspensionReason;
                                break;
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        const result = getUserStatus(uid, email);
        if (!isSuspended && (result.disabled || result.status === "SUSPENDED" || result.user?.locked)) {
            isSuspended = true;
            suspensionReason = result.user?.suspensionReason || suspensionReason;
        }

        if (isSuspended) {
            return res.status(403).json({
                success: false,
                disabled: true,
                status: "SUSPENDED",
                message: suspensionReason
            });
        }

        return res.status(200).json({
            success: true,
            status: result.status || "active",
            disabled: false
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            status: "active",
            disabled: false
        });
    }
}

export async function handleGetAdminUsers(req, res) {
    try {
        let users = getAllUsers();

        try {
            if (db) {
                const snapshot = await db.collection("users").get();
                if (!snapshot.empty) {
                    const fsUsersMap = new Map();
                    const fsUsersByEmailMap = new Map();

                    snapshot.forEach(doc => {
                        const data = doc.data() || {};
                        fsUsersMap.set(doc.id, data);
                        if (data.email) {
                            fsUsersByEmailMap.set(String(data.email).trim().toLowerCase(), data);
                        }
                    });

                    users = users.map(u => {
                        const cleanEmail = u.email ? String(u.email).trim().toLowerCase() : "";
                        const fsData = fsUsersMap.get(u.id) ||
                                       fsUsersMap.get(u.uid) ||
                                       (cleanEmail ? fsUsersByEmailMap.get(cleanEmail) : null);

                        const isLocalSuspended = u.locked === true || u.status === "SUSPENDED" || u.status === "disabled";

                        if (fsData) {
                            const isFsSuspended = fsData.locked === true || fsData.status === "SUSPENDED" || fsData.status === "disabled";
                            const isSuspended = isFsSuspended || isLocalSuspended;
                            return {
                                ...u,
                                locked: isSuspended,
                                status: isSuspended ? "SUSPENDED" : (fsData.status || u.status || "active"),
                                suspensionReason: fsData.suspensionReason || u.suspensionReason || null
                            };
                        }

                        if (isLocalSuspended) {
                            return {
                                ...u,
                                locked: true,
                                status: "SUSPENDED",
                                suspensionReason: u.suspensionReason || "Developer tools inspection detected"
                            };
                        }

                        return u;
                    });

                    snapshot.forEach(doc => {
                        const fsData = doc.data() || {};
                        const cleanFsEmail = fsData.email ? String(fsData.email).trim().toLowerCase() : "";
                        const exists = users.some(u =>
                            u.id === doc.id ||
                            u.uid === doc.id ||
                            (cleanFsEmail && u.email && String(u.email).trim().toLowerCase() === cleanFsEmail)
                        );

                        if (!exists && fsData.email) {
                            const isFsSuspended = fsData.locked === true || fsData.status === "SUSPENDED" || fsData.status === "disabled";
                            users.push({
                                id: doc.id,
                                uid: doc.id,
                                email: fsData.email,
                                displayName: fsData.displayName || fsData.email.split('@')[0],
                                photoURL: fsData.photoURL || null,
                                providerId: fsData.providerId || "google.com",
                                plan: fsData.plan || "free",
                                locked: isFsSuspended,
                                status: isFsSuspended ? "SUSPENDED" : (fsData.status || "active"),
                                suspensionReason: fsData.suspensionReason || null,
                                createdAt: fsData.createdAt || new Date().toISOString()
                            });
                        }
                    });
                }
            }
        } catch (fsErr) {
            console.warn("[ADMIN USERS] Firestore merge warning:", fsErr);
        }

        return res.status(200).json({
            success: true,
            count: users.length,
            users: users
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to fetch users"
        });
    }
}

export function handleDeleteAdminUser(req, res) {
    try {
        const userId = req.params.userId;
        deleteUser(userId);
        return res.status(200).json({
            success: true,
            message: "User deleted successfully"
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || "Failed to delete user"
        });
    }
}

export function handleToggleAdminUserStatus(req, res) {
    try {
        const userId = req.params.userId;
        const updatedUser = toggleUserStatus(userId);
        return res.status(200).json({
            success: true,
            message: `User status changed to ${updatedUser.status}`,
            user: updatedUser
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message || "Failed to update user status"
        });
    }
}

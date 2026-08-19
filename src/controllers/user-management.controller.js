import {
    getAllUsers,
    syncUser,
    deleteUser,
    toggleUserStatus,
    getUserStatus
} from "../services/user-storage.service.js";
import { db } from "../config/firebase.js";

export function handleSyncUser(req, res) {
    try {
        const userData = req.body || {};
        const synced = syncUser(userData);

        if (synced && synced.status === "disabled") {
            return res.status(403).json({
                success: false,
                disabled: true,
                status: "disabled",
                message: "Your account has been disabled by the admin. Please contact support."
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

export function handleGetUserStatus(req, res) {
    try {
        const uid = req.query.uid || req.user?.uid;
        const email = req.query.email || req.user?.email;
        const result = getUserStatus(uid, email);
        if (result.disabled) {
            return res.status(403).json({
                success: false,
                disabled: true,
                status: "disabled",
                message: "Your account has been disabled by the admin. Please contact support."
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
                    snapshot.forEach(doc => {
                        fsUsersMap.set(doc.id, doc.data());
                    });

                    users = users.map(u => {
                        const fsData = fsUsersMap.get(u.id) || fsUsersMap.get(u.uid);
                        if (fsData) {
                            const isFsSuspended = fsData.locked === true || fsData.status === "SUSPENDED" || fsData.status === "disabled";
                            return {
                                ...u,
                                locked: isFsSuspended,
                                status: isFsSuspended ? "SUSPENDED" : (fsData.status || u.status || "active"),
                                suspensionReason: fsData.suspensionReason || u.suspensionReason || null
                            };
                        }
                        return u;
                    });

                    snapshot.forEach(doc => {
                        const fsData = doc.data();
                        const exists = users.some(u => u.id === doc.id || u.uid === doc.id);
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

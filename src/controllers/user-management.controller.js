import {
    getAllUsers,
    syncUser,
    deleteUser,
    toggleUserStatus,
    getUserStatus
} from "../services/user-storage.service.js";

export async function handleSyncUser(req, res) {
    try {
        const userData = req.body || {};
        const synced = syncUser(userData);

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

        const result = getUserStatus(uid, email);

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
        const users = getAllUsers();

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

export async function handleDeleteAllAdminUsers(req, res) {
    try {
        const { deleteAllUsers } = await import("../services/user-storage.service.js");
        await deleteAllUsers();
        return res.status(200).json({
            success: true,
            message: "All registered users deleted successfully"
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to delete all users"
        });
    }
}

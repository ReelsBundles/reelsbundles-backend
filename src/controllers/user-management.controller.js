import {
    getAllUsers,
    syncUser,
    deleteUser,
    toggleUserStatus,
    getUserStatus
} from "../services/user-storage.service.js";

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
        const identifier = req.query.uid || req.query.email || req.query.id || req.user?.uid || req.user?.email;
        const result = getUserStatus(identifier);
        return res.status(200).json({
            success: true,
            status: result.status,
            disabled: result.disabled
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            status: "active",
            disabled: false
        });
    }
}

export function handleGetAdminUsers(req, res) {
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

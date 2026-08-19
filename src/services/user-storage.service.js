import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'users.json');

function ensureFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2), 'utf8');
    }
}

export function getAllUsers() {
    ensureFile();
    try {
        const raw = fs.readFileSync(FILE_PATH, 'utf8');
        return JSON.parse(raw) || [];
    } catch {
        return [];
    }
}

export function saveUsers(users) {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(users, null, 2), 'utf8');
}

export function getUserStatus(uid, email) {
    const users = getAllUsers();
    const cleanUid = String(uid || "").trim().toLowerCase();
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanUid && !cleanEmail) return { status: "active", disabled: false };

    const user = users.find(u =>
        (cleanUid && u.uid && u.uid.toLowerCase() === cleanUid) ||
        (cleanUid && u.id && u.id.toLowerCase() === cleanUid) ||
        (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail)
    );

    if (!user) return { status: "active", disabled: false };
    return {
        status: user.status || "active",
        disabled: user.status === "disabled",
        user
    };
}

export function syncUser(userData) {
    if (!userData || (!userData.uid && !userData.email)) {
        throw new Error("Invalid user data for sync");
    }

    const users = getAllUsers();
    const cleanUid = String(userData.uid || "").trim();
    const cleanEmail = String(userData.email || "").trim().toLowerCase();

    let existing = users.find(u => (cleanUid && u.uid === cleanUid) || (cleanEmail && u.email.toLowerCase() === cleanEmail));

    if (existing) {
        if (userData.displayName) existing.displayName = userData.displayName;
        if (userData.photoURL) existing.photoURL = userData.photoURL;
        if (userData.providerId) existing.providerId = userData.providerId;
        existing.lastLoginAt = new Date().toISOString();
        saveUsers(users);
        return existing;
    } else {
        const newUser = {
            id: cleanUid || "usr_" + Date.now(),
            uid: cleanUid || "usr_" + Date.now(),
            email: cleanEmail,
            displayName: userData.displayName || cleanEmail.split('@')[0] || "User",
            photoURL: userData.photoURL || null,
            providerId: userData.providerId || "google.com",
            plan: userData.plan || "free",
            status: "active",
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
        };
        users.unshift(newUser);
        saveUsers(users);
        return newUser;
    }
}

export function deleteUser(userId) {
    let users = getAllUsers();
    const initialLen = users.length;
    users = users.filter(u => u.id !== userId && u.uid !== userId);
    if (users.length === initialLen) throw new Error("User not found");
    saveUsers(users);
    return true;
}

export function toggleUserStatus(userId) {
    const users = getAllUsers();
    const user = users.find(u => u.id === userId || u.uid === userId);
    if (!user) throw new Error("User not found");

    const isSuspended = user.locked === true || user.status === "SUSPENDED" || user.status === "disabled";
    if (isSuspended) {
        user.status = "active";
        user.locked = false;
        user.suspensionReason = null;
    } else {
        user.status = "disabled";
        user.locked = true;
        user.suspensionReason = "Manually suspended by Admin";
    }

    saveUsers(users);

    try {
        import("../config/firebase.js").then(({ db }) => {
            if (db) {
                db.collection("users").doc(userId).set({
                    locked: !isSuspended,
                    status: isSuspended ? "ACTIVE" : "SUSPENDED",
                    suspensionReason: isSuspended ? null : "Manually suspended by Admin"
                }, { merge: true }).catch(() => {});
            }
        }).catch(() => {});
    } catch (e) {}

    return user;
}

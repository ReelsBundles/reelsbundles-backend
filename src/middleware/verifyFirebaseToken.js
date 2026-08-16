import { auth } from "../config/firebase.js";

const verifyFirebaseToken = async (req, res, next) => {
    try {
        const authorization = req.headers.authorization;

        if (!authorization) {
            return res.status(401).json({
                success: false,
                message: "Authorization header missing"
            });
        }

        const token = authorization.startsWith("Bearer ")
            ? authorization.split("Bearer ")[1]
            : authorization;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Firebase Token Missing"
            });
        }

        const decodedToken = await auth.verifyIdToken(token);

        req.user = decodedToken;

        next();

    } catch (error) {

        console.error(
            "Firebase Auth Error:",
            error.message
        );

        return res.status(401).json({
            success: false,
            message: "Invalid Firebase Token"
        });
    }
};

export default verifyFirebaseToken;
import jwt from "jsonwebtoken";

export function generateAdminToken(admin) {

    return jwt.sign(

        {
            id: admin.id,
            role: "admin"
        },

        process.env.JWT_SECRET,

        {
            expiresIn: process.env.JWT_EXPIRES_IN
        }

    );

}

export function verifyAdminToken(token) {

    return jwt.verify(

        token,

        process.env.JWT_SECRET

    );

}
import dotenv from "dotenv";
import { Cashfree, CFEnvironment } from "cashfree-pg";

dotenv.config();

const cashfree = new Cashfree(
    process.env.CASHFREE_ENV === "PRODUCTION"
        ? CFEnvironment.PRODUCTION
        : CFEnvironment.SANDBOX,

    process.env.CASHFREE_CLIENT_ID,

    process.env.CASHFREE_CLIENT_SECRET
);

export default cashfree;
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json());

// ===============================
// SUPABASE CONNECT
// ===============================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET
);

// ===============================
// CREATE ACCESS TOKEN
// ===============================
app.post("/create-access", async (req, res) => {

  try {

    // 🔐 generate token
    const token = uuidv4();

    // ⏰ expiry 15 min
    const expiry = Date.now() + (15 * 60 * 1000);

    // 💾 save token
    const { error } = await supabase
      .from("access_tokens")
      .insert([
        {
          token,
          used: false,
          expiry
        }
      ]);

    // ❌ db error
    if (error) {

      return res.status(500).json({
        success: false,
        message: error.message
      });

    }

    // ✅ response
    return res.json({
      success: true,
      token
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      message: err.message
    });

  }

});

// ===============================
// VERIFY TOKEN
// ===============================
app.get("/verify-token", async (req, res) => {

  try {

    const token = req.query.token;

    // ❌ no token
    if (!token) {

      return res.json({
        valid: false
      });

    }

    // 🔎 find token
    const { data, error } = await supabase
      .from("access_tokens")
      .select("*")
      .eq("token", token)
      .single();

    // ❌ invalid token
    if (error || !data) {

      return res.json({
        valid: false
      });

    }

    // ❌ already used
    if (data.used) {

      return res.json({
        valid: false,
        message: "Already Used"
      });

    }

    // ❌ expired
    if (Date.now() > data.expiry) {

      return res.json({
        valid: false,
        message: "Expired"
      });

    }

    // ✅ valid
    return res.json({
      valid: true
    });

  } catch (err) {

    return res.status(500).json({
      valid: false,
      message: err.message
    });

  }

});

// ===============================
// CONSUME TOKEN
// ===============================
app.post("/consume-token", async (req, res) => {

  try {

    const { token } = req.body;

    // ❌ no token
    if (!token) {

      return res.json({
        success: false
      });

    }

    // 🔒 mark used
    const { error } = await supabase
      .from("access_tokens")
      .update({
        used: true
      })
      .eq("token", token);

    // ❌ db error
    if (error) {

      return res.status(500).json({
        success: false,
        message: error.message
      });

    }

    // ✅ success
    return res.json({
      success: true
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      message: err.message
    });

  }

});

// ===============================
// CASHFREE WEBHOOK
// ===============================
app.post("/webhook", async (req, res) => {

  try {

    console.log(
      "Cashfree Webhook:",
      JSON.stringify(req.body, null, 2)
    );

    // 🔥 FULL BODY
    const body = req.body;

    // 🔥 ORDER ID
    const orderId =
      body?.data?.order?.order_id ||
      body?.order_id ||
      body?.data?.order_id;

    // 🔥 PAYMENT STATUS
    const paymentStatus =
     body?.data?.order?.order_status ||
     body?.order_status ||
     body?.data?.order_status;

    console.log("ORDER ID:", orderId);
    console.log("PAYMENT STATUS:", paymentStatus);

    // ❌ no order id
    if(!orderId){

      return res.status(200).json({
        success:false,
        message:"No Order ID"
      });

    }

    // ✅ SUCCESS PAYMENT
     if(paymentStatus === "PAID"){

      // 💾 SAVE VERIFIED PAYMENT
      await supabase
      .from("payments")
      .upsert([
        {
          order_id: orderId,
          paid: true
        }
      ]);

      console.log("PAYMENT VERIFIED ✅");

    }

    // ✅ ALWAYS SUCCESS RESPONSE
    return res.status(200).json({
      success:true
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({
      success:false,
      message:err.message
    });

  }

});
// ===============================
// VERIFY LATEST PAYMENT
// ===============================
app.get("/latest-payment", async (req, res) => {

  try {

    // 🔎 latest paid order
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("paid", true)
      .order("created_at", {
        ascending:false
      })
      .limit(1)
      .single();

    // ❌ no payment
    if(error || !data){

      return res.json({
        success:false
      });

    }

    // 🔐 generate token
    const token = uuidv4();

    // ⏰ expiry
    const expiry =
    Date.now() + (15 * 60 * 1000);

    // 💾 save token
    await supabase
      .from("access_tokens")
      .insert([
        {
          token,
          used:false,
          expiry
        }
      ]);

    // ✅ send token
    return res.json({
      success:true,
      token
    });

  } catch(err){

    return res.status(500).json({
      success:false,
      message:err.message
    });

  }

});
// ===============================
// ROOT CHECK
// ===============================
app.get("/", (req, res) => {

  res.send("Vault Backend Running ✅");

});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log("Server Running On Port " + PORT);

});

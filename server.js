const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 SUPABASE CONNECT
const supabase = createClient(
  "https://bpjsoaqdakiydgrllber.supabase.co",
  "sb_publishable_gOocpQ9Tn_pwJzt2nE1CtQ_5o3MxUrV"
);

// ===============================
// CREATE ACCESS TOKEN
// ===============================
app.post("/create-access", async (req, res) => {

  try {

    // 🔐 auto token generate
    const token = uuidv4();

    // ⏰ 15 min expiry
    const expiry = Date.now() + (15 * 60 * 1000);

    // 💾 save in database
    const { error } = await supabase
      .from("access_tokens")
      .insert([
        {
          token,
          used: false,
          expiry
        }
      ]);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    // ✅ send token
    res.json({
      success: true,
      token
    });

  } catch (err) {

    res.status(500).json({
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

    if (error || !data) {
      return res.json({
        valid: false
      });
    }

    // ❌ already used
    if (data.used) {
      return res.json({
        valid: false,
        message: "Already used"
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
    res.json({
      valid: true
    });

  } catch (err) {

    res.status(500).json({
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

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.json({
      success: true
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message
    });

  }

});
// ===============================
// PAYMENT WEBHOOK
// ===============================

// GET TEST
app.get("/webhook",(req,res)=>{

  res.send("Webhook Working ✅");

});
// REAL WEBHOOK
app.post("/webhook", async (req, res) => {

  try {

    console.log("Webhook Data:", req.body);

    // 🔐 token generate
    const token = uuidv4();

    // ⏰ expiry
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

    // ✅ ALWAYS SUCCESS RESPONSE
    return res.status(200).json({
      success: true,
      message: "Webhook Received",
      token
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({
      success: false,
      message: err.message
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

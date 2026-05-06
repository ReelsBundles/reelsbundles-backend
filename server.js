const express = require("express");
const cors = require("cors");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const FILE = "tokens.json";

// read db
function readTokens(){
  if(!fs.existsSync(FILE)){
    fs.writeFileSync(FILE, "[]");
  }

  return JSON.parse(fs.readFileSync(FILE));
}

// save db
function saveTokens(data){
  fs.writeFileSync(FILE, JSON.stringify(data,null,2));
}

// create token after payment
app.post("/create-access", (req,res)=>{

  const token = uuidv4();

  const tokens = readTokens();

  tokens.push({
    token,
    used:false,
    expiry: Date.now() + (15*60*1000)
  });

  saveTokens(tokens);

  res.json({
    success:true,
    token
  });

});

// verify token
app.get("/verify-token", (req,res)=>{

  const { token } = req.query;

  const tokens = readTokens();

  const found = tokens.find(t=>t.token===token);

  if(!found){
    return res.json({
      valid:false,
      message:"Invalid token"
    });
  }

  if(found.used){
    return res.json({
      valid:false,
      message:"Already used"
    });
  }

  if(Date.now() > found.expiry){
    return res.json({
      valid:false,
      message:"Expired"
    });
  }

  res.json({
    valid:true
  });

});

// consume token
app.post("/consume-token",(req,res)=>{

  const { token } = req.body;

  const tokens = readTokens();

  const found = tokens.find(t=>t.token===token);

  if(found){
    found.used = true;
    saveTokens(tokens);
  }

  res.json({
    success:true
  });

});

app.listen(PORT,()=>{
  console.log("Server Running");
});

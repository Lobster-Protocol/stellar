import express from "express";
import { connect, StringCodec } from "nats";

const app = express();
const PORT = process.env.PORT || 8080;
const NATS_URL = process.env.NATS_URL || "nats://nats-server:4222";
const NATS_SUBJECT = process.env.NATS_SUBJECT || "events";

app.use(express.json()); // parse JSON body

let nc; // NATS connection
let sc = StringCodec();

// Connect to NATS
async function initNats() {
  try {
    console.log(`🚀 Connecting to NATS at ${NATS_URL}`);
    nc = await connect({ servers: NATS_URL });
    console.log("✅ Connected to NATS");
  } catch (err) {
    console.error("❌ Failed to connect to NATS:", err.message);
    process.exit(1);
  }
}
// Simple ping endpoint
app.get("/ping", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    nats: nc ? "connected" : "disconnected"
  });
});
// API endpoint: Subquery Node will call this
app.post("/publish", async (req, res) => {
  if (!nc) {
    return res.status(500).json({ error: "NATS not connected" });
  }

  const { subject, data } = req.body;

  if (!data) {
    return res.status(400).json({ error: "Missing data" });
  }

  try {
    const targetSubject = subject || NATS_SUBJECT;
    nc.publish(targetSubject, sc.encode(JSON.stringify(data)));
    console.log(`📩 Published to [${targetSubject}]:`, data);

    res.json({ status: "ok", subject: targetSubject });
  } catch (err) {
    console.error("❌ Error publishing to NATS:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Express API running on port ${PORT}`);
  await initNats();
});

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const { TIER1_GALI, PARTY_WORDS, INSULT_WORDS, getPrompt } = require('./prompt');
const Groq = require("groq-sdk");
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let latestQR = null;

// --- Express Server for Render ---
app.get('/', (req, res) => res.send("NDP Bot Running"));

app.get('/qr', async (req, res) => {
  if (!latestQR) return res.send("<h2>✅ BOT CONNECTED - No QR needed now.<br>Or waiting for QR, refresh in 5 sec.</h2>");
  const qrImage = await QRCode.toDataURL(latestQR);
  res.send(`<div style="text-align:center"><img src="${qrImage}" width="350"><h2>Scan within 20 sec</h2></div><script>setTimeout(()=>location.reload(),10000)</script>`);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port", process.env.PORT || 3000);
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- YOUR NEW LOGIC: >3 words + political only ---
async function checkMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  console.log(`Checking: "${text}" | Words: ${wordCount}`);

  // 1. Hard gali always delete
  if (TIER1_GALI.some(w => lower.includes(w.toLowerCase()))) {
    console.log("-> BLOCKED by GALI");
    return true;
  }

  // 2. NEW RULE: If <=3 words, ALLOW (Fixes "Rup bhalo")
  if (wordCount <= 3) {
    console.log("-> ALLOWED: <=3 words");
    return false;
  }

  // 3. NEW RULE: If no political party word, ALLOW
  const hasParty = PARTY_WORDS.some(p => lower.includes(p.toLowerCase()));
  if (!hasParty) {
    console.log("-> ALLOWED: no political context");
    return false;
  }

  // 4. Only now call Groq AI
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: getPrompt(text) }],
      model: "llama-3.1-8b-instant",
    });
    const reply = (chatCompletion.choices[0]?.message?.content || "ALLOW").trim().toUpperCase();
    console.log(`-> AI: ${reply}`);
    return reply.includes("BLOCK");
  } catch (e) {
    console.log("Groq fail", e.message);
    const hasInsult = INSULT_WORDS.some(i => lower.includes(i.toLowerCase()));
    return hasParty && hasInsult;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const sock = makeWASocket({ auth: state, logger: P({ level: "silent" }) });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) latestQR = qr;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log("✅ BOT CONNECTED");
      latestQR = null;
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
      if (!text) continue;

      const shouldDelete = await checkMessage(text);
      if (shouldDelete) {
        try {
          await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
          console.log(">>> DELETED SUCCESSFULLY");
        } catch (err) {
          console.log(">>> DELETE FAILED - MAKE BOT ADMIN", err.message);
        }
      }
    }
  });
}

startBot();

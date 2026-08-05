const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const { TIER1_GALI, PARTY_WORDS, INSULT_WORDS, getPrompt } = require('./prompt');
const Groq = require("groq-sdk");
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let latestQR = null;

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

async function checkMessage(text) {
  if (!text) return { shouldDelete: false };
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  console.log(`Checking: "${text}" | Words: ${wordCount}`);

  // Pre-check for semantic gali
  const hasParty = PARTY_WORDS.some(p => lower.includes(p.toLowerCase()));
  const hasMamta = ['mamata','mamta','momo','didi','pishi','pisi'].some(k=>lower.includes(k));
  const hasInsult = INSULT_WORDS.some(i => lower.includes(i.toLowerCase()));
  const hasPersonal = ['tui','tora','tor','toder','bap','ma'].some(k=>lower.includes(k));

  // 1. Gali with word boundary fix (tmc!= mc)
  const galiFound = TIER1_GALI.find(w => {
    const pattern = new RegExp(`\\b${w.toLowerCase()}\\b`, 'i');
    return pattern.test(lower);
  });
  if (galiFound) {
    console.log("-> BLOCKED by GALI");
    return { shouldDelete: true };
  }

  // 2. FIX: tmc chor / bjp dalal / tui chor = SEMANTIC GALI / PERSONAL ATTACK - BLOCK even if 2 words
  if ((hasParty || hasMamta) && hasInsult || (hasPersonal && hasInsult)) {
    console.log("-> BLOCKED by Semantic Gali / Personal Attack");
    return { shouldDelete: true };
  }

  // 3. Now allow short messages
  if (wordCount <= 3) {
    console.log("-> ALLOWED: <=3 words");
    return { shouldDelete: false };
  }

  if (!hasParty &&!hasMamta) {
    console.log("-> ALLOWED: no political context");
    return { shouldDelete: false };
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: getPrompt(text) }],
      model: "llama-3.1-8b-instant",
    });
    const raw = (chatCompletion.choices[0]?.message?.content || "").trim();
    console.log(`-> AI raw: ${raw}`);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const isBlock = raw.toUpperCase().includes("BLOCK");
      parsed = { decision: isBlock? "BLOCK" : "ALLOW" };
    }
    return { shouldDelete: parsed.decision === "BLOCK" };
  } catch (e) {
    console.log("Groq fail", e.message);
    return { shouldDelete: false };
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
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
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

      const { shouldDelete } = await checkMessage(text);
      if (shouldDelete) {
        try {
          // ONLY FLAG, NO DELETE, NO REASON
          await sock.sendMessage(msg.key.remoteJid, {
            text: `Bagha da is watching 🐯🐅`
          }, { quoted: msg });
          console.log(">>> FLAGGED ONLY, NOT DELETED");
        } catch (err) {
          console.log(">>> SEND FAILED", err.message);
        }
      }
    }
  });
}

startBot();

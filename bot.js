const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const { TIER1_GALI, PARTY_WORDS, INSULT_WORDS, getPrompt } = require("./prompt");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let latestQR = null;

app.get('/', (req,res) => res.send('NDP Bot Running'));
app.get('/qr', async (req,res) => {
  if (!latestQR) return res.send('<h2>✅ BOT CONNECTED - No QR needed now.<br>Or waiting for QR, refresh in 5 sec.</h2>');
  const qrImage = await QRCode.toDataURL(latestQR);
  res.send(`<div style="text-align:center"><img src="${qrImage}" width="350"><h2>Scan within 20 sec</h2></div><script>setTimeout(()=>location.reload(),10000)</script>`);
});
app.listen(process.env.PORT || 3000, () => console.log('Server running'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });

async function checkMessage(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  console.log(`Checking: ${text}`);
  if (TIER1_GALI.some(w => lower.includes(w.toLowerCase()))) {
    console.log('-> BLOCKED by GALI');
    return true;
  }
  if (PARTY_WORDS.some(p => lower.includes(p)) && INSULT_WORDS.some(i => lower.includes(i))) {
    console.log('-> BLOCKED by PARTY+INSULT');
    return true;
  }
  try {
    const result = await model.generateContent(getPrompt(text));
    const reply = result.response.text().trim().toUpperCase();
    console.log(`-> AI: ${reply}`);
    return reply.includes('BLOCK');
  } catch (e) {
    console.log('Gemini fail', e.message);
    return PARTY_WORDS.some(p => lower.includes(p));
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }), browser: ["NDP","Chrome","1.0"] });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      latestQR = qr;
      console.log('QR READY -> Go to https://YOUR-APP.onrender.com/qr to scan');
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
    if (connection === 'open') {
      latestQR = null;
      console.log('*** BOT CONNECTED ***');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) continue;
      const shouldDelete = await checkMessage(text);
      if (shouldDelete) {
        try {
          await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
          console.log('>>> DELETED SUCCESSFULLY');
        } catch (err) {
          console.log('>>> DELETE FAILED - MAKE BOT ADMIN', err.message);
        }
      }
    }
  });
}
startBot();

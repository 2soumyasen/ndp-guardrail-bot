const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const P = require("pino");
const express = require("express");
const { TIER1_GALI, getPrompt } = require("./prompt"); // <-- NEW

// Render keep alive
const app = express();
app.get('/', (req, res) => res.send('NDP Bot Alive'));
app.listen(process.env.PORT || 10000, () => console.log('PORT BIND OK'));

// Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Your other configs
const antilinkGroups = new Set(); // your existing

async function checkMessage(text) {
  if (!text || text.length < 2) return false;
  const lower = text.toLowerCase();
  if (TIER1_GALI.some(w => lower.includes(w.toLowerCase()))) {
    console.log('>>> TIER1 GALI BLOCK');
    return true;
  }
  try {
    const result = await model.generateContent(getPrompt(text));
    const reply = result.response.text().trim().toUpperCase();
    console.log(`AI: "${text.slice(0,35)}" => ${reply}`);
    return reply.includes('BLOCK');
  } catch (e) {
    console.error('Gemini error:', e.message);
    return false;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["NDP", "Chrome", "1.0"]
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    if (u.connection === 'open') console.log('*** BOT CONNECTED ***');
  });

  // Your other call: participants update
  sock.ev.on('group-participants.update', async (update) => {
    // your welcome/goodbye logic here - KEEP AS IT IS
  });

  // Main message handler - ALL your calls in ONE place
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      const jid = m.key.remoteJid;
      const isGroup = jid.endsWith('@g.us');
      const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
      const lowerText = text.toLowerCase();

      // ===== YOUR OTHER CALLS =====
      // 1. Antilink (your existing logic)
      if (isGroup && antilinkGroups.has(jid) && /https?:\/\/|www\.|chat\.whatsapp\.com/.test(lowerText)) {
        try { await sock.sendMessage(jid, { delete: m.key }); } catch {}
        continue;
      }

      // 2. Your commands like !admin, !promote etc
      if (text.startsWith('!')) {
        // your command handler here
        // if (text === '!admin') ...
        continue;
      }

      // ===== 3. NEW POLITICAL FILTER (with separate prompt file) =====
      if (!isGroup) continue;
      if (!text) continue;

      if (await checkMessage(text)) {
        try {
          await sock.sendMessage(jid, { delete: m.key });
          console.log('*** DELETED POLITICAL ***');
        } catch { console.log('DELETE FAILED - Make bot Admin!'); }
      }
    }
  });
}
startBot();

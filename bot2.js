const Baileys = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const makeWASocket = Baileys.default;
const { useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = Baileys;

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('NDP Guard + Gemini Running'));
app.listen(PORT, () => console.log('Server ' + PORT));

const AUTH = './auth_info';
if (!fs.existsSync(AUTH)) fs.mkdirSync(AUTH, { recursive: true });

// === GEMINI SETUP ===
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// === 79 KEYWORDS ===
const STOP_WORDS = ["bjp","tmc","trinamool","congress","cpim","cpm","modi","mamata","didi","abhishek","rahul","sonia","vote","election","neta","rajniti","bokachoda","bokachuda","bal","khankir chele","khanki","madarchod","bhenchod","behenchod","chutiya","chutmarani","randi","magi","gandu","gand","harami","haramjada","suar","kutta","kuttar bachcha","shala","sala","abal","bc","mc","bkl","bara","chod","choda","chodna","chodar","chudir bhai","chodachudi","bokachoda chele","baler","baler mal","dhur bal","faku","kela","bichi","heda","gu","mut","sexy","porn","xxx","nude","hot girl","scam","lottery","fake news","communal","hindu muslim","danga","maramari","gali","spam","abuse","loti","khobis","behaya","chudlam","chudir"];
const CONTEXT_WORDS = ["politics","election","bjp vs tmc","hindu muslim","vote for","danga","andolon"];
const ANTI_LINK = true;

async function checkWithGemini(text) {
  try {
    const prompt = `You are NDP Guardrail. Check this message: "${text}". If it contains political hate, Bengali gali, Hinglish abuse, adult content, spam. Reply ONLY with BLOCK or ALLOW. Message: ${text}`;
    const result = await model.generateContent(prompt);
    const res = result.response.text().trim().toUpperCase();
    return res.includes('BLOCK');
  } catch (e) {
    console.log('Gemini error: ' + e.message);
    return false;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }).child({})) },
    browser: ["NDP Guard", "Chrome", "1.0"]
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) { console.log('SCAN QR'); qrcode.generate(qr, { small: true }); }
    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error).output.statusCode;
      if (code!== DisconnectReason.loggedOut) setTimeout(startBot, 3000);
    }
    if (connection === 'open') console.log('✅ Connected with Gemini');
  });
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m?.message || m.key.fromMe) return;
    const from = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
    if (!text) return;
    const low = text.toLowerCase();
    console.log('MSG: ' + text);
    if (ANTI_LINK && (low.includes('http://') || low.includes('https://') || low.includes('wa.me/'))) {
      await sock.sendMessage(from, { text: '⚠️ Guard: Links blocked!' }, { quoted: m }); return;
    }
    for (const w of STOP_WORDS) {
      if (low.includes(w)) {
        await sock.sendMessage(from, { text: `⚠️ Guard: Blocked word ${w}` }, { quoted: m }); return;
      }
    }
    // Gemini AI check
    const isBadByAI = await checkWithGemini(text);
    if (isBadByAI) {
      await sock.sendMessage(from, { text: '⚠️ NDP Guard (Gemini AI): Message blocked by AI filter!' }, { quoted: m });
      return;
    }
    if (low === 'ping') await sock.sendMessage(from, { text: 'Pong! Guard + Gemini Active 🛡️🤖' }, { quoted: m });
    if (low.startsWith('ai ')) {
      const q = text.slice(3);
      const r = await model.generateContent(q);
      await sock.sendMessage(from, { text: r.response.text() }, { quoted: m });
    }
  });
}
startBot();

const Baileys = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const fs = require('fs');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const makeWASocket = Baileys.default;
const { useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason } = Baileys;

const app = express();
const PORT = process.env.PORT || 10000;
let qrImage = null;

app.get('/', (req, res) => res.send('NDP Guard + Gemini Running - /qr for QR'));
app.get('/qr', (req, res) => {
  if (!qrImage) return res.send('<center><h2>Bot Connected or QR not ready</h2><p>Refresh after 10 sec</p></center>');
  res.send(`<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;font-family:sans-serif"><h2>Scan QR</h2><img src="${qrImage}" style="width:380px;background:white;padding:15px;border-radius:12px"><br><button onclick="location.reload()" style="padding:12px 24px;background:#25D366;color:white;border:none;border-radius:8px">Refresh</button></body></html>`);
});
app.listen(PORT, () => console.log('Server ' + PORT));

const AUTH = './auth_info';
if (!fs.existsSync(AUTH)) fs.mkdirSync(AUTH, { recursive: true });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const STOP_WORDS = ["bjp","tmc","trinamool","congress","cpim","cpm","modi","mamata","didi","abhishek","rahul","sonia","vote","election","neta","rajniti","bokachoda","bokachuda","bal","khankir chele","khanki","madarchod","bhenchod"];
const CONTEXT_WORDS = ["politics","election","bjp vs tmc","hindu muslim","vote for","danga","andolon"];
const ANTI_LINK = true;

async function checkWithGemini(text) {
  const lower = text.toLowerCase();

  // ===== HARD FILTER - OLD + NEW Words =====
  const hardWords = [
    // --- YOUR OLD LIST (Kept as is) ---
    'ভাজপা', 'বিজেপি', 'ভাজপাই', 'bjp', 'bhajpa', 'vajapa',
    'বাম', 'ভাম', 'bam', 'bham', 'cpim', 'cpm', 
    'কং', 'congress', 'কংগ্রেস',
    'তৃণমূল', 'tmc', 'টিএমসি',
    'অন্ধভক্ত', 'andhbhakt', 'andhovokto',
    'চটি', 'চটিচাটা', 'chatichata', 'chotichata', 'chamcha', 'চামচা',
    'দলীয়', 'দল', 'পার্টি', 'রাজনীতি', 'ভোট', 'নেতা',

    // --- NEW WORDS ADDED ---
    'modi', 'মোদী', 'mamata', 'মমতা', 'rahul', 'রাহুল', 'suven', 'abhishek',
    'rss', 'আরএসএস', 'aap', 'আপ', 'left', 'right', 'লিবারেল', 'ভক্ত',
    'নির্বাচন', 'election', 'ভোট', 'mla', 'mp', 'সংসদ', 'বিধানসভা',
    'andolon', 'আন্দোলন', 'মিছিল', 'ধর্ম', 'হিন্দু', 'মুসলিম', 'secular',
    'অন্ধত্ব', 'blind' // to catch your "দলীয় অন্ধত্ব" message
  ];

  if (hardWords.some(w => lower.includes(w))) {
    console.log('HARD BLOCK:', lower.substring(0, 50));
    return true;
  }

  // ===== GEMINI - New Feature: 50-50 = DELETE =====
  try {
    const prompt = `
You are NDP Guardrail. Rule: WHEN IN DOUBT, BLOCK. Don't be lenient.

Message: "${text}"

BLOCK if:
1. Any political party, leader, religion-politics mix, even if neutral tone
2. Even if message says "let's avoid politics", "all parties same", "be neutral" - BLOCK. It still brings politics.
3. Any Bengali/Hindi/English gali, taunt, adult joke, personal attack
4. Any moral policing about politics / "দলীয় অন্ধত্ব থেকে দূরে থাকো" type lecture - BLOCK
5. If you feel 50-50 confused whether it's political or not - BLOCK. Better safe.

ALLOW only if 100% non-political, non-abusive friendly talk.

Reply ONLY: BLOCK or ALLOW
`;
    const result = await model.generateContent(prompt);
    const res = result.response.text().trim().toUpperCase();
    return res.includes('BLOCK');
  } catch (e) { return false; }
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
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) { qrcodeTerminal.generate(qr, { small: true }); qrImage = await QRCode.toDataURL(qr); }
    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error).output.statusCode;
      if (code!== DisconnectReason.loggedOut) setTimeout(startBot, 3000);
      else qrImage = null;
    }
    if (connection === 'open') { console.log('Connected'); qrImage = null; }
  });

  // --- REPLACE THIS WHOLE BLOCK STARTS HERE ---
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m?.message || m.key.fromMe) return;
    const from = m.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
    if (!text) return;
    const low = text.toLowerCase();

    if (ANTI_LINK && (low.includes('http://') || low.includes('https://') || low.includes('wa.me/'))) {
      if(isGroup) { try { await sock.sendMessage(from, { delete: m.key }) } catch(e) {} }
      return;
    }
    for (const w of STOP_WORDS) {
      if (low.includes(w)) {
        if(isGroup) { try { await sock.sendMessage(from, { delete: m.key }) } catch(e) {} }
        return;
      }
    }
    const isBadByAI = await checkWithGemini(text);
    if (isBadByAI) {
      if(isGroup) { try { await sock.sendMessage(from, { delete: m.key }) } catch(e) {} }
      return;
    }
    if (low === 'ping') await sock.sendMessage(from, { text: 'Pong! ✅' }, { quoted: m });
  });
  // --- BLOCK ENDS HERE ---
}
startBot();

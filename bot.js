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
  try {
    const prompt = `
You are NDP Guardrail - strict political filter for a Bengali WhatsApp group.

Message to check: "${text}"

BLOCK the message if it contains ANY of these, even hidden/indirect:

1. Any Indian politics: TMC, BJP, Trinamool, Congress, CPIM, CPM, Modi, Mamata, Didi, Abhishek, Suvendu, Rahul, election, vote, neta, rajniti, party, andolon, michil
2. Bengali gali / slang / insult / adult joke - even if written in English letters like "bokachoda", "khanki", "bal", "bc", "mc"
3. Religious hate, communal speech
4. Spam, promotion, earning app, adult link
5. Sarcasm or coded political attack - e.g. "khela hobe", "pisi bhai", "feku", "pappu"

Even if the bad meaning is hidden inside a long story, or written in mixed Banglish, you must BLOCK.

If message is normal chat, friendship, study, help, general talk - ALLOW.

Reply ONLY one word: BLOCK or ALLOW. No explanation.
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

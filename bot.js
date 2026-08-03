const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const P = require("pino");
const express = require("express");

// === 1. RENDER PORT FIX - MUST BE AT TOP ===
const app = express();
app.get('/', (req, res) => res.send('NDP Bot is Alive - No Politics Allowed'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Render Port Bind OK on ${PORT}`));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// === 2. ALL KEYWORDS - OLD + NEW ===
const TIER1_GALI = [
  'অন্ধভক্ত','andhbhakt','andhovokto','andhbhakto',
  'ভাম','bham','চটিচাটা','চটি','chatichata','chotichata','chati chata',
  'চামচা','chamcha','chamca','দালাল','dalal'
];

const TIER2_KEYWORDS = `ভাজপা, বিজেপি, ভাজপাই, bjp, bhajpa, vajapa, বাম, cpim, cpm, কং, congress, কংগ্রেস, তৃণমূল, tmc, টিএমসি, দলীয়, দল, পার্টি, রাজনীতি, ভোট, নেতা, modi, মোদী, mamata, মমতা, rahul, রাহুল, abhishek, rss, আরএসএস, aap, left, right, লিবারেল, ভক্ত, নির্বাচন, election, mla, mp, সংসদ, বিধানসভা, আন্দোলন, মিছিল, ধর্ম, হিন্দু, মুসলিম, অন্ধত্ব, blind`;

async function checkWithGemini(text) {
  if (!text || text.length < 2) return false;
  const lower = text.toLowerCase();
  
  if (TIER1_GALI.some(w => lower.includes(w))) {
    console.log('>> TIER 1 GALI BLOCK');
    return true;
  }

  try {
    const prompt = `You are NDP WhatsApp moderator. Message: "${text}"
Keywords to watch: ${TIER2_KEYWORDS}

RULES:
- If context is political discussion, party comparison, preaching like "বামই হোক বা কং হোক বা ভাজপা হোক", "দলীয় অন্ধত্ব থেকে দূরে থাকো", "সব দল খারাপ", "অন্যায় সব দলই করে" = BLOCK even if good intention.
- If normal use like "দল বেঁধে ঘুরতে যাই", "বিরিয়ানির ভক্ত", "left side" = ALLOW
- If gali/abuse = BLOCK
- If 50-50 confused = BLOCK
Reply ONLY: BLOCK or ALLOW`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim().toUpperCase();
    console.log(`CHECK: "${text.substring(0,35)}" => ${reply}`);
    return reply.includes('BLOCK');
  } catch (e) {
    console.error('Gemini Error:', e.message);
    return false;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false, // FIX for Render garbled logs
    browser: ["NDP Bot", "Chrome", "1.0"]
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('*** BOT CONNECTED & READY TO DELETE ***');
    }
    // For pairing code if needed - check logs
    if (update.qr) {
      console.log('QR Generated - Scan via Pairing Code method, or upload auth folder from local PC');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const jid = msg.key.remoteJid;
        if (!jid.endsWith('@g.us')) continue; // Only groups
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        if (!text) continue;

        if (await checkWithGemini(text)) {
          try {
            await sock.sendMessage(jid, { delete: msg.key });
            console.log('*** DELETED SUCCESSFULLY ***');
          } catch (err) {
            console.log('DELETE FAILED - Bot must be Admin in group:', err.message);
          }
        }
      } catch (e) {
        console.error('Message error:', e.message);
      }
    }
  });
}

startBot();

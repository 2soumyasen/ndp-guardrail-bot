const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const P = require("pino");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- KEEP ALL YOUR OLD + NEW KEYWORDS HERE ---
const TIER1_GALI = ['অন্ধভক্ত','andhbhakt','andhovokto','ভাম','bham','চটিচাটা','chatichata','chotichata','চামচা','chamcha','চটি'];
const TIER2_KEYWORDS_FOR_AI = `ভাজপা, বিজেপি, ভাজপাই, bjp, bhajpa, vajapa, বাম, বামপন্থী, cpim, cpm, কং, congress, কংগ্রেস, তৃণমূল, tmc, টিএমসি, দলীয়, দল, পার্টি, রাজনীতি, ভোট, নেতা, modi, মোদী, mamata, মমতা, rahul, রাহুল, rss, aap, left, right, ভক্ত, নির্বাচন, election, mla, mp, সংসদ, আন্দোলন, অন্ধত্ব, blind`;

async function checkWithGemini(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (TIER1_GALI.some(w => lower.includes(w))) {
    console.log('>> TIER1 DELETE TRIGGERED');
    return true;
  }
  try {
    const prompt = `Check this WhatsApp message: "${text}"
Keywords list: ${TIER2_KEYWORDS_FOR_AI}

If context is political discussion, party comparison, neutrality preaching like "বামই হোক বা কং হোক বা ভাজপা হোক", "দলীয় অন্ধত্ব থেকে দূরে থাকো", "সব দল খারাপ", "all parties do wrong" -> BLOCK.
If normal use like "দল বেঁধে যাবো", "বিরিয়ানির ভক্ত" -> ALLOW.
If gali/abuse -> BLOCK.
If 50-50 confused -> BLOCK.
Reply ONLY: BLOCK or ALLOW`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim().toUpperCase();
    console.log(`CHECK: "${text.slice(0,30)}" => ${reply}`);
    return reply.includes('BLOCK'); // FIXED: includes not ===
  } catch (e) {
    console.error('Gemini Fail:', e.message);
    return false;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }), printQRInTerminal: true });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) continue;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      if (!text) continue;

      const shouldDelete = await checkWithGemini(text);
      if (shouldDelete) {
        try {
          // FIXED DELETE SYNTAX
          await sock.sendMessage(jid, { delete: msg.key });
          console.log('*** DELETED SUCCESSFULLY ***');
        } catch (err) {
          console.log('DELETE FAILED - Is bot ADMIN??', err.message);
        }
      }
    }
  });
}
startBot();

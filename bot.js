const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const P = require("pino");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function checkWithGemini(text) {
  if (!text || text.length < 2) return false;
  const lower = text.toLowerCase();
  
  // ===== TIER 1: ABSOLUTE GALI - No context needed, instant DELETE =====
  const tier1 = [
    'অন্ধভক্ত','andhbhakt','andhovokto','andhbhakto',
    'ভাম','bham','চটিচাটা','চটি','chatichata','chotichata','chati chata',
    'চামচা','chamcha','chamca','dalal','দালাল'
  ];
  if (tier1.some(w => lower.includes(w))) {
    console.log('TIER 1 BLOCK');
    return true;
  }

  // ===== TIER 2: CONTEXT CHECK - Gemini will understand context =====
  try {
    const prompt = `
You are NDP Group Moderator. Understand CONTEXT not just keyword.

Message: "${text}"

KEYWORDS TO WATCH (Old + New All):
Old: ভাজপা, বিজেপি, ভাজপাই, bjp, bhajpa, vajapa, বাম, ভাম, bam, cpim, cpm, কং, congress, কংগ্রেস, তৃণমূল, tmc, টিএমসি, অন্ধভক্ত, andhbhakt, চটি, চটিচাটা, chatichata, চামচা, দলীয়, দল, পার্টি, রাজনীতি, ভোট, নেতা
Newly Added: modi, মোদী, mamata, মমতা, rahul, রাহুল, abhishek, suvendu, rss, আরএসএস, aap, left, right, লিবারেল, ভক্ত, নির্বাচন, election, mla, mp, সংসদ, বিধানসভা, andolon, আন্দোলন, মিছিল, ধর্ম, হিন্দু, মুসলিম, secular, অন্ধত্ব, blind, liberal, bhakt

RULES:
1. If word used in NON-POLITICAL context like "দল বেঁধে ঘুরতে যাই", "বিরিয়ানির ভক্ত", "left side e jao" = ALLOW
2. If CONTEXT is political discussion, party comparison, preaching like "বামই হোক বা কং হোক বা ভাজপাই হোক", "দলীয় অন্ধত্ব থেকে দূরে থাকো", "অন্যায় সব দলই করে", "সব পার্টি খারাপ" = BLOCK even if tone is neutral/good intention
3. If any gali, personal attack = BLOCK
4. If 50-50 confused if it's political preaching or not = BLOCK

Reply ONLY one word: BLOCK or ALLOW
`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim().toUpperCase();
    console.log(`Msg: ${text.substring(0,40)} | AI: ${reply}`);
    return reply.includes('BLOCK');
  } catch (e) {
    console.error('Gemini error:', e.message);
    return false;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }) });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'close') {
      if (update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
    if (update.connection === 'open') console.log('Bot Connected!');
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const groupId = msg.key.remoteJid;
        if (!groupId.endsWith('@g.us')) continue;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        if (!text) continue;
        if (await checkWithGemini(text)) {
          await sock.sendMessage(groupId, { delete: msg.key });
        }
      } catch (err) { console.error(err.message); }
    }
  });
}
startBot();

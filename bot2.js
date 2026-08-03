const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const { TIER1_GALI, PARTY_WORDS, INSULT_WORDS, getPrompt } = require("./prompt");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const qrcode = require("qrcode-terminal");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function checkMessage(text) {
  if (!text || text.length < 2) return false;
  const lower = text.toLowerCase();
  
  // LOG for debug
  console.log(`Checking: "${text}"`);

  if (TIER1_GALI.some(w => lower.includes(w.toLowerCase()))) {
    console.log('-> BLOCKED by TIER1_GALI');
    return true;
  }
  if (PARTY_WORDS.some(p => lower.includes(p.toLowerCase())) && INSULT_WORDS.some(i => lower.includes(i.toLowerCase()))) {
    console.log('-> BLOCKED by PARTY+INSULT');
    return true;
  }
  try {
    const result = await model.generateContent(getPrompt(text));
    const reply = result.response.text().trim().toUpperCase();
    console.log(`-> AI reply: ${reply}`);
    return reply.includes('BLOCK');
  } catch (e) {
    console.error('Gemini fail:', e.message);
    // Fail safe - block if party word present
    return PARTY_WORDS.some(p => lower.includes(p.toLowerCase()));
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }), browser: ["NDP","Chrome","1.0"] });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('--- NEW QR ---');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
    if (connection === 'open') console.log('*** BOT CONNECTED ***');
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) continue;

      const shouldDelete = await checkMessage(text);
      console.log(`Result for "${text}": ${shouldDelete ? 'DELETE' : 'ALLOW'}`);

      if (shouldDelete) {
        try {
          await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
          console.log('>>> DELETED SUCCESSFULLY');
        } catch (err) {
          console.log('>>> DELETE FAILED - IS BOT ADMIN?', err.message);
        }
      }
    }
  });
}
startBot();

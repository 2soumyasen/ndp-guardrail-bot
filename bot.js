const  http  =  require('http');
http.createServer((req,res)=>res.end('Bot is Live')).listen(process.env.PORT||3000);
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');

const BANNED_WORDS = [
  "bjp","congress","aap","tmc","cpm","cpim","modi","rahul","mamata",
  "election","vote","voting","manifesto","rally","campaign",
  "rajniti","bhot","nirbachan","ভোট","রাজনীতি"
];

let warnings = {};
let msgStore = {};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("SCAN THIS QR WITH YOUR BOT NUMBER:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log("BOT CONNECTED SUCCESSFULLY!");
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const id = msg.key.remoteJid;
      if (!id.endsWith('@g.us')) continue;

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
      if (!text) continue;

      const lowerText = text.toLowerCase();
      const isViolation = BANNED_WORDS.some(w => lowerText.includes(w));

      if (!isViolation) continue;

      const sender = msg.key.participant;
      msgStore[msg.key.id] = msg;

      try {
        await sock.sendMessage(id, { delete: msg.key });
        console.log(`Deleted violation from ${sender}`);

        warnings[sender] = (warnings[sender] || 0) + 1;

        if (warnings[sender] >= 3) {
          await sock.sendMessage(id, { text: `⚠️ @${sender.split('@')[0]} has been warned 3 times for political posts. Admins please take action.`, mentions: [sender] });
        } else {
          await sock.sendMessage(id, { text: `🚫 Political content not allowed here. Warning ${warnings[sender]}/3 @${sender.split('@')[0]}`, mentions: [sender] });
        }

      } catch (e) {
        console.log("Delete failed - make bot admin!", e.message);
      }
    }
  });
}

startBot();

const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const Tesseract = require('tesseract.js');

const TARGET_SUBJECT = "NDP 2000/2002 General";
let TARGET_GROUP_ID = null;

const BANNED_WORDS = [
  "bjp", "congress", "aap", "tmc", "cpim", "cpm", "rss", "bjym", "trinamool",
  "modi", "rahul", "kejriwal", "mamata", "yogi", "didi", "bhaijaan",
  "election", "vote", "politics", "namo", "pappu", "bhakt", "chamcha",
  "chunav", "chunao", "neta", "mantri", "vidhayak", "sansad", "sarkar", "rajniti", "rajneeti",
  "bhot", "bhote", "nirbachan", "nirbacon", "khela hobe", "choti chata",
  "चुनाव", "नेता", "मंत्री", "सरकार", "राजनीति", "भाजपा", "कांग्रेस", "मोदी", "राहुल",
  "ভোট", "নির্বাচন", "নেতা", "মন্ত্রী", "সরকার", "রাজনীতি", "বিজেপি", "তৃণমূল", "খেলা হবে"
];

let violations = {};

async function checkText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  return BANNED_WORDS.find(w => lower.includes(w));
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if (u.qr) { console.log("SCAN THIS QR:"); qrcode.generate(u.qr, { small: true }); }
    if (u.connection === 'open') console.log("✅ BOT READY - NDP Guardrail ON");
  });

  sock.ev.on('connection.update', async () => {
    try {
      const allGroups = await sock.groupFetchAllParticipating();
      for (const id in allGroups) {
        if (allGroups[id].subject && allGroups[id].subject.includes(TARGET_SUBJECT)) {
          TARGET_GROUP_ID = id;
          console.log(`✅ Target locked: ${allGroups[id].subject} -> ${id}`);
        }
      }
    } catch {}
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const gid = msg.key.remoteJid;
      if (!gid.endsWith('@g.us')) continue;
      if (TARGET_GROUP_ID && gid!== TARGET_GROUP_ID) continue;

      const sender = msg.key.participant;
      let textToCheck = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
      let isMedia =!!msg.message.imageMessage;
      let hit = await checkText(textToCheck);

      if (!hit && isMedia) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: { level: 'silent' } });
          fs.writeFileSync('temp.jpg', buffer);
          const { data: { text } } = await Tesseract.recognize('temp.jpg', 'eng+hin+ben');
          if (text) hit = await checkText(text);
        } catch (e) {}
      }

      const isForwarded = (msg.message.imageMessage?.contextInfo?.forwardingScore || 0) > 3;
      if (!hit && isMedia && isForwarded) hit = "forwarded poster";

      if (hit) {
        try {
          await sock.sendMessage(gid, { delete: msg.key });
          violations[sender] = (violations[sender] || 0) + 1;
          await sock.sendMessage(gid, { text: `🚧 *NDP Political Guardrail*\nRemoved - Found: "${hit}"\n@${sender.split('@')[0]} Warning ${violations[sender]}/3\nNo political talk/posters in NDP 2000/2002 General`, mentions: [sender] });
          if (violations[sender] >= 3) {
            await sock.groupParticipantsUpdate(gid, [sender], "remove");
            violations[sender] = 0;
          }
        } catch (e) { console.log("Make bot Admin!"); }
      }
    }
  });
}
start();

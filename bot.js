import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import express from 'express';
import fs from 'fs';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('NDP Guardrail Bot Running ✅ - v6.7.24'));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.listen(PORT, () => console.log(`Express Server running on port ${PORT}`));

const AUTH_FOLDER = './auth_info';
if (!fs.existsSync(AUTH_FOLDER)) {
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

// --- NDP GUARDRAIL CONFIG ---
const BAD_WORDS = ["abuse", "spam", "fake", "scam"]; // add your NDP list
const ANTI_LINK = true;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`Using Baileys version: ${version}`);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }).child({})),
    },
    browser: ["NDP Guard", "Chrome", "1.0"],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('================ QR CODE ================');
      qrcode.generate(qr, { small: true });
      console.log('=========================================');
    }

    if (connection === 'close') {
      let shouldReconnect = true;
      if (lastDisconnect?.error) {
        const boomError = Boom.boomify(lastDisconnect.error);
        const statusCode = boomError?.output?.statusCode;
        shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`Connection closed, status: ${statusCode}, reconnecting: ${shouldReconnect}`);
      }
      if (shouldReconnect) {
        setTimeout(() => startBot(), 3000);
      } else {
        console.log('Logged out, delete auth_info folder and restart');
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp Connected Successfully!');
      console.log(`Bot ID: ${sock.user.id}`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages[0];
    if (!m?.message) return;
    if (m.key.fromMe) return;

    const from = m.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";

    if (!text) return;
    console.log(`[${isGroup ? 'GROUP' : 'DM'}] ${from}: ${text}`);

    const lowerText = text.toLowerCase();

    // 1. Guardrail: Anti-Link
    if (ANTI_LINK && (lowerText.includes('http://') || lowerText.includes('https://') || lowerText.includes('wa.me/'))) {
      await sock.sendMessage(from, { text: '⚠️ *NDP Guardrail:* Links are not allowed!' }, { quoted: m });
      return;
    }

    // 2. Guardrail: Bad Words Filter
    for (const word of BAD_WORDS) {
      if (lowerText.includes(word)) {
        await sock.sendMessage(from, { text: `⚠️ *NDP Guardrail:* Message blocked due to policy violation: "${word}"` }, { quoted: m });
        return;
      }
    }

    // 3. Commands
    if (lowerText === 'ping') {
      await sock.sendMessage(from, { text: 'Pong! 🛡️ NDP Guard Active\nBaileys: 6.7.24\nNode: 22.13.0' }, { quoted: m });
    }

    if (lowerText === 'help' || lowerText === 'menu') {
      await sock.sendMessage(from, { 
        text: `

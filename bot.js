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
app.get('/', (req, res) => {
  res.send('NDP Guardrail Bot Running - Baileys 6.7.24');
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

const AUTH_FOLDER = './auth_info';
if (!fs.existsSync(AUTH_FOLDER)) {
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

const BAD_WORDS = ["abuse", "spam", "scam", "fake"];
const ANTI_LINK = true;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();
  console.log(`Baileys Version: ${version}`);

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
      console.log('--- QR CODE ---');
      qrcode.generate(qr, { small: true });
      console.log('--- SCAN ABOVE ---');
    }

    if (connection === 'close') {
      let shouldReconnect = true;
      if (lastDisconnect && lastDisconnect.error) {
        const boomErr = Boom.boomify(lastDisconnect.error);
        const code = boomErr.output.statusCode;
        shouldReconnect = code!== DisconnectReason.loggedOut;
        console.log(`Closed with code ${code}, reconnect: ${shouldReconnect}`);
      }
      if (shouldReconnect) {
        setTimeout(() => { startBot(); }, 3000);
      }
    }

    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp');
    }
  });

  sock.ev.on('messages.upsert', async (upsert) => {
    const m = upsert.messages[0];
    if (!m ||!m.message) return;
    if (m.key.fromMe) return;

    const from = m.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
    if (!text) return;

    console.log(`[${isGroup? 'GROUP' : 'DM'}] ${from}: ${text}`);
    const lower = text.toLowerCase();

    if (ANTI_LINK && (lower.includes('http://') || lower.includes('https://') || lower.includes('wa.me'))) {
      await sock.sendMessage(from, { text: '⚠️ NDP Guard: Links not allowed!' }, { quoted: m });
      return;
    }

    for (const w of BAD_WORDS) {
      if (lower.includes(w)) {
        await sock.sendMessage(from, { text: `⚠️ Blocked word: ${w}` }, { quoted: m });
        return;
      }
    }

    if (lower === 'ping') {
      await sock.sendMessage(from, { text: 'Pong! Guard Active 🛡️ v6.7.24 Node 22.13.0' }, { quoted: m });
    }

    if (lower === 'help') {
      await sock.sendMessage(from, { text: '*NDP Guard Menu*\n- ping\n- help\nGuard: ON' }, { quoted: m });
    }
  });
}

startBot().catch((e) => {
  console.error('Fatal', e);
});

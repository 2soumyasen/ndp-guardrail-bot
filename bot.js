const http = require('http');
http.createServer((req, res) => res.end('NDP Guard Bot is Live')).listen(process.env.PORT || 3000);

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['NDP Guard', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('=================================');
            console.log('SCAN THIS QR WITH YOUR 2ND WHATSAPP:');
            console.log('=================================');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ BOT CONNECTED SUCCESSFULLY! ✅');
            console.log('Now add this number to NDP group as admin');
        }
    });

    // Guard logic - you can add your NDP rules here later
    sock.ev.on('messages.upsert', async (m) => {
        console.log('Message received');
    });
}

startBot();

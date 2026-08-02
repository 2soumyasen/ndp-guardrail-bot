const http = require('http');
http.createServer((req, res) => res.end('NDP Guard Live')).listen(process.env.PORT || 3000);

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');

const PHONE_NUMBER = "7003197209"; // <-- PUT YOUR 2ND WHATSAPP NUMBER HERE WITH 91

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['NDP Guard', 'Chrome', '1.0.0']
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                console.log('\n\n=========================================');
                console.log('YOUR PAIRING CODE IS:', code);
                console.log('=========================================\n');
                console.log('Go to WhatsApp -> Linked Devices -> Link a device -> Link with phone number -> Enter this code');
            } catch (e) {
                console.log('Error getting code:', e.message);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log('Closed, code:', code);
            if (code !== DisconnectReason.loggedOut) setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('✅✅✅ BOT CONNECTED! ✅✅✅');
        }
    });
}

startBot();

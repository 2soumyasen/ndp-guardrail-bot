const http = require('http');
http.createServer((req, res) => res.end('NDP Guard Live')).listen(process.env.PORT || 3000);

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

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n\n=========================================');
            console.log('QR CODE FOUND! SCAN NOW! SCAN NOW!');
            console.log('=========================================\n');
            qrcode.generate(qr, { small: true });
            console.log('\n=========================================');
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log('Connection closed, code:', code);
            if (code === DisconnectReason.loggedOut) {
                console.log('Logged out - restart needed');
                return;
            }
            setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('✅✅✅ BOT CONNECTED! ✅✅✅');
        }
    });
}

startBot();

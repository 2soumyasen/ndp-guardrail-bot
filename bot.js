const http = require('http');
const fs = require('fs');
http.createServer((req, res) => res.end('NDP Guard Bot Live')).listen(process.env.PORT || 3000);

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

async function startBot() {
    // FORCE DELETE DEAD AUTH ON RENDER
    if (fs.existsSync('auth')) {
        console.log('Deleting dead auth folder...');
        fs.rmSync('auth', { recursive: true, force: true });
    }

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
            console.log('=========================================');
            console.log('SCAN THIS QR - YOU HAVE 20 SECONDS:');
            console.log('=========================================');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log('Closed with code:', statusCode);
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('Logged out, deleting auth...');
                if (fs.existsSync('auth')) fs.rmSync('auth', { recursive: true, force: true });
            }
            console.log('Reconnecting in 3 sec...');
            setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('✅ CONNECTED SUCCESSFULLY! ✅');
        }
    });
}

startBot();

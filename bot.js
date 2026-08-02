const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
let qrCodeData = null;
let connected = false;

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, logger: pino({level:'silent'}), browser: ['Ubuntu','Chrome','110'] });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({connection, qr, lastDisconnect})=>{
        if(qr){ qrCodeData = qr; connected = false; console.log('QR Generated - Open your Render link to scan'); }
        if(connection==='open'){ connected=true; qrCodeData=null; console.log('✅ CONNECTED ✅'); }
        if(connection==='close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut){ setTimeout(start,3000); }
    });
}
start();

http.createServer((req,res)=>{
    if(connected){
        res.end('<h1>✅ BOT CONNECTED SUCCESSFULLY - 7003197209</h1><p>You can close this.</p>');
    } else if(qrCodeData){
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCodeData)}`;
        res.end(`<html><body style="text-align:center;font-family:sans-serif"><h2>Scan with Business WhatsApp 7003197209</h2><p>Linked Devices > Link a device</p><img src="${qrUrl}" style="width:400px;height:400px;border:10px solid black"><br><br><button onclick="location.reload()">Refresh QR</button><p>QR changes every 30 sec - Refresh if expired</p></body></html>`);
    } else {
        res.end('<h2>Starting... Wait 10 sec and refresh</h2><script>setTimeout(()=>location.reload(),3000)</script>');
    }
}).listen(process.env.PORT||3000);

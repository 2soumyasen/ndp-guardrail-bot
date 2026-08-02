const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

let qrCodeData = null;
let connected = false;

// ===== FINAL EXHAUSTIVE FILTER - 60+ KEYWORDS (No single chor/scam) =====
const BANNED = [
  'trinamool','trinamool congress','tmc','aitc','jora phool','trinamul','trinomool','mamata','mamta','abhishek banerjee','bhaipo','bhatija','anubrata','firhad hakim','partha chatterjee','kalyan banerjee','tolabaj','tolabazi','cut money','khela hobe',
  'bjp','bjp party','modi','narendra modi','amit shah','suvendu adhikari','shuvendu','dilip ghosh','sukanta majumdar','rss',
  'congress','rahul gandhi','adhir chowdhury','cpim','cpm','left front','bamfront',
  'tmc chor','bjp chor','goru chor','goru pachar','koyla chor','coal chor','vote chor','chakri chor','tmc dalal','bjp dalal',
  'coal scam','ssc scam','tet scam','goru scam','vote scam','recruitment scam','bali scam',
  'andh bhakt','andhbhakt','andhbhakts','modi bhakt','bhakt','feku','sanghi','chaddi','gobor bhakt',
  'pappu','chamcha','chamche','chamchagiri','libtard','sickular','urban naxal','tukde gang','godi media','paid media','whatsapp university','bjp it cell','tmc it cell'
];
// ========================================================================

function getText(msg){
    if(!msg.message) return '';
    const m = msg.message;
    return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || '';
}

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ 
        version, 
        auth: state, 
        logger: pino({level:'silent'}), 
        browser: ['Ubuntu','Chrome','110'] 
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', ({connection, qr, lastDisconnect})=>{
        if(qr){ qrCodeData = qr; connected = false; console.log('QR Generated'); }
        if(connection==='open'){ connected=true; qrCodeData=null; console.log('✅ NDP GUARD ACTIVE - 7003197209 - '+BANNED.length+' words'); }
        if(connection==='close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut){ 
            console.log('Reconnecting...'); 
            setTimeout(start,3000); 
        }
    });

    sock.ev.on('messages.upsert', async ({messages})=>{
        for(const msg of messages){
            if(!msg.message || msg.key.fromMe) continue;
            const jid = msg.key.remoteJid;
            if(!jid.endsWith('@g.us')) continue;

            const text = getText(msg).toLowerCase();
            if(!text) continue;

            const found = BANNED.find(w => text.includes(w.toLowerCase()));
            if(found){
                console.log(`DELETING "${found}" in ${jid}`);
                try{
                    await sock.sendMessage(jid, {
                        delete: {
                            remoteJid: jid,
                            fromMe: false,
                            id: msg.key.id,
                            participant: msg.key.participant
                        }
                    });
                }catch(e){
                    console.log('Delete failed - Is bot ADMIN? ', e.message);
                }
            }
        }
    });
}

start();

http.createServer((req,res)=>{
    if(connected){
        res.end(`<html><body style="text-align:center;font-family:sans-serif"><h1>✅ NDP Guard Active</h1><h2>7003197209 eSIM</h2><p>${BANNED.length} words blocking</p><p>Bot is ADMIN? Check group members</p></body></html>`);
    } else if(qrCodeData){
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrCodeData)}`;
        res.end(`<html><body style="text-align:center"><h2>Scan with 7003197209 Business</h2><p>Linked Devices > Link Device</p><img src="${qrUrl}" style="width:400px;height:400px;border:10px solid black"><br><br><button onclick="location.reload()" style="padding:10px 20px;font-size:18px">Refresh QR</button><p>QR expires in 30 sec</p></body></html>`);
    } else {
        res.end('<h2>Starting bot... Wait 5 sec</h2><script>setTimeout(()=>location.reload(),3000)</script>');
    }
}).listen(process.env.PORT||3000);

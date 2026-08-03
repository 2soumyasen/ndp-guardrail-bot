const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const QRCode = require('qrcode')
const express = require('express')
const fs = require('fs')
const P = require('pino')

const app = express()
let qrImage = null
let sock = null

// --- CONFIG ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_KEY_HERE"
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

// --- WEB SERVER FOR RENDER (Fixes Cannot GET /qr) ---
app.get('/', (req, res) => {
  res.send('<h2>NDP Guard + Gemini Running ✅</h2><p>Go to <a href="/qr">/qr</a> for QR code</p>')
})

app.get('/qr', (req, res) => {
  if (!qrImage) {
    return res.send(`
      <center style="font-family:sans-serif;margin-top:50px">
        <h2>Bot Already Connected ✅</h2>
        <p>Or QR not generated yet. Wait 10 sec and refresh.</p>
        <p>Check Render Logs for status.</p>
        <a href="/">Home</a>
      </center>
    `)
  }
  res.send(`
    <html><head><meta http-equiv="refresh" content="30"><title>NDP Bot QR</title></head>
    <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;font-family:sans-serif;background:#f5f5f5">
      <h2>Scan QR with WhatsApp</h2>
      <p>WhatsApp > Linked Devices > Link a device</p>
      <img src="${qrImage}" style="width:380px;border:15px solid white;box-shadow:0 0 30px #aaa;border-radius:12px;background:white">
      <br><br>
      <button onclick="location.reload()" style="padding:12px 25px;font-size:18px;background:#25D366;color:white;border:none;border-radius:8px;cursor:pointer">Refresh QR</button>
      <p>Auto-refresh every 30 sec - QR expires fast</p>
    </body></html>
  `)
})

app.listen(process.env.PORT || 10000, () => console.log('Server running'))

// --- NDP GUARD LOGIC (Basic) ---
function isNDPRelated(text) {
  const keywords = ['ndp', 'nuclear', 'guardrail', 'safety']
  return keywords.some(k => text.toLowerCase().includes(k))
}

// --- BOT START ---
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
  
  sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false, // we show on /qr page
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('QR Generated - View at /qr')
      qrImage = await QRCode.toDataURL(qr)
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Connection closed, reconnecting:', shouldReconnect)
      if (shouldReconnect) startBot()
      else qrImage = null
    }
    else if (connection === 'open') {
      console.log('✅ Connected with Gemini')
      qrImage = null
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message || msg.key.fromMe) return
      
      const from = msg.key.remoteJid
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
      if (!text) return

      console.log(`Message from ${from}: ${text}`)

      // NDP Guardrail Check
      if (!isNDPRelated(text)) {
        // Optional: ignore non-NDP or reply
        // await sock.sendMessage(from, { text: "I only answer NDP Guardrail related questions." })
        // return
      }

      // Gemini Reply
      const prompt = `You are NDP Guardrail Bot. Answer safely and helpfully: ${text}`
      const result = await model.generateContent(prompt)
      const reply = result.response.text()

      await sock.sendMessage(from, { text: reply })

    } catch (e) {
      console.error('Error handling message:', e)
    }
  })
}

startBot()

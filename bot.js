import pkg from "@whiskeysockets/baileys"
const makeWASocket = pkg.default
const { useMultiFileAuthState, DisconnectReason } = pkg
import express from "express"
import qrcode from "qrcode"

const app = express();
let qrCodeData = "";

const BAD_WORDS = ["andhovakto", "andhavakto", "andha", "choti chata", "balish chata", "khanki", "bainchod", "bokachoda", "madarchod"];

async function isBadWithAI(text) {
  try {
    if (BAD_WORDS.some(w => text.toLowerCase().includes(w))) return true;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Is this abusive in Bengali/Hinglish? Text: "${text}". Reply only YES or NO.` }] }]
      })
    });
    const data = await res.json();
    const ans = data?.candidates?.[0]?.content?.parts?.[0]?.text || "NO";
    console.log(`AI Check for "${text}": ${ans}`);
    return ans.toUpperCase().includes("YES");
  } catch (e) {
    console.log("Gemini error", e.message);
    return false;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrCodeData = await qrcode.toDataURL(qr);
      console.log("QR Generated");
    }
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("NDP Guard Active! Connected = true");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!text) return;
    console.log("New msg:", text);
    if (await isBadWithAI(text)) {
      console.log("Deleting:", text);
      await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
    }
  });
}

app.get("/", async (req, res) => {
  if (!qrCodeData) return res.send("<h1>Waiting for QR... Refresh in 10 sec</h1>");
  res.send(`<img src="${qrCodeData}" style="width:300px"><br><h2>Scan in WhatsApp > Linked Devices</h2>`);
});

app.listen(10000, () => console.log("Web server on 10000"));
startBot();

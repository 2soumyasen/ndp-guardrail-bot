import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import qrcode from "qrcode";
import express from "express";

let qrCodeData = null;

// GEMINI AI CHECK
async function checkWithGemini(text) {
  try {
    if (!process.env.GEMINI_KEY) return null;
    const prompt = `Classify this message: "${text}". Reply ONLY JSON {"abusive": true/false, "political": true/false}. abusive=gaali, harassment. political=bjp, congress, tmc, modi, rahul, mamata, election, vote etc.`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.log("AI Error:", e.message);
    return null;
  }
}

const ABUSE_WORDS = ["bc","mc","bkl","chutiya","madarchod","behenchod","gandu","lodu","randi","bhosdi","bsdk","tmkc","chutia","fuck","bitch","asshole"];
const POLITICAL_WORDS = ["bjp","congress","inc","aap","tmc","cpm","modi","amit shah","rahul gandhi","mamata","yogi","kejriwal","rss","election","vote","politics","bjym"];

function keywordCheck(text) {
  const t = text.toLowerCase();
  return {
    abusive: ABUSE_WORDS.some(w => t.includes(w)),
    political: POLITICAL_WORDS.some(w => t.includes(w))
  };
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const sock = makeWASocket({ auth: state, printQRInTerminal: true, browser: ["NDP Guard", "Chrome", "1.0"] });

  sock.ev.on("creds.update", saveCreds);

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
      console.log("NDP GUARD ACTIVE");
      qrCodeData = null;
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (let msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const jid = msg.key.remoteJid;
        if (!jid.endsWith("@g.us")) continue;
        let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || "";
        if (!text) continue;
        let result = keywordCheck(text);
        if (!result.abusive &&!result.political) {
          const ai = await checkWithGemini(text);
          if (ai) result = ai;
        }
        if (result.abusive || result.political) {
          console.log(`DELETING "${text.substring(0,50)}"`);
          await sock.sendMessage(jid, { delete: msg.key });
        }
      } catch (e) {
        console.log("Delete Error:", e.message);
      }
    }
  });
}

const app = express();
app.get("/", (req, res) => {
  if (!qrCodeData) {
    return res.send(`<h1>NDP Guard Running ✅</h1><p>Connected</p><p>${new Date().toLocaleString()}</p><script>setTimeout(()=>location.reload(),10000)</script>`);
  }
  res.send(`<center><h1>Scan QR</h1><img src="${qrCodeData}" style="width:330px;border:8px solid black"/><script>setTimeout(()=>location.reload(),15000)</script></center>`);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

startBot();

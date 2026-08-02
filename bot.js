import pkg from "@whiskeysockets/baileys"
const makeWASocket = pkg.default
const { useMultiFileAuthState, DisconnectReason } = pkg
import express from "express"
import qrcode from "qrcode"

const app = express();
let qrCodeData = "";

const BAD_WORDS = [
  "andhovakto", "andhavakto", "andhbhakt", "ondho bhokto",
  "choti chata", "chotichata", "balish chata", "balishchata",
  "khanki", "bainchod", "bokachoda", "madarchod", "randi"
];

async function isBadWithAI(text) {
  try {
    const lower = text.toLowerCase();
    if (BAD_WORDS.some(w => lower.includes(w))) {
      console.log("Blocked by list:", text);
      return true;
    }

    const prompt = `You are moderator for Bengali WhatsApp group.
    Message/Caption: "${text}"
    Task:
    1. Is it abusive/slang/insult? Consider ALL transliterations: andhavakto/andhovakto/ondho, choti chata/chotichata etc + semantic abuse.
    2. Is it political? Mentions BJP, TMC, CPM, Congress, Modi, Mamata, Shah, election, vote, rajniti etc or political context.
    Reply JSON ONLY: {"abusive":"YES/NO","political":"YES/NO"}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("AI:", raw);
    const result = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (result.abusive === "YES" || result.political === "YES") return true;
    return false;
  } catch (e) {
    console.log("AI Error:", e.message);
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
      console.log("QR Generated - Open Render URL");
    }
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("NDP Guard

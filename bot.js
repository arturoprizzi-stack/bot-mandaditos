const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');

const app = express();
app.use(express.json());

let sock;
let pairingCode = "DALE A GENERAR CLAVE ABAJO";
let lastNumber = "526695456822";

// MEMORIA SAGRADA - 6 REALES
const RESTAURANTES = {
  villafit: { nombre: "VILLAFIT", contactos: ["VILLAFIT","VILLAFIT2"], grupo: "Veloces 2", activo: true, soloFotos: true },
  saboria: { nombre: "MENUDO DOÑA LUPE SABORIA", contactos: ["MENUDO*SANCHEZ","MENUDO*SANCHEZ2"], grupo: "Veloces 2", activo: true, soloDomingo: true },
  roll: { nombre: "LA CASA DEL ROLL", contactos: ["ROLES*SANCHEZC"], grupo: "Veloces 5", activo: true },
  carretita: { nombre: "TACOS LA CARRETITA", contactos: ["TACOS*ESTADIO"], grupo: "Veloces 2", activo: true },
  maz: { nombre: "MAZ SALADS", contactos: ["BRENDASALADS"], grupo: "MAZ SALADS TOREO", activo: true },
  aldente: { nombre: "ALDENTE", contactos: ["ALDENTE"], grupo: "Al Dente Pedidos", activo: true }
};

let gruposCache = {};

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, P().child({ level: "fatal" })) },
    browser: ["Windows", "Chrome", "124.0.6367.118"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    logger: P({ level: "silent" }),
    getMessage: async () => undefined
  });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect } = u;
    if (connection === 'open') {
      pairingCode = "CONECTADO";
      try {
        const all = await sock.groupFetchAllParticipating();
        for (let jid in all) gruposCache[jid] = all[jid].subject;
      } catch(e){}
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code!== DisconnectReason.loggedOut) setTimeout(startBot, 3000);
      else pairingCode = "DESCONECTADO - GENERA NUEVA CLAVE";
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;
      const jid = msg.key.remoteJid;
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").toLowerCase();
      const pushName = (msg.pushName || "").toUpperCase();
      const hasImage =!!msg.message.imageMessage;

      // PRIVADO: No contesta el bot, contestas tú personalmente
      if (!jid.endsWith('@g.us')) return;

      // GRUPOS: Solo si es grupo sagrado y contacto sagrado
      let nombreGrupo = gruposCache[jid];
      if (!nombreGrupo) {
        try { const md = await sock.groupMetadata(jid); nombreGrupo = md.subject; gruposCache[jid] = nombreGrupo; } catch(e){ return; }
      }

      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.villafit.contactos.some(c => pushName.includes(c)) && hasImage) {
        await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg }); return;
      }
      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.saboria.contactos.some(c => pushName.includes(c)) && text.includes("saboria")) {
        if (new Date().getDay()!== 0) return;
        await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg }); return;
      }
      if (nombreGrupo.includes("Veloces 5") && RESTAURANTES.roll.contactos.some(c => pushName.includes(c)) && text.includes("av. de la marina 432")) {
        await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg }); return;
      }
      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.carretita.contactos.some(c => pushName.includes(c)) && text.includes("tacos la carretita")) {
        await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg }); return;
      }
      if (nombreGrupo.includes("MAZ SALADS TOREO") && RESTAURANTES.maz.contactos.some(c => pushName.includes(c))) {
        await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg }); return;
      }
      if (nombreGrupo.includes("Al Dente Pedidos") && RESTAURANTES.aldente.contactos.some(c => pushName.includes(c)) && ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"].some(k => text.includes(k))) {
        await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg }); return;
      }
      // Si no es sagrado, no hace nada

    } catch(e){}
  });
}

app.get('/', (req, res) => {
  let html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
  <h2>MANDADITOS BOT</h2><h1 style="background:black;color:lime;padding:20px;">${pairingCode}</h1>
  <form action="/pair"><input name="number" value="${lastNumber}"><button>GENERAR CLAVE</button></form></body></html>`;
  res.send(html);
});

app.get('/pair', async (req, res) => {
  let num = (req.query.number || lastNumber).replace(/[^0-9]/g, '');
  if (!num.startsWith('52')) num = '52' + num.replace(/^52/, '');
  lastNumber = num;
  try {
    if (!sock) await startBot();
    await new Promise(r => setTimeout(r, 1500));
    pairingCode = await sock.requestPairingCode(num);
  } catch(e){ pairingCode = "ERROR: " + e.message; }
  res.redirect('/');
});

startBot();
app.listen(process.env.PORT || 10000, () => console.log("Bot listo"));

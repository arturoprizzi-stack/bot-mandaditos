const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let pairingCode = "DALE A GENERAR CLAVE ABAJO";
let lastNumber = "526695456822";

// MEMORIA SAGRADA - 6 REALES - NO INVENTAR
const RESTAURANTES = {
  villafit: { nombre: "VILLAFIT", contactos: ["VILLAFIT","VILLAFIT2"], grupo: "Veloces 2", activo: true, soloFotos: true },
  saboria: { nombre: "MENUDO DOÑA LUPE SABORIA", contactos: ["MENUDO*SANCHEZ","MENUDO*SANCHEZ2"], grupo: "Veloces 2", palabra: "SABORIA", activo: true, soloDomingo: true },
  roll: { nombre: "LA CASA DEL ROLL Sanchez Celis", contactos: ["ROLES*SANCHEZC"], grupo: "Veloces 5", frase: "Av. de la Marina 432", activo: true },
  carretita: { nombre: "TACOS LA CARRETITA", contactos: ["TACOS*ESTADIO"], grupo: "Veloces 2", frase: "Tacos La Carretita", activo: true },
  maz: { nombre: "MAZ SALADS", contactos: ["BRENDASALADS"], grupo: "MAZ SALADS TOREO", activo: true },
  aldente: { nombre: "ALDENTE", contactos: ["ALDENTE"], grupo: "Al Dente Pedidos", keywords: ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"], activo: true }
};

let gruposCache = {}; // jid -> nombre

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, P().child({ level: "fatal" })) },
    browser: ["Ubuntu", "Chrome", "22.04.0"], // FIX MEXICO
    logger: P({ level: "silent" })
  });
  sock.ev.on('creds.update', saveCreds);

  // Cache de grupos
  sock.ev.on('groups.upsert', async (grps) => {
    for (let g of grps) gruposCache[g.id] = g.subject;
  });

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect } = u;
    if (connection === 'open') {
      pairingCode = "CONECTADO";
      console.log("CONECTADO");
      // cargar grupos al conectar
      try {
        const all = await sock.groupFetchAllParticipating();
        for (let jid in all) gruposCache[jid] = all[jid].subject;
        console.log("Grupos cacheados:", Object.values(gruposCache).join(", "));
      } catch(e){}
    }
    if (connection === 'close' && lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) startBot();
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;
      if (!msg.key.remoteJid.endsWith('@g.us')) return; // solo grupos

      const jid = msg.key.remoteJid;
      let nombreGrupo = gruposCache[jid];
      if (!nombreGrupo) {
        try { const md = await sock.groupMetadata(jid); nombreGrupo = md.subject; gruposCache[jid] = nombreGrupo; } catch(e){ nombreGrupo = jid; }
      }

      const pushName = (msg.pushName || "").toUpperCase();
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").toLowerCase();
      const hasImage =!!msg.message.imageMessage;
      const lowerText = text.toLowerCase();

      // console.log(`Grupo:${nombreGrupo} | De:${pushName} | Texto:${text.substring(0,50)} | Foto:${hasImage}`);

      // 1. VILLAFIT - Veloces 2 - solo fotos
      if (RESTAURANTES.villafit.activo && nombreGrupo.includes("Veloces 2")) {
        if (RESTAURANTES.villafit.contactos.some(c => pushName.includes(c))) {
          if (hasImage) {
            console.log("VILLAFIT FOTO DETECTADA - RESPONDIENDO YO");
            await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg });
          }
          return;
        }
      }

      // 2. SABORIA - Veloces 2 - palabra SABORIA - solo domingos
      if (RESTAURANTES.saboria.activo && nombreGrupo.includes("Veloces 2")) {
        if (RESTAURANTES.saboria.contactos.some(c => pushName.includes(c))) {
          if (lowerText.includes("saboria")) {
            const dia = new Date().getDay(); // 0 domingo
            if (dia!== 0 && RESTAURANTES.saboria.soloDomingo) { console.log("SABORIA detectado pero no es domingo, ignorado"); return; }
            console.log("SABORIA DETECTADO - RESPONDIENDO YO");
            await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg });
          }
          return;
        }
      }

      // 3. LA CASA DEL ROLL - Veloces 5 - Av. de la Marina 432
      if (RESTAURANTES.roll.activo && nombreGrupo.includes("Veloces 5")) {
        if (RESTAURANTES.roll.contactos.some(c => pushName.includes(c))) {
          if (lowerText.includes("av. de la marina 432")) {
            console.log("ROLL DETECTADO - RESPONDIENDO YO");
            await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg });
          }
          return;
        }
      }

      // 4. TACOS LA CARRETITA - Veloces 2 - case insensitive
      if (RESTAURANTES.carretita.activo && nombreGrupo.includes("Veloces 2")) {
        if (RESTAURANTES.carretita.contactos.some(c => pushName.includes(c))) {
          if (lowerText.includes("tacos la carretita")) {
            console.log("CARRETITA DETECTADO - RESPONDIENDO YO");
            await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg });
          }
          return;
        }
      }

      // 5. MAZ SALADS - MAZ SALADS TOREO - todo de BRENDASALADS
      if (RESTAURANTES.maz.activo && nombreGrupo.includes("MAZ SALADS TOREO")) {
        if (RESTAURANTES.maz.contactos.some(c => pushName.includes(c))) {
          console.log("MAZ SALADS DETECTADO - RESPONDIENDO YO");
          await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg });
          return;
        }
      }

      // 6. ALDENTE - Al Dente Pedidos - keywords
      if (RESTAURANTES.aldente.activo && nombreGrupo.includes("Al Dente Pedidos")) {
        if (RESTAURANTES.aldente.contactos.some(c => pushName.includes(c))) {
          if (RESTAURANTES.aldente.keywords.some(k => lowerText.includes(k))) {
            console.log("ALDENTE DETECTADO - RESPONDIENDO YO");
            await sock.sendMessage(jid, { text: "Yo" }, { quoted: msg });
          }
          return;
        }
      }

    } catch (e) { console.log("Error msg:", e.message) }
  });
}

// WEB CON INTERRUPTORES POR RESTAURANTE
app.get('/', (req, res) => {
  let html = `
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family:sans-serif;padding:15px}.on{color:green}.off{color:red}.card{border:1px solid #ccc;padding:10px;margin:10px 0;border-radius:8px}</style>
  </head><body>
  <h2>MANDADITOS - CLAVE MEXICO</h2>
  <h1 style="background:black;color:lime;padding:20px;font-size:32px;">${pairingCode}</h1>
  <form action="/pair"><input name="number" value="${lastNumber}" style="padding:8px"><button>GENERAR CLAVE</button></form>
  <hr><h3>Interruptores POR RESTAURANTE (Sagrado)</h3>
  `;
  for (let id in RESTAURANTES) {
    const r = RESTAURANTES[id];
    html += `<div class="card"><b>${r.nombre}</b> - Grupo: ${r.grupo} - Contacto: ${r.contactos.join(", ")}<br>
    Estado: <span class="${r.activo?'on':'off'}">${r.activo?'ACTIVO':'APAGADO'}</span>
    <a href="/toggle/${id}"><button>${r.activo?'APAGAR':'PRENDER'}</button></a></div>`;
  }
  html += `</body></html>`;
  res.send(html);
});

app.get('/pair', async (req, res) => {
  let num = (req.query.number || lastNumber).replace(/[^0-9]/g, '');
  if (!num.startsWith('52')) num = '52' + num.replace(/^52/, '');
  lastNumber = num;
  try {
    if (!sock) await startBot();
    await new Promise(r => setTimeout(r, 1500));
    const code = await sock.requestPairingCode(num);
    pairingCode = code;
    console.log("CLAVE GENERADA: " + code);
  } catch (e) { pairingCode = "ERROR"; console.log(e); }
  res.redirect('/');
});

app.get('/toggle/:id', (req, res) => {
  const id = req.params.id;
  if (RESTAURANTES[id]) RESTAURANTES[id].activo =!RESTAURANTES[id].activo;
  res.redirect('/');
});

startBot();
app.listen(10000, () => console.log("Bot listo - 6 restaurantes reales - interruptores por restaurante"));

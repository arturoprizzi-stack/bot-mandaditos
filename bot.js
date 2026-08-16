const fs = require('fs');
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const app = express();

let sock;
let pairingCode = "DESCONECTADO - GENERA NUEVA CLAVE";
let lastNumber = "526695456822";

const RESTAURANTES = {
  villafit: { nombre: "VILLAFIT", contactos: ["VILLAFIT","VILLAFIT2"], grupo: "Veloces 2", activo: true },
  saboria: { nombre: "MENUDO DOÑA LUPE SABORIA", contactos: ["MENUDO*SANCHEZ","MENUDO*SANCHEZ2"], grupo: "Veloces 2", activo: true },
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
    browser: ["Ubuntu", "Chrome", "22.04.0"], // TRUCO QUE FUNCIONO
    syncFullHistory: false,
    markOnlineOnConnect: false,
    logger: P({ level: "silent" }),
    getMessage: async () => undefined
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    if (u.connection === 'open') {
      pairingCode = "CONECTADO - BOT RECIBIENDO MENSAJES";
      console.log("BOT CONECTADO - CARGANDO GRUPOS");
      try {
        const all = await sock.groupFetchAllParticipating();
        for (let j in all) gruposCache[j] = all[j].subject;
        console.log("Grupos cargados:", Object.keys(all).length);
      } catch(e) {
        console.log("Error cargando grupos", e);
      }
    }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      console.log("Desconectado", code);
      pairingCode = "DESCONECTADO - GENERA NUEVA CLAVE";
      if (code!== DisconnectReason.loggedOut) setTimeout(startBot, 2000);
    }
  });

  // ESTO ES LO IMPORTANTE PARA QUE RECIBA MENSAJES
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) return;

      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").toLowerCase();
      const pushName = (msg.pushName || "").toUpperCase();
      const hasImage =!!msg.message.imageMessage;

      let nombreGrupo = gruposCache[jid];
      if (!nombreGrupo) {
        try {
          const md = await sock.groupMetadata(jid);
          nombreGrupo = md.subject;
          gruposCache[jid] = nombreGrupo;
        } catch(e) { return; }
      }

      // LOG PARA VER EN RENDER SI SI LE LLEGAN
      console.log(`[MENSAJE] Grupo:${nombreGrupo} | De:${pushName} | Texto:${text.substring(0,60)} | Imagen:${hasImage}`);

      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.villafit.activo && RESTAURANTES.villafit.contactos.some(c=>pushName.includes(c)) && hasImage) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg});
        console.log("=> Respondio VILLAFIT");
        return;
      }
      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.saboria.activo && RESTAURANTES.saboria.contactos.some(c=>pushName.includes(c)) && text.includes("saboria")) {
        if (new Date().getDay() === 0) return;
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg});
        return;
      }
      if (nombreGrupo.includes("Veloces 5") && RESTAURANTES.roll.activo && RESTAURANTES.roll.contactos.some(c=>pushName.includes(c)) && text.includes("av. de la marina 432")) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.carretita.activo && RESTAURANTES.carretita.contactos.some(c=>pushName.includes(c)) && text.includes("tacos la carretita")) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("MAZ SALADS TOREO") && RESTAURANTES.maz.activo && RESTAURANTES.maz.contactos.some(c=>pushName.includes(c))) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Al Dente Pedidos") && RESTAURANTES.aldente.activo && RESTAURANTES.aldente.contactos.some(c=>pushName.includes(c)) && ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"].some(k=>text.includes(k))) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
    } catch(e) {
      console.log("Error mensaje", e);
    }
  });
}

app.get('/', (req,res) => {
  let botones = Object.keys(RESTAURANTES).map(k => `<div style="margin:8px;padding:10px;border:1px solid #ccc"><b>${RESTAURANTES[k].nombre}</b> - ${RESTAURANTES[k].grupo} - ${RESTAURANTES[k].activo?'ON':'OFF'} <a href="/toggle/${k}"><button>${RESTAURANTES[k].activo?'APAGAR':'PRENDER'}</button></a></div>`).join('');
  res.send(`<html><body><h2>MANDADITOS BOT</h2><h1 style="background:black;color:lime;padding:20px;">${pairingCode}</h1><form action="/pair"><input name="number" value="${lastNumber}"><button>GENERAR CLAVE</button></form> <a href="/reset"><button style="background:red;color:white;padding:10px;">RESET SESION (si marca ERROR)</button></a><hr><h3>6 SAGRADOS - Interruptores</h3>${botones}<p>TRUCO: Ubuntu 22.04 + DEBUG MENSAJES</p></body></html>`);
});

app.get('/toggle/:id', (req,res)=>{
  if(RESTAURANTES[req.params.id]) RESTAURANTES[req.params.id].activo =!RESTAURANTES[req.params.id].activo;
  res.redirect('/');
});

app.get('/reset', async (req,res)=>{
  try{ if(sock) sock.end(); }catch(e){}
  try{ fs.rmSync('./auth_info',{recursive:true,force:true}); }catch(e){}
  pairingCode="SESION BORRADA - GENERA CLAVE NUEVA";
  setTimeout(startBot,1000);
  res.redirect('/');
});

app.get('/pair', async (req,res)=>{
  let num=(req.query.number||lastNumber).replace(/[^0-9]/g,'');
  if(!num.startsWith('52')) num='52'+num.replace(/^52/,'');
  lastNumber=num;
  try{
    if(!sock) await startBot();
    await new Promise(r=>setTimeout(r,1500));
    pairingCode=await sock.requestPairingCode(num);
    console.log("CLAVE GENERADA:", pairingCode);
  }catch(e){
    pairingCode="ERROR: "+e.message;
    console.log("Error pairing", e.message);
  }
  res.redirect('/');
});

startBot();
app.listen(process.env.PORT||10000, ()=>console.log("Bot listo"));

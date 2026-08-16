const fs = require('fs');
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const app = express();

// ============ MANEJADORES GLOBALES DE ERRORES ============
// Sin esto, si el proceso truena por una excepción no capturada,
// Render lo reinicia en silencio y nunca sabes por qué.
process.on('uncaughtException', (err) => {
  console.error('!!! UNCAUGHT EXCEPTION !!!', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('!!! UNHANDLED REJECTION !!!', reason);
});

let sock;
let pairingCode = "DESCONECTADO - GENERA NUEVA CLAVE";
let lastNumber = "526695456822";

// ============ NÚMEROS DE CADA RESTAURANTE ============
// Rellena aquí el número real de cada contacto (formato: 52XXXXXXXXXX@s.whatsapp.net)
// Esto es más confiable que pushName, que es el nombre que ELLOS pusieron en su perfil,
// no el que tú guardaste en tus contactos.
const NUMEROS = {
  villafit: ["", ""],      // VILLAFIT, VILLAFIT2
  saboria: ["", ""],       // MENUDO*SANCHEZ, MENUDO*SANCHEZ2
  roll: [""],              // ROLES*SANCHEZC
  carretita: [""],         // TACOS*ESTADIO
  maz: [""],                // BRENDASALADS
  aldente: [""]              // ALDENTE
};

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
    browser: ["Ubuntu", "Chrome", "22.04.0"],
    // Desactivado: no necesitas el historial completo para un bot en tiempo real,
    // y sincronizarlo puede saturar el proceso al conectar.
    syncFullHistory: false,
    markOnlineOnConnect: true,
    fireInitQueries: true,
    shouldSyncHistoryMessage: () => false,
    logger: P({ level: "warn" }), // antes "silent" - ahora sí vas a ver errores internos de Baileys
    getMessage: async () => undefined
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    if (u.connection === 'open') {
      pairingCode = "CONECTADO - BOT RECIBIENDO MENSAJES";
      console.log("BOT CONECTADO");
      try {
        const all = await sock.groupFetchAllParticipating();
        for (let j in all) gruposCache[j] = all[j].subject;
        console.log("Grupos cargados:", Object.keys(all).length);
      } catch(e) {
        console.log("Error grupos", e.message);
      }
    }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      console.log("Desconectado", code, u.lastDisconnect?.error?.message);
      pairingCode = "DESCONECTADO - GENERA NUEVA CLAVE";
      if (code !== DisconnectReason.loggedOut) setTimeout(startBot, 2000);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message) return;
      if (msg.key.fromMe) return;

      const jid = msg.key.remoteJid;
      // Para grupos, el número real del que manda el mensaje viene en "participant"
      const senderJid = msg.key.participant || jid;
      const senderNumber = senderJid.split('@')[0];

      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").toLowerCase();
      const pushName = (msg.pushName || "SIN NOMBRE").toUpperCase();
      const hasImage = !!msg.message.imageMessage;

      let nombreGrupo = "CHAT PRIVADO";
      if (jid.endsWith('@g.us')) {
        nombreGrupo = gruposCache[jid] || "GRUPO";
        if (nombreGrupo === "GRUPO") {
          try {
            const md = await sock.groupMetadata(jid);
            nombreGrupo = md.subject;
            gruposCache[jid] = nombreGrupo;
          } catch(e) {}
        }
      }

      console.log(`[RECIBIDO] ${nombreGrupo} | De:${pushName} (${senderNumber}) | Texto:${text.substring(0,80)}`);

      if (!jid.endsWith('@g.us')) return;

      // Coincidencia por número si ya lo llenaste en NUMEROS, si no, cae de regreso a pushName
      const esDe = (key) => {
        const nums = NUMEROS[key] || [];
        if (nums.some(n => n && senderNumber === n)) return true;
        return RESTAURANTES[key].contactos.some(c => pushName.includes(c));
      };

      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.villafit.activo && esDe('villafit') && hasImage) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.saboria.activo && esDe('saboria') && text.includes("saboria")) {
        if (new Date().getDay() === 0) return;
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Veloces 5") && RESTAURANTES.roll.activo && esDe('roll') && text.includes("av. de la marina 432")) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.carretita.activo && esDe('carretita') && text.includes("tacos la carretita")) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("MAZ SALADS TOREO") && RESTAURANTES.maz.activo && esDe('maz')) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Al Dente Pedidos") && RESTAURANTES.aldente.activo && esDe('aldente') && ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"].some(k=>text.includes(k))) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
    } catch(e) {
      console.log("Error mensaje", e);
    }
  });
}

app.get('/', (req,res) => {
  let botones = Object.keys(RESTAURANTES).map(k => `<div style="margin:8px;padding:10px;border:1px solid #ccc"><b>${RESTAURANTES[k].nombre}</b> - ${RESTAURANTES[k].grupo} - ${RESTAURANTES[k].activo?'ON':'OFF'} <a href="/toggle/${k}"><button>${RESTAURANTES[k].activo?'APAGAR':'PRENDER'}</button></a></div>`).join('');
  res.send(`<html><body><h2>MANDADITOS BOT - V4</h2><h1 style="background:black;color:lime;padding:20px;">${pairingCode}</h1><form action="/pair"><input name="number" value="${lastNumber}"><button>GENERAR CLAVE</button></form> <a href="/reset"><button style="background:red;color:white;padding:10px;">RESET</button></a><hr><h3>6 SAGRADOS</h3>${botones}</body></html>`);
});

app.get('/toggle/:id', (req,res)=>{
  if(RESTAURANTES[req.params.id]) RESTAURANTES[req.params.id].activo = !RESTAURANTES[req.params.id].activo;
  res.redirect('/');
});

app.get('/reset', async (req,res)=>{
  try{ if(sock) sock.end(); }catch(e){}
  try{ fs.rmSync('./auth_info',{recursive:true,force:true}); }catch(e){}
  pairingCode="SESION BORRADA";
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
  }catch(e){
    pairingCode="ERROR: "+e.message;
  }
  res.redirect('/');
});

startBot();
app.listen(process.env.PORT||10000, ()=>console.log("Bot listo"));

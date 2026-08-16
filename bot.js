const fs = require('fs');
const path = require('path');
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const app = express();

// ============ MANEJADORES GLOBALES DE ERRORES ============
process.on('uncaughtException', (err) => {
  console.error('!!! UNCAUGHT EXCEPTION !!!', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('!!! UNHANDLED REJECTION !!!', reason);
});

let sock;
let pairingCode = "DESCONECTADO - GENERA NUEVA CLAVE";
let lastNumber = "526695456822";

// ============ CONFIG PERSISTENTE (usa el mismo disco que auth_info) ============
const CONFIG_PATH = path.join(__dirname, 'auth_info', 'config.json');

function cargarActivos() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) { console.log("Error leyendo config", e.message); }
  return null;
}

function guardarActivos() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    const activos = {};
    for (const k in RESTAURANTES) activos[k] = RESTAURANTES[k].activo;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(activos, null, 2));
  } catch (e) { console.log("Error guardando config", e.message); }
}

// ============ DATOS POR RESTAURANTE (todo en un solo lugar) ============
// numeros: agrega aquí los números reales en formato 52 + 10 dígitos (sin el "1" extra).
// Puedes agregar números de prueba en la misma lista, ej: ["5216xxxxxxxxx", "52TUNUMERODEPRUEBA"]
const RESTAURANTES = {
  villafit: {
    nombre: "VILLAFIT", grupo: "Veloces 2", activo: true,
    contactosNombre: ["VILLAFIT", "VILLAFIT2"],
    numeros: []
  },
  saboria: {
    nombre: "MENUDO DOÑA LUPE SABORIA", grupo: "Veloces 2", activo: true,
    contactosNombre: ["MENUDO*SANCHEZ", "MENUDO*SANCHEZ2"],
    numeros: []
  },
  roll: {
    nombre: "LA CASA DEL ROLL", grupo: "Veloces 5", activo: true,
    contactosNombre: ["ROLES*SANCHEZC"],
    numeros: []
  },
  carretita: {
    nombre: "TACOS LA CARRETITA", grupo: "Veloces 2", activo: true,
    contactosNombre: ["TACOS*ESTADIO"],
    numeros: []
  },
  maz: {
    nombre: "MAZ SALADS", grupo: "MAZ SALADS TOREO", activo: true,
    contactosNombre: ["BRENDASALADS"],
    numeros: []
  },
  aldente: {
    nombre: "ALDENTE", grupo: "Al Dente Pedidos", activo: true,
    contactosNombre: ["ALDENTE"],
    numeros: []
  }
};

// Cargar estado guardado de ON/OFF (si existe) al arrancar
const activosGuardados = cargarActivos();
if (activosGuardados) {
  for (const k in RESTAURANTES) {
    if (typeof activosGuardados[k] === 'boolean') RESTAURANTES[k].activo = activosGuardados[k];
  }
  console.log("Config de switches cargada desde disco");
}

let gruposCache = {};

function esDeRestaurante(key, pushName, senderNumber) {
  const r = RESTAURANTES[key];
  if (r.numeros.some(n => n && senderNumber === n)) return true;
  return r.contactosNombre.some(c => pushName.includes(c));
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, P().child({ level: "fatal" })) },
    browser: ["Ubuntu", "Chrome", "22.04.0"],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    fireInitQueries: true,
    shouldSyncHistoryMessage: () => false,
    logger: P({ level: "warn" }),
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

      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.villafit.activo && esDeRestaurante('villafit', pushName, senderNumber) && hasImage) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.saboria.activo && esDeRestaurante('saboria', pushName, senderNumber) && text.includes("saboria")) {
        if (new Date().getDay() === 0) return;
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Veloces 5") && RESTAURANTES.roll.activo && esDeRestaurante('roll', pushName, senderNumber) && text.includes("av. de la marina 432")) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Veloces 2") && RESTAURANTES.carretita.activo && esDeRestaurante('carretita', pushName, senderNumber) && text.includes("tacos la carretita")) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("MAZ SALADS TOREO") && RESTAURANTES.maz.activo && esDeRestaurante('maz', pushName, senderNumber)) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
      if (nombreGrupo.includes("Al Dente Pedidos") && RESTAURANTES.aldente.activo && esDeRestaurante('aldente', pushName, senderNumber) && ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"].some(k=>text.includes(k))) {
        await sock.sendMessage(jid,{text:"Yo"},{quoted:msg}); return;
      }
    } catch(e) {
      console.log("Error mensaje", e);
    }
  });
}

app.get('/', (req,res) => {
  let botones = Object.keys(RESTAURANTES).map(k => `<div style="margin:8px;padding:10px;border:1px solid #ccc"><b>${RESTAURANTES[k].nombre}</b> - ${RESTAURANTES[k].grupo} - ${RESTAURANTES[k].activo?'ON':'OFF'} <a href="/toggle/${k}"><button>${RESTAURANTES[k].activo?'APAGAR':'PRENDER'}</button></a></div>`).join('');
  res.send(`<html><body><h2>MANDADITOS BOT - V5</h2><h1 style="background:black;color:lime;padding:20px;">${pairingCode}</h1><form action="/pair"><input name="number" value="${lastNumber}"><button>GENERAR CLAVE</button></form> <a href="/reset"><button style="background:red;color:white;padding:10px;">RESET</button></a><hr><h3>6 SAGRADOS (los cambios se guardan permanentemente)</h3>${botones}</body></html>`);
});

app.get('/toggle/:id', (req,res)=>{
  if(RESTAURANTES[req.params.id]) {
    RESTAURANTES[req.params.id].activo = !RESTAURANTES[req.params.id].activo;
    guardarActivos();
  }
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

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
let modoSilencioso = false; // true = detecta y registra en log, pero NUNCA manda "Yo"

// ============ NORMALIZACIÓN (quita acentos, pasa a mayúsculas) ============
// Así "Sabo­ría", "SABORIA", "saboria" y "SaBoRíA" se tratan como lo mismo.
function norm(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

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
    activos.__modoSilencioso = modoSilencioso;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(activos, null, 2));
  } catch (e) { console.log("Error guardando config", e.message); }
}

// ============ DATOS POR RESTAURANTE ============
// numeros: formato 52 + 10 dígitos (sin el "1" extra), tal como confirmamos que funciona.
// contactosNombre: respaldo por si el número no hace match (ej. cambia de número, o es número de prueba).
const RESTAURANTES = {
  villafit: {
    nombre: "VILLAFIT", grupo: "Veloces 2", activo: true,
    contactosNombre: ["VILLAFIT", "VILLAFIT2"],
    numeros: ["526699128588", "526691220281", "163015651504220", "110951940513841"]
  },
  saboria: {
    nombre: "MENUDO DOÑA LUPE SABORIA", grupo: "Veloces 2", activo: true,
    contactosNombre: ["MENUDO*SANCHEZ", "MENUDO*SANCHEZ2"],
    numeros: ["526691484113", "526691222437", "127152607494351", "196095523168257"]
  },
  roll: {
    nombre: "LA CASA DEL ROLL", grupo: "Veloces 5", activo: true,
    contactosNombre: ["ROLES*SANCHEZC", "ROLES*SANCHEZ"],
    numeros: ["526691491778", "241055324704912"]
  },
  carretita: {
    nombre: "TACOS LA CARRETITA", grupo: "Veloces 2", activo: true,
    contactosNombre: ["TACOS*ESTADIO"],
    numeros: ["526691172841", "177158962057264"]
  },
  maz: {
    nombre: "MAZ SALADS", grupo: "MAZ SALADS TOREO", activo: true,
    contactosNombre: ["BRENDASALADS", "MAZ SALADS", "MAZSALADS", "MAZ SALADS TOREO", "MAZSALADS TOREO"],
    numeros: ["526692514582", "124451660255334"]
  },
  aldente: {
    nombre: "ALDENTE", grupo: "Al Dente Pedidos", activo: true,
    contactosNombre: ["ALDENTE", "ALDENTE3", "IRVING"],
    numeros: ["526692699876", "526691619067", "526692705147", "26766370467858", "1464768458800", "169535344791699"]
  },
  tacosalex: {
    nombre: "TACOS ALEX", grupo: "Repartos 51", activo: true,
    // Sin contactosNombre ni numeros: no importa quién reenvíe, solo el texto
    contactosNombre: [], numeros: []
  },
  quesera: {
    nombre: "QUESERA SAN ANTONIO", grupo: "Repartos 51", activo: true,
    contactosNombre: [], numeros: []
  },
  moai: {
    nombre: "MOAI", grupo: "Veloces 3", activo: true,
    contactosNombre: [],
    numeros: ["526691244534", "86166187597906"]
  }
};

// Palabras clave (ya sin acentos ni mayúsculas, porque se normalizan al comparar)
const KEYWORDS = {
  saboria: ["saboria"],
  roll: ["av. de la marina 432", "av de la marina 432"],
  carretita: ["tacos la carretita"],
  aldente: ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla","que te late","que te latte"],
  tacosalex: ["tacos alex"],
  quesera: ["quesera","qesera","queseria","qseria","quecera","qecera","qsera","qcera","quesria","qeseria","qesria","qcseria"],
  moai: ["moai"]
};

// Palabras de CIERRE/CONFIRMACIÓN: si el mensaje las trae, es que el pedido
// ya se entregó (o se está citando ese mensaje) — no es un pedido nuevo.
// Aplica a TODOS los restaurantes por igual.
const PALABRAS_CIERRE = ["entregado", "listo", "quedo"];
function esMensajeDeCierre(textNorm) {
  return PALABRAS_CIERRE.some(p => textNorm.includes(norm(p)));
}

// Cargar estado guardado de ON/OFF (si existe) al arrancar
const activosGuardados = cargarActivos();
if (activosGuardados) {
  for (const k in RESTAURANTES) {
    if (typeof activosGuardados[k] === 'boolean') RESTAURANTES[k].activo = activosGuardados[k];
  }
  if (typeof activosGuardados.__modoSilencioso === 'boolean') modoSilencioso = activosGuardados.__modoSilencioso;
  console.log("Config de switches cargada desde disco. Modo silencioso:", modoSilencioso);
}

let gruposCache = {};

function esDeRestaurante(key, pushName, senderNumber) {
  const r = RESTAURANTES[key];
  // Si no se configuró ningún número ni nombre de contacto, no importa quién mande el mensaje
  if (r.numeros.length === 0 && r.contactosNombre.length === 0) return true;
  if (r.numeros.some(n => n && senderNumber === n)) return true;
  const pn = norm(pushName);
  return r.contactosNombre.some(c => pn.includes(norm(c)));
}

function textoContieneAlguna(textNorm, key) {
  const lista = KEYWORDS[key] || [];
  return lista.some(k => textNorm.includes(norm(k)));
}

async function responder(key, jid, msg, nombreGrupo, t0) {
  const nombre = RESTAURANTES[key].nombre;
  const ms = Date.now() - t0;
  if (modoSilencioso) {
    console.log(`[SIMULARIA YO] ${nombre} en ${nombreGrupo} (${ms}ms, modo silencioso activo, no se envió nada)`);
    return;
  }
  console.log(`[YO ENVIADO] ${nombre} en ${nombreGrupo} (${ms}ms desde que llegó el mensaje)`);
  await sock.sendMessage(jid, { text: "Yo" });
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
    fireInitQueries: false,
    shouldSyncHistoryMessage: () => false,
    logger: P({ level: "warn" }),
    getMessage: async () => undefined
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('groups.update', (updates) => {
    for (const u of updates) {
      if (u.id && u.subject) {
        console.log(`[GRUPO RENOMBRADO] ${gruposCache[u.id] || '(desconocido)'} -> ${u.subject}`);
        gruposCache[u.id] = u.subject;
      }
    }
  });

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
    const t0 = Date.now();
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message) return;
      if (msg.key.fromMe) return;

      const jid = msg.key.remoteJid;
      const senderJid = msg.key.participant || jid;
      const senderNumber = senderJid.split('@')[0];

      // Desenvolver mensajes temporales / de una sola vista, que WhatsApp
      // envuelve en un contenedor extra (por eso antes no se detectaba la imagen)
      let contenido = msg.message;
      if (contenido?.ephemeralMessage) contenido = contenido.ephemeralMessage.message;
      if (contenido?.viewOnceMessage) contenido = contenido.viewOnceMessage.message;
      if (contenido?.viewOnceMessageV2) contenido = contenido.viewOnceMessageV2.message;
      if (contenido?.documentWithCaptionMessage) contenido = contenido.documentWithCaptionMessage.message;

      const textoOriginal = contenido?.conversation || contenido?.extendedTextMessage?.text || contenido?.imageMessage?.caption || "";
      const textNorm = norm(textoOriginal);
      const pushName = msg.pushName || "SIN NOMBRE";
      const hasImage = !!contenido?.imageMessage;

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
      const grupoNorm = norm(nombreGrupo);

      console.log(`[RECIBIDO] ${nombreGrupo} | De:${pushName} (${senderNumber}) | Texto:${textoOriginal.substring(0,80)}`);

      if (!jid.endsWith('@g.us')) return;

      if (esMensajeDeCierre(textNorm)) {
        console.log(`[IGNORADO - mensaje de cierre/confirmacion] ${nombreGrupo} | Texto:${textoOriginal.substring(0,60)}`);
        return;
      }

      function evaluar(key, condicionExtra) {
        const r = RESTAURANTES[key];
        const coincide = grupoNorm.includes(norm(r.grupo)) && esDeRestaurante(key, pushName, senderNumber) && condicionExtra;
        if (!coincide) return false;
        if (!r.activo) {
          console.log(`[IGNORADO - restaurante apagado] ${r.nombre} en ${nombreGrupo}`);
          return true; // ya se manejó (aunque no se responda), no seguir evaluando otros
        }
        return 'responder';
      }

      const villafitR = evaluar('villafit', hasImage);
      if (villafitR === 'responder') { await responder('villafit', jid, msg, nombreGrupo, t0); return; }
      if (villafitR) return;

      const saboriaR = evaluar('saboria', textoContieneAlguna(textNorm,'saboria'));
      if (saboriaR === 'responder') { await responder('saboria', jid, msg, nombreGrupo, t0); return; }
      if (saboriaR) return;

      const rollR = evaluar('roll', textoContieneAlguna(textNorm,'roll'));
      if (rollR === 'responder') { await responder('roll', jid, msg, nombreGrupo, t0); return; }
      if (rollR) return;

      const carretitaR = evaluar('carretita', textoContieneAlguna(textNorm,'carretita'));
      if (carretitaR === 'responder') { await responder('carretita', jid, msg, nombreGrupo, t0); return; }
      if (carretitaR) return;

      const mazR = evaluar('maz', true);
      if (mazR === 'responder') { await responder('maz', jid, msg, nombreGrupo, t0); return; }
      if (mazR) return;

      const aldenteR = evaluar('aldente', textoContieneAlguna(textNorm,'aldente'));
      if (aldenteR === 'responder') { await responder('aldente', jid, msg, nombreGrupo, t0); return; }
      if (aldenteR) return;

      const tacosalexR = evaluar('tacosalex', textoContieneAlguna(textNorm,'tacosalex'));
      if (tacosalexR === 'responder') { await responder('tacosalex', jid, msg, nombreGrupo, t0); return; }
      if (tacosalexR) return;

      const queseraR = evaluar('quesera', textoContieneAlguna(textNorm,'quesera'));
      if (queseraR === 'responder') { await responder('quesera', jid, msg, nombreGrupo, t0); return; }
      if (queseraR) return;

      const moaiR = evaluar('moai', textoContieneAlguna(textNorm,'moai'));
      if (moaiR === 'responder') { await responder('moai', jid, msg, nombreGrupo, t0); return; }
      if (moaiR) return;
    } catch(e) {
      console.log("Error mensaje", e);
    }
  });
}

app.get('/', (req,res) => {
  let botones = Object.keys(RESTAURANTES).map(k => `<div style="margin:8px;padding:10px;border:1px solid #ccc"><b>${RESTAURANTES[k].nombre}</b> - ${RESTAURANTES[k].grupo} - ${RESTAURANTES[k].activo?'ON':'OFF'} <a href="/toggle/${k}"><button>${RESTAURANTES[k].activo?'APAGAR':'PRENDER'}</button></a></div>`).join('');
  const colorModo = modoSilencioso ? 'orange' : 'green';
  const textoModo = modoSilencioso ? 'MODO SILENCIOSO: ACTIVO (no manda nada, solo registra en el log)' : 'MODO NORMAL (responde de verdad)';
  res.send(`<html><body><h2>MANDADITOS BOT - V7</h2><h1 style="background:black;color:lime;padding:20px;">${pairingCode}</h1><form action="/pair"><input name="number" value="${lastNumber}"><button>GENERAR CLAVE</button></form> <a href="/reset"><button style="background:red;color:white;padding:10px;">RESET</button></a><hr><div style="padding:15px;background:${colorModo};color:white;font-weight:bold;">${textoModo} <a href="/silencioso"><button>${modoSilencioso?'ACTIVAR RESPUESTAS REALES':'ACTIVAR MODO SILENCIOSO'}</button></a></div><hr><h3>6 SAGRADOS (los cambios se guardan permanentemente)</h3>${botones}</body></html>`);
});

app.get('/silencioso', (req,res)=>{
  modoSilencioso = !modoSilencioso;
  guardarActivos();
  res.redirect('/');
});

// ============ EXPERIMENTAL: buscar el LID/JID real de un número ============
app.get('/buscar', async (req,res) => {
  const numero = (req.query.numero || '').replace(/[^0-9]/g,'');
  if (!numero) {
    return res.send(`<html><body><h2>Buscar LID de un número</h2><form action="/buscar"><input name="numero" placeholder="Ej. 526699128588"><button>Buscar</button></form><p><a href="/buscar-todos">Buscar todos los 9 números de golpe</a></p><p><a href="/">Volver</a></p></body></html>`);
  }
  try {
    if (!sock) return res.send("El bot no está conectado todavía.");
    const resultado = await sock.onWhatsApp(numero);
    res.send(`<html><body><h2>Resultado para ${numero}</h2><pre>${JSON.stringify(resultado, null, 2)}</pre><p><a href="/buscar">Buscar otro</a></p><p><a href="/">Volver</a></p></body></html>`);
  } catch(e) {
    res.send(`<html><body><h2>Error</h2><pre>${e.message}</pre><p><a href="/buscar">Reintentar</a></p></body></html>`);
  }
});

app.get('/buscar-todos', async (req,res) => {
  if (!sock) return res.send("El bot no está conectado todavía.");
  const numerosAConsultar = [
    ["villafit-1","526699128588"], ["villafit-2","526691220281"],
    ["saboria-1","526691484113"], ["saboria-2","526691222437"],
    ["roll","526691491778"],
    ["carretita","526691172841"],
    ["maz","526692514582"],
    ["aldente-1","526692699876"], ["aldente-2 (ALDENTE3)","526691619067"], ["aldente-3 (IRVING)","526692705147"]
  ];
  let out = "<html><body><h2>LID de los 9 contactos</h2><pre>";
  for (const [etiqueta, num] of numerosAConsultar) {
    try {
      const r = await sock.onWhatsApp(num);
      const lid = r && r[0] ? r[0].lid : "NO ENCONTRADO";
      out += `${etiqueta} (${num}) -> ${lid}\n`;
    } catch(e) {
      out += `${etiqueta} (${num}) -> ERROR: ${e.message}\n`;
    }
  }
  out += "</pre><p><a href='/'>Volver</a></p></body></html>";
  res.send(out);
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

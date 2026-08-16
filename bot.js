const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const express = require('express');
const P = require('pino');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 10000;

// PRUEBA CON LOS DOS FORMATOS - CAMBIAREMOS SI FALLA
const BOT_NUMBER = "526695456822"; // Sin el 1, este es el que Baileys quiere para México
const BOT_NUMBER_ALT = "5216695456822";

const CONFIG_PATH = path.join(__dirname, 'config.json');
function getConfig() {
  try { if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
  return { villafit: true, menudo: true, roll: true, carretita: true, maz: true, aldente: true };
}
function saveConfig(c){ fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2)); }

function debeDecirYo(msg, config) {
  const grupo = msg.grupo; const contacto = msg.contacto; const texto = msg.texto || ""; const esFoto = msg.hasImage;
  const tLower = texto.toLowerCase(); const tUpper = texto.toUpperCase();
  if (grupo.includes("Veloces 2") && ["VILLAFIT","VILLAFIT2"].includes(contacto)) { if (config.villafit && esFoto) return true; return false; }
  if (grupo.includes("Veloces 2") && contacto.includes("MENUDO")) { if (config.menudo && tUpper.includes("SABORIA") && new Date().getDay()===0) return true; }
  if (grupo.includes("Veloces 5") && contacto.includes("ROLES")) { if (config.roll && texto.includes("Av. de la Marina 432")) return true; }
  if (grupo.includes("Veloces 2") && contacto.includes("TACOS")) { if (config.carretita && tLower.includes("tacos la carretita")) return true; }
  if (grupo.includes("MAZ SALADS") && contacto.includes("BRENDA")) { if (config.maz) return true; }
  if (grupo.includes("Al Dente") && contacto.includes("ALDENTE")) { const claves=["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"]; if(config.aldente && claves.some(k=>tLower.includes(k))) return true; }
  return false;
}

let pairingCodeGlobal = ""; let lastCodeTime = 0;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }), printQRInTerminal: false, browser: ["Mandaditos","Chrome","1.0"] });
  sock.ev.on('creds.update', saveCreds);

  if (!state.creds.registered) {
    setTimeout(async () => {
      try {
        // Intenta con el formato sin 1 primero
        const code = await sock.requestPairingCode(BOT_NUMBER);
        pairingCodeGlobal = code; lastCodeTime = Date.now();
        console.log(`\n\n====== CODIGO: ${code} PARA ${BOT_NUMBER} ======\n`);
      } catch (e) {
        console.log("Fallo con "+BOT_NUMBER+", intentando con "+BOT_NUMBER_ALT, e.message);
        try {
          const code2 = await sock.requestPairingCode(BOT_NUMBER_ALT);
          pairingCodeGlobal = code2; lastCodeTime = Date.now();
          console.log(`\n\n====== CODIGO: ${code2} PARA ${BOT_NUMBER_ALT} ======\n`);
        } catch (e2){ console.log("Error pairing ambos:", e2.message); }
      }
    }, 5000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot(); else { console.log("Logged out, borra auth_info"); pairingCodeGlobal=""; }
    } else if (connection === 'open') { console.log('BOT CONECTADO MANDADITOS'); pairingCodeGlobal=""; }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0]; if (!msg.message || msg.key.fromMe) return;
      const remoteJid = msg.key.remoteJid; if (!remoteJid.includes('@g.us')) return;
      const groupMetadata = await sock.groupMetadata(remoteJid).catch(()=>null);
      const groupName = groupMetadata?.subject || remoteJid;
      const pushName = msg.pushName || "";
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
      const hasImage =!!msg.message.imageMessage;
      if (debeDecirYo({grupo:groupName, contacto:pushName.toUpperCase(), texto:text, hasImage}, getConfig())) {
        await sock.sendMessage(remoteJid, { text: "Yo" });
        console.log(`YO -> ${groupName} | ${pushName}`);
      }
    } catch (e){ console.log("Error msg:", e.message); }
  });
}

// --- PANEL DE RESTAURANTES CON BOTONES ---
app.get('/', (req, res) => {
  const cfg = getConfig();
  const codeHtml = pairingCodeGlobal? `<div style="background:#25D366;color:white;padding:20px;border-radius:10px;margin:20px 0;"><h2 style="margin:0;">TU CODIGO:</h2><h1 style="font-size:55px;letter-spacing:10px;margin:10px 0;">${pairingCodeGlobal.match(/.{1,4}/g)?.join('-') || pairingCodeGlobal}</h1><p>WhatsApp del bot > Ajustes > Dispositivos vinculados > Vincular con número<br>El código expira en 60 segundos, actualiza la página para uno nuevo</p><small>Probando con número: ${BOT_NUMBER}</small></div>` : `<div style="padding:20px;background:#eee;border-radius:10px;">Bot esperando conexión o ya conectado. Si no vincula, borra auth_info y redeploy.</div>`;

  res.send(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mandaditos Bot</title></head>
  <body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;">
    <h1>🤖 Bot Mandaditos</h1>
    ${codeHtml}
    <h2>Botones de Restaurantes (Activa/Desactiva)</h2>
    <div id="panel" style="display:flex;flex-direction:column;gap:10px;">
      ${Object.entries({villafit:"VillaFit (Fotos)", menudo:"Menudo / Saboria", roll:"Roll & Bowl (Marina 432)", carretita:"Tacos La Carretita", maz:"Maz Salads - Brenda", aldente:"Al Dente"}).map(([k,label])=>`
        <label style="display:flex;justify-content:space-between;align-items:center;padding:15px;border:1px solid #ccc;border-radius:8px;">
          <span><b>${label}</b></span>
          <input type="checkbox" ${cfg[k]?'checked':''} onchange="toggle('${k}', this.checked)" style="width:25px;height:25px;">
        </label>`).join('')}
    </div>
    <p style="margin-top:20px;"><button onclick="location.reload()" style="padding:10px 20px;">Actualizar Código</button></p>
    <script>
      async function toggle(key, val){
        const res = await fetch('/api/config',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({key, val})});
        const data = await res.json(); console.log(data);
      }
    </script>
  </body></html>`);
});

app.get('/api/config', (req,res)=> res.json(getConfig()));
app.post('/api/config', (req,res)=>{
  const {key, val} = req.body; const cfg=getConfig(); cfg[key]=val; saveConfig(cfg); res.json({ok:true, cfg});
});

app.listen(PORT, ()=> console.log(`Web en ${PORT}`));
startBot();

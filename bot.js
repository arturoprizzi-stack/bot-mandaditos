const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const express = require('express');
const P = require('pino');

const app = express();
const PORT = process.env.PORT || 10000;

// --- NUMERO DEL BOT - SIN +, SIN ESPACIOS ---
// Ejemplo: 5216691234567 (52 + 1 + tu numero)
const BOT_NUMBER = "521669XXXXXXX"; // <<< CAMBIA AQUI TU NUMERO REAL

function getConfig() {
  try {
    const p = path.join(__dirname, 'config.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return { villafit: true, menudo: true, roll: true, carretita: true, maz: true, aldente: true };
}

function debeDecirYo(msg, config) {
  const grupo = msg.grupo;
  const contacto = msg.contacto;
  const texto = msg.texto || "";
  const esFoto = msg.hasImage;
  const tLower = texto.toLowerCase();
  const tUpper = texto.toUpperCase();

  if (grupo.includes("Veloces 2") && ["VILLAFIT","VILLAFIT2"].includes(contacto)) {
    if (config.villafit && esFoto) return true;
    return false;
  }
  if (grupo.includes("Veloces 2") && contacto.includes("MENUDO")) {
    if (config.menudo && tUpper.includes("SABORIA")) {
      if (new Date().getDay() === 0) return true;
    }
  }
  if (grupo.includes("Veloces 5") && contacto.includes("ROLES")) {
    if (config.roll && texto.includes("Av. de la Marina 432")) return true;
  }
  if (grupo.includes("Veloces 2") && contacto.includes("TACOS")) {
    if (config.carretita && tLower.includes("tacos la carretita")) return true;
  }
  if (grupo.includes("MAZ SALADS") && contacto.includes("BRENDA")) {
    if (config.maz) return true;
  }
  if (grupo.includes("Al Dente") && contacto.includes("ALDENTE")) {
    const claves = ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"];
    if (config.aldente && claves.some(k => tLower.includes(k))) return true;
  }
  return false;
}

let pairingCodeGlobal = "";

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["Mandaditos", "Chrome", "1.0"]
  });

  sock.ev.on('creds.update', saveCreds);

  // Si no está registrado, pide codigo por numero
  if (!state.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(BOT_NUMBER);
        pairingCodeGlobal = code;
        console.log(`\n\n================= CODIGO PARA VINCULAR =================`);
        console.log(`NUMERO: ${BOT_NUMBER}`);
        console.log(`CODIGO: ${code}`);
        console.log(`Ve a WhatsApp del BOT > Ajustes > Dispositivos vinculados > Vincular con numero de telefono`);
        console.log(`================================================================\n\n`);
      } catch (e) {
        console.log("Error pidiendo pairing code:", e.message);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      console.log('Conexion cerrada, reconectando:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('BOT LISTO Y CONECTADO - MANDADITOS');
      pairingCodeGlobal = "";
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid.includes('@g.us')) return; // solo grupos

      const groupMetadata = await sock.groupMetadata(remoteJid).catch(()=>null);
      const groupName = groupMetadata?.subject || remoteJid;

      const pushName = msg.pushName || "";
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
      const hasImage =!!msg.message.imageMessage;

      const paraLogica = {
        grupo: groupName,
        contacto: pushName.toUpperCase(),
        texto: text,
        hasImage: hasImage
      };

      const config = getConfig();
      if (debeDecirYo(paraLogica, config)) {
        await sock.sendMessage(remoteJid, { text: "Yo" });
        console.log(`YO -> ${groupName} | ${pushName} | ${text.substring(0,50)}`);
      }
    } catch (e) {
      console.log("Error mensaje:", e.message);
    }
  });
}

app.get('/', (req, res) => {
  res.send(`
    <html><body style="font-family:sans-serif; text-align:center; padding-top:50px;">
      <h1>Bot Mandaditos</h1>
      ${pairingCodeGlobal? `<h1 style="font-size:60px; letter-spacing:12px; color:#128C7E;">${pairingCodeGlobal.match(/.{1,4}/g).join('-')}</h1><p>Copia este codigo en tu WhatsApp del BOT:<br><b>Ajustes > Dispositivos vinculados > Vincular con numero</b></p>` : `<p>Bot Conectado o Esperando... Revisa los Logs en Render</p><p>Si no sale codigo, borra la carpeta auth_info en Render y haz redeploy</p>`}
      <br><a href="/">Actualizar</a>
    </body></html>
  `);
});

app.listen(PORT, () => console.log(`Web en ${PORT}`));
startBot();

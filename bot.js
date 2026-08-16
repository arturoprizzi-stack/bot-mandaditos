const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const P = require('pino');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let pairingCode = "DALE A GENERAR CLAVE ABAJO";
let lastNumber = "526695456822";

// REGLAS SAGRADAS - NO BORRAR
const RESTAURANTES = [
  { id: "tacos", nombre: "Tacos El Paisa" },
  { id: "sushi", nombre: "Sushi House" },
  { id: "mariscos", nombre: "Mariscos El Guero" },
  { id: "pollos", nombre: "Pollos Asados Culiacan" },
  { id: "pizzas", nombre: "Pizzas Mama Mia" }
];

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P().child({ level: "fatal" }))
    },
    browser: ["Ubuntu", "Chrome", "22.04.0"], // CORRECCION IMPORTANTE PARA MEXICO
    logger: P({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect } = u;
    if (connection === 'open') {
      pairingCode = "CONECTADO - BOTONES ACTIVOS";
      console.log("CONECTADO - Bot listo");
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });

  // BOTONES DE RESTAURANTES - SAGRADO
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;
      const from = msg.key.remoteJid;
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

      if (text.includes("hola") || text.includes("menu") || text.includes("inicio") || text.length < 4) {
        const buttons = RESTAURANTES.map(r => ({
          buttonId: r.id,
          buttonText: { displayText: r.nombre },
          type: 1
        }));
        buttons.push({ buttonId: "ver_pedido", buttonText: { displayText: "Ver mi pedido" }, type: 1 });

        await sock.sendMessage(from, {
          text: "*Bienvenido a Mandaditos Culiacan*\n\nElige un restaurante:",
          buttons: buttons,
          headerType: 1
        });
      }
    } catch (e) {
      console.log(e)
    }
  });
}

// PAGINA WEB CON CLAVE Y BOTONES
app.get('/', (req, res) => {
  res.send(`
    <html>
    <head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="font-family:sans-serif;text-align:center;padding:20px;">
      <h2>MANDADITOS CULIACAN - CLAVE MEXICO</h2>
      <h1 style="background:black;color:lime;padding:25px;font-size:40px;letter-spacing:5px;">${pairingCode}</h1>
      <form action="/pair">
        <input name="number" value="${lastNumber}" style="font-size:20px;padding:10px;width:220px;">
        <br><br>
        <button style="font-size:20px;padding:12px 30px;background:green;color:white;border:none;">GENERAR CLAVE</button>
      </form>
      <hr>
      <h3>Restaurantes activos (Sagrados):</h3>
      <p>${RESTAURANTES.map(r => r.nombre).join(" | ")}</p>
      <p>Estado: ${pairingCode}</p>
    </body>
    </html>
  `);
});

app.get('/pair', async (req, res) => {
  let num = (req.query.number || lastNumber).replace(/[^0-9]/g, '');
  if (!num.startsWith('52')) num = '52' + num.replace(/^52/, '');
  lastNumber = num;
  try {
    if (!sock) await startBot();
    await new Promise(r => setTimeout(r, 1800));
    const code = await sock.requestPairingCode(num);
    pairingCode = code;
    console.log("CLAVE GENERADA: " + code);
  } catch (e) {
    pairingCode = "ERROR: " + e.message;
    console.log(e);
  }
  res.redirect('/');
});

startBot();
app.listen(10000, () => console.log("Bot listo - con botones y correccion Mexico"));

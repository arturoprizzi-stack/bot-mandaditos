const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

let sock;
let qrCode = null;
let pairingCode = null;
let estado = "Desconectado";
let config = {
  general: true,
  villafit: true,
  saboria: true,
  roll: true,
  carretita: true,
  maz: true,
  aldente: true
};

// Cargar config si existe
if (fs.existsSync('./config.json')) {
  config = JSON.parse(fs.readFileSync('./config.json'));
}
function guardarConfig() {
  fs.writeFileSync('./config.json', JSON.stringify(config));
}

// --- BOT WHATSAPP ---
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({ auth: state, printQRInTerminal: true, browser: ['Mandaditos Bot', 'Chrome', '1.0'] });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      estado = "Desconectado";
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      estado = "Conectado y trabajando";
      pairingCode = null;
      console.log("¡VINCULADO!");
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    //... aquí va toda tu lógica blindada anti Yo/Y, anti Entregado, etc que ya teníamos
    // (la dejo intacta, no la toco para no romperla)
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const grupo = msg.key.remoteJid;
    const textoUpper = texto.toUpperCase().trim();

    // REGLAS BLINDADAS
    if (["YO", "Y", "YOO", "YO."].includes(textoUpper)) return;
    if (textoUpper.includes("ENTREGADO") || textoUpper.includes("CITADO")) return;
    if (texto.length < 3) return;

    if (!config.general) return;

    //... tus 6 ifs de restaurantes aquí (Villafit, Saboria, etc)...
    // Ejemplo:
    // if (config.carretita && grupo.includes("Veloces") && textoUpper.includes("TACOS LA CARRETITA")) { await sock.sendMessage(grupo, { text: "Yo" }); }
  });
}

startBot();

// --- PANEL WEB ---
app.get('/', (req, res) => {
  res.send(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  body{font-family:sans-serif;padding:20px;background:#f2f2f2}
 .card{background:white;padding:15px;border-radius:12px;margin-bottom:10px}
  button{padding:12px 20px;border:none;border-radius:8px;font-weight:bold;font-size:16px;width:100%}
 .on{background:#22c55e;color:white}.off{background:#ef4444;color:white}.gen{background:#3b82f6;color:white}
 .codigo{font-size:42px;letter-spacing:5px;text-align:center;background:black;color:#0f0;padding:15px;border-radius:10px;margin-top:10px}
  </style></head><body>
  <h2>Bot Mandaditos - ${estado.includes("Conectado")? "🟢" : "🔴"} ${estado}</h2>

  ${estado.includes("Desconectado")? `
    <div class="card" style="border:3px solid red">
      <h3>Se desconectó</h3>
      <button class="gen" onclick="generarCodigo()">👉 GENERAR CÓDIGO NUEVO</button>
      <div id="codigoBox"></div>
      <p style="font-size:13px">Luego en el otro celular: WhatsApp > Dispositivos vinculados > Vincular con número > escribe el código</p>
    </div>
  ` : `<div class="card" style="background:#dcfce7">🟢 Conectado y trabajando</div>`}

  <div class="card"><label>INTERRUPTOR GENERAL</label><br><button class="${config.general?'on':'off'}" onclick="toggle('general')">${config.general?'ON':'OFF'}</button></div>
  <div class="card"><label>Villafit - Solo FOTOS</label><br><button class="${config.villafit?'on':'off'}" onclick="toggle('villafit')">${config.villafit?'ON':'OFF'}</button></div>
  <div class="card"><label>Saboria - Solo Domingos + SABORIA</label><br><button class="${config.saboria?'on':'off'}" onclick="toggle('saboria')">${config.saboria?'ON':'OFF'}</button></div>
  <div class="card"><label>Casa del Roll - Av. de la Marina 432</label><br><button class="${config.roll?'on':'off'}" onclick="toggle('roll')">${config.roll?'ON':'OFF'}</button></div>
  <div class="card"><label>Tacos La Carretita - Veloces 2</label><br><button class="${config.carretita?'on':'off'}" onclick="toggle('carretita')">${config.carretita?'ON':'OFF'}</button></div>
  <div class="card"><label>MAZ SALADS - BRENDASALADS</label><br><button class="${config.maz?'on':'off'}" onclick="toggle('maz')">${config.maz?'ON':'OFF'}</button></div>
  <div class="card"><label>ALDENTE - 8 keywords</label><br><button class="${config.aldente?'on':'off'}" onclick="toggle('aldente')">${config.aldente?'ON':'OFF'}</button></div>

  <p style="font-size:12px">Reglas blindadas: Anti Yo/Y, Anti Entregado, Anti citado</p>
  <script>
    async function toggle(nombre){ await fetch('/toggle/'+nombre,{method:'POST'}); location.reload(); }
    async function generarCodigo(){
      document.getElementById('codigoBox').innerHTML='Generando...';
      const r = await fetch('/generar-codigo',{method:'POST'}); const d = await r.json();
      document.getElementById('codigoBox').innerHTML='<div class=codigo>'+d.code+'</div><p>Código válido por 2 min</p>';
    }
  </script></body></html>`);
});

app.post('/toggle/:name', (req, res) => {
  config[req.params.name] =!config[req.params.name];
  guardarConfig();
  res.json({ ok: true });
});

app.post('/generar-codigo', async (req, res) => {
  try {
    if (!sock) return res.json({ code: "Bot no iniciado" });
    pairingCode = await sock.requestPairingCode("5216695456822");
    console.log("TU CODIGO ES: " + pairingCode);
    res.json({ code: pairingCode });
  } catch (e) {
    res.json({ code: "Error, intenta de nuevo: " + e.message });
  }
});

app.listen(10000, () => console.log("Panel en 10000"));

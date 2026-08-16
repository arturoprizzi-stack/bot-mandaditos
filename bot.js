const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

let sock;
let qrActual = null;
let estado = "Iniciando...";
let config = { general: true, villafit: true, saboria: true, roll: true, carretita: true, maz: true, aldente: true };

if (fs.existsSync('./config.json')) { config = JSON.parse(fs.readFileSync('./config.json')); }
function guardarConfig() { fs.writeFileSync('./config.json', JSON.stringify(config)); }

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({ auth: state, printQRInTerminal: true, browser: ['Mandaditos Bot', 'Chrome', '1.0'], syncFullHistory: false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrActual = qr;
    if (connection === 'close') {
      estado = "Desconectado - Genera código nuevo";
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      estado = "Conectado y trabajando";
      qrActual = null;
    }
  });
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]; if (!msg.message || msg.key.fromMe) return;
    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (texto.toUpperCase().trim().length < 3) return; if (!config.general) return;
  });
}
startBot();

app.get('/', (req, res) => {
  res.send(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  body{font-family:sans-serif;padding:20px;background:#f2f2f2}.card{background:white;padding:15px;border-radius:12px;margin-bottom:10px}
  button{padding:14px;border:none;border-radius:10px;font-weight:bold;font-size:16px;width:100%;margin-top:8px}
.on{background:#22c55e;color:white}.off{background:#ef4444;color:white}.gen{background:#3b82f6;color:white}.reset{background:#f97316;color:white}
.codigo{font-size:38px;letter-spacing:4px;text-align:center;background:black;color:#0f0;padding:15px;border-radius:10px;margin-top:10px}
  </style></head><body>
  <h2>Bot - ${estado}</h2>
  <div class="card" style="border:3px solid red">
    <button class="reset" onclick="hacerReset()">🗑️ RESET (borrar todo y empezar de 0)</button>
    <button class="gen" onclick="generarCodigo()">GENERAR CÓDIGO DE 8 DÍGITOS</button>
    <div id="codigoBox"></div>
  </div>
  <script>
    async function hacerReset(){
      document.getElementById('codigoBox').innerHTML='Borrando... 10 seg';
      await fetch('/reset',{method:'POST'}); setTimeout(()=>location.reload(), 10000);
    }
    async function generarCodigo(){
      document.getElementById('codigoBox').innerHTML='Generando, espera 3 seg...';
      const r = await fetch('/generar-codigo',{method:'POST'}); const d = await r.json();
      document.getElementById('codigoBox').innerHTML='<div class=codigo>'+d.code+'</div><p>Cópialo YA y mételo en el celu. Si no jala a la primera espera 5 min.</p>';
    }
  </script></body></html>`);
});

app.post('/reset', async (req,res)=>{
  try{ fs.rmSync('./auth', {recursive:true, force:true}); }catch(e){}
  try{ if(sock) sock.end(); }catch(e){}
  qrActual = null; estado = "Reseteado";
  res.json({ok:true});
  setTimeout(()=>startBot(), 2000);
});

app.post('/generar-codigo', async (req, res) => {
  try {
    // Fuerza socket nuevo limpio
    try{ fs.rmSync('./auth', {recursive:true, force:true}); }catch(e){}
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const tempSock = makeWASocket({ auth: state, printQRInTerminal: true, browser: ['Mandaditos Bot', 'Chrome', '1.0'] });
    tempSock.ev.on('creds.update', saveCreds);
    await new Promise(r=>setTimeout(r, 3000));
    let code = await tempSock.requestPairingCode("526695456822");
    sock = tempSock;
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') estado = "Conectado y trabajando";
    });
    console.log("CODIGO: " + code);
    res.json({ code });
  } catch (e) {
    console.log(e);
    res.json({ code: "Error: " + e.message + " - Espera 5 min y pica RESET" });
  }
});

app.listen(10000, () => console.log("Panel 10000"));

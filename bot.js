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
  sock = makeWASocket({ auth: state, printQRInTerminal: true, browser: ['Mandaditos Bot', 'Chrome', '1.0'] });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) { qrActual = qr; estado = "Esperando vinculación (QR listo)"; }
    if (connection === 'close') {
      estado = "Desconectado";
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
    const textoUpper = texto.toUpperCase().trim();
    if (["YO", "Y", "YOO", "YO."].includes(textoUpper)) return;
    if (textoUpper.includes("ENTREGADO") || textoUpper.includes("CITADO")) return;
    if (texto.length < 3) return; if (!config.general) return;
    // Tu lógica de restaurantes aquí
  });
}
startBot();

app.get('/', (req, res) => {
  res.send(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  body{font-family:sans-serif;padding:20px;background:#f2f2f2}.card{background:white;padding:15px;border-radius:12px;margin-bottom:10px}
  button{padding:12px 20px;border:none;border-radius:8px;font-weight:bold;font-size:16px;width:100%;margin-top:8px}
 .on{background:#22c55e;color:white}.off{background:#ef4444;color:white}.gen{background:#3b82f6;color:white}.reset{background:#f97316;color:white}
 .codigo{font-size:42px;letter-spacing:5px;text-align:center;background:black;color:#0f0;padding:15px;border-radius:10px;margin-top:10px}
  </style></head><body>
  <h2>Bot Mandaditos - ${estado.includes("Conectado")?"🟢":"🔴"} ${estado}</h2>

  <div class="card" style="border:3px solid ${estado.includes("Conectado")?"green":"red"}">
    <button class="reset" onclick="hacerReset()">🗑️ 1. RESET / BORRAR SESIÓN</button>
    <button class="gen" onclick="generarCodigo()">👉 2. GENERAR CÓDIGO DE 8 DÍGITOS</button>
    <button class="gen" style="background:#111" onclick="verQR()">📷 3. VER QR (si el código no jala)</button>
    <div id="codigoBox"></div>
    <div id="qrBox" style="text-align:center;margin-top:10px"></div>
    <p style="font-size:13px">Si el código no vincula, pica VER QR y escanea el QR con el celu del bot</p>
  </div>

  <div class="card"><label>GENERAL</label><br><button class="${config.general?'on':'off'}" onclick="toggle('general')">${config.general?'ON':'OFF'}</button></div>
  <div class="card"><label>Villafit</label><br><button class="${config.villafit?'on':'off'}" onclick="toggle('villafit')">${config.villafit?'ON':'OFF'}</button></div>
  <div class="card"><label>Saboria</label><br><button class="${config.saboria?'on':'off'}" onclick="toggle('saboria')">${config.saboria?'ON':'OFF'}</button></div>
  <div class="card"><label>Casa del Roll</label><br><button class="${config.roll?'on':'off'}" onclick="toggle('roll')">${config.roll?'ON':'OFF'}</button></div>
  <div class="card"><label>Tacos La Carretita</label><br><button class="${config.carretita?'on':'off'}" onclick="toggle('carretita')">${config.carretita?'ON':'OFF'}</button></div>
  <div class="card"><label>MAZ</label><br><button class="${config.maz?'on':'off'}" onclick="toggle('maz')">${config.maz?'ON':'OFF'}</button></div>
  <div class="card"><label>ALDENTE</label><br><button class="${config.aldente?'on':'off'}" onclick="toggle('aldente')">${config.aldente?'ON':'OFF'}</button></div>

  <script>
    async function toggle(n){ await fetch('/toggle/'+n,{method:'POST'}); location.reload(); }
    async function hacerReset(){
      document.getElementById('codigoBox').innerHTML='Borrando... espera 8 seg';
      await fetch('/reset',{method:'POST'}); setTimeout(()=>location.reload(), 8000);
    }
    async function generarCodigo(){
      document.getElementById('codigoBox').innerHTML='Generando...';
      const r = await fetch('/generar-codigo',{method:'POST'}); const d = await r.json();
      document.getElementById('codigoBox').innerHTML='<div class=codigo>'+d.code+'</div><p>Mételo en 20 seg</p>';
    }
    async function verQR(){
      document.getElementById('qrBox').innerHTML='Cargando QR...';
      const r = await fetch('/qr'); const d = await r.json();
      if(d.qr) document.getElementById('qrBox').innerHTML='<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='+encodeURIComponent(d.qr)+'" style="width:280px;border:10px solid white"><p>Escanea este QR desde el celu del bot</p>';
      else document.getElementById('qrBox').innerHTML='<p>No hay QR aún, pica RESET y espera 5 seg</p>';
    }
  </script></body></html>`);
});

app.post('/toggle/:name', (req, res) => { config[req.params.name]=!config[req.params.name]; guardarConfig(); res.json({ok:true}); });
app.post('/reset', (req,res)=>{
  try{ fs.rmSync('./auth', {recursive:true, force:true}); }catch(e){}
  qrActual = null; estado = "Desconectado - Auth borrada";
  res.json({ok:true});
  setTimeout(()=>{ startBot(); }, 1500);
});
app.post('/generar-codigo', async (req, res) => {
  try {
    if(!sock){ await startBot(); await new Promise(r=>setTimeout(r,2000)); }
    let code = await sock.requestPairingCode("526695456822");
    res.json({ code });
  } catch (e) { res.json({ code: "Error: "+e.message }); }
});
app.get('/qr', (req,res)=>{ res.json({qr: qrActual}); });
app.listen(10000, () => console.log("Panel en 10000"));

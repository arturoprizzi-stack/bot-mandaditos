const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;
let sock;
let ultimoCodigo = null;
let restaurantes = [
    { id: "sushi", nombre: "Sushi Mazatlan", activo: true },
    { id: "pizza", nombre: "Pizza Loca", activo: true },
    { id: "tacos", nombre: "Tacos El Pata", activo: false },
    { id: "mariscos", nombre: "Mariscos El Wero", activo: true },
    { id: "hamburguesas", nombre: "Hamburguesas", activo: true },
];
const CONFIG_FILE = './restaurantes.json';
if (fs.existsSync(CONFIG_FILE)) {
    try { restaurantes = JSON.parse(fs.readFileSync(CONFIG_FILE)); } catch(e){}
}
function guardarConfig(){
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(restaurantes, null, 2));
}
async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Mandaditos", "Chrome", "1.0"],
        defaultQueryTimeoutMs: undefined,
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log("CONECTADO!");
            ultimoCodigo = null;
        }
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                setTimeout(iniciarBot, 3000);
            }
        }
    });
}
function generarHTML() {
    const botonesRestaurantes = restaurantes.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:#222;padding:15px 20px;border-radius:12px;margin-bottom:10px">
            <span style="font-size:18px">${r.nombre}</span>
            <label style="position:relative;display:inline-block;width:60px;height:34px">
                <input type="checkbox" ${r.activo ? 'checked' : ''} onchange="toggle('${r.id}')" style="opacity:0;width:0;height:0">
                <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${r.activo ? '#25D366' : '#555'};border-radius:34px;transition:.3s"></span>
            </label>
        </div>
    `).join('');
    const codigoHTML = ultimoCodigo 
        ? `<h1 style="font-size:50px;letter-spacing:5px;margin:10px 0;">${ultimoCodigo}</h1><h3>Metelo en el celular 669 YA</h3>`
        : `<h1>Bot Mandaditos</h1><p style="opacity:0.6">Genera un codigo para vincular</p>`;
    return `
    <body style="background:#111;color:white;text-align:center;font-family:sans-serif;padding:20px;max-width:500px;margin:0 auto">
        <div style="background:#1a1a1a;padding:25px;border-radius:20px;margin-bottom:20px;border:1px solid #333">
            ${codigoHTML}
            <a href="/generar?numero=526695456822" style="display:inline-block;padding:15px 30px;background:#25D366;color:black;font-weight:bold;font-size:18px;margin-top:15px;text-decoration:none;border-radius:10px;">GENERAR CODIGO</a>
        </div>
        <div style="text-align:left;">
            <h2 style="margin-bottom:15px">Restaurantes donde quiero ganar pedido:</h2>
            ${botonesRestaurantes}
        </div>
        <script>
            async function toggle(id){
                await fetch('/toggle?id='+id, {method:'POST'});
                location.reload();
            }
        </script>
    </body>`;
}
app.get('/', (req, res) => { res.send(generarHTML()); });
app.get('/generar', async (req, res) => {
    let numero = req.query.numero || "526695456822";
    numero = numero.replace(/[^0-9]/g, '');
    if (!sock) return res.send("Espera 5 seg y recarga");
    await new Promise(r => setTimeout(r, 3000));
    try {
        const codigo = await sock.requestPairingCode(numero);
        ultimoCodigo = codigo;
        res.redirect('/');
    } catch (e) {
        res.send(`Error: ${e.message} <br><br> Espera 2 minutos y vuelve a intentar. <a href="/">Volver</a>`);
    }
});
app.post('/toggle', (req,res)=>{
    const id = req.query.id;
    const r = restaurantes.find(x=>x.id===id);
    if(r){ r.activo = !r.activo; guardarConfig(); }
    res.json({ok:true});
});
app.get('/reset', (req,res)=>{
    if(fs.existsSync('./auth_info')) fs.rmSync('./auth_info',{recursive:true,force:true});
    ultimoCodigo=null;
    res.send("Reseteado");
    setTimeout(iniciarBot,3000);
});
app.listen(PORT, ()=>{ iniciarBot(); });

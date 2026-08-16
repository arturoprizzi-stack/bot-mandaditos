const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

let sock;
let ultimoCodigo = null;

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

app.get('/', (req, res) => {
    if (ultimoCodigo) {
        res.send(`<body style="background:#111;color:white;text-align:center;font-family:sans-serif;padding-top:50px"><h1>CODIGO: ${ultimoCodigo}</h1><h2>Metelo en el celular 669 YA</h2><p>Vincular con numero de telefono</p><a href="/generar?numero=526695456822" style="display:inline-block;padding:20px;background:lime;color:black;font-size:20px;margin-top:20px;text-decoration:none;">GENERAR OTRO CODIGO</a></body>`);
    } else {
        res.send(`<body style="background:#111;color:white;text-align:center;font-family:sans-serif;padding-top:50px"><h1>Bot Mandaditos</h1><a href="/generar?numero=526695456822" style="display:inline-block;padding:20px;background:lime;color:black;font-size:20px;text-decoration:none;">GENERAR CODIGO</a><p>Cambia el numero en la URL si es otro</p></body>`);
    }
});

app.get('/generar', async (req, res) => {
    let numero = req.query.numero || "526695456822";
    numero = numero.replace(/[^0-9]/g, '');
    
    if (!sock) return res.send("Espera 5 seg y recarga");
    
    // Espera obligatoria para que no falle
    await new Promise(r => setTimeout(r, 3000));
    
    try {
        const codigo = await sock.requestPairingCode(numero);
        ultimoCodigo = codigo;
        console.log(`CODIGO: ${codigo} para ${numero}`);
        res.redirect('/');
    } catch (e) {
        console.log("Error generando codigo:", e.message);
        res.send(`Error: ${e.message} <br><br> Espera 2 minutos y vuelve a intentar. <a href="/">Volver</a>`);
    }
});

app.get('/reset', (req,res)=>{
    if(fs.existsSync('./auth_info')) fs.rmSync('./auth_info',{recursive:true,force:true});
    ultimoCodigo=null;
    res.send("Reseteado, espera 10 seg y ve al inicio");
    setTimeout(iniciarBot,3000);
});

app.listen(PORT, ()=>{ iniciarBot(); });

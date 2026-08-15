const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys")
const express = require("express")
const app = express()
const PORT = process.env.PORT || 3000

// --- CONFIGURACION PARA PRODUCCION ---
let BOT_ACTIVO = true
let GRUPOS_CONFIG = {
    "Veloces": true,
    "Al Dente": true,
    "Mandelitos": true
}

let sockGlobal = null
let ultimoQR = null
let estadoConexion = "iniciando"

app.use(express.json())

// PANEL WEB QUE VERAS EN TU LIGA DE RAILWAY
app.get("/", (req, res) => {
    res.send(`
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Panel Bot Mandelitos</title></head>
    <body style="font-family: sans-serif; padding:20px; background:#111; color:white;">
        <h1>🤖 Panel Bot - Mandelitos</h1>
        <p><b>Estado:</b> ${estadoConexion}</p>
        <p><b>Bot General:</b> ${BOT_ACTIVO? "🟢 PRENDIDO" : "🔴 APAGADO"}</p>
        <button onclick="fetch('/toggle-bot',{method:'POST'}).then(()=>location.reload())" style="padding:15px; font-size:18px; width:100%; background:${BOT_ACTIVO? 'red' : 'green'}; color:white; border:none; border-radius:10px;">${BOT_ACTIVO? 'APAGAR TODO' : 'PRENDER TODO'}</button>
        <hr>
        <h2>Grupos</h2>
        ${Object.keys(GRUPOS_CONFIG).map(g => `
            <div style="display:flex; justify-content:space-between; padding:15px; background:#222; margin:10px 0; border-radius:10px;">
                <span>${g}</span>
                <button onclick="fetch('/toggle-grupo/${g}',{method:'POST'}).then(()=>location.reload())" style="background:${GRUPOS_CONFIG[g]? 'green' : 'gray'}; color:white; border:none; padding:10px 20px; border-radius:5px;">${GRUPOS_CONFIG[g]? 'ON' : 'OFF'}</button>
            </div>
        `).join('')}
        <p style="margin-top:30px; color:#888;">Para que los admins te agreguen mañana, este bot ya debe estar hosteado aquí mismo. No necesitas tu compu.</p>
    </body>
    </html>
    `)
})

app.post("/toggle-bot", (req,res) => { BOT_ACTIVO =!BOT_ACTIVO; res.json({activo: BOT_ACTIVO}) })
app.post("/toggle-grupo/:nombre", (req,res) => { const n = req.params.nombre; if(GRUPOS_CONFIG[n]!== undefined) GRUPOS_CONFIG[n] =!GRUPOS_CONFIG[n]; res.json({ok:true}) })

// --- LÓGICA DEL BOT ---
async function start() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_final")
    const numero = "5216695456822"

    const sock = makeWASocket({ auth: state, printQRInTerminal: false })
    sockGlobal = sock
    sock.ev.on("creds.update", saveCreds)

    if (!state.creds.registered) {
        await new Promise(r => setTimeout(r, 3000))
        try {
            let code = await sock.requestPairingCode(numero)
            console.log("TU CODIGO ES: " + code)
            ultimoQR = code
            estadoConexion = "Esperando codigo: " + code
        } catch(e) { console.log("Error pidiendo codigo:", e.message) }
    }

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update
        if (connection === "open") { console.log("¡VINCULADO CON EXITO!"); estadoConexion = "🟢 Conectado y trabajando" }
        if (connection === "close") {
            estadoConexion = "Reconectando..."
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
            if(shouldReconnect) setTimeout(start, 5000)
            else estadoConexion = "Desconectado - necesita nuevo codigo"
        }
    })

    sock.ev.on("messages.upsert", async ({ messages }) => {
        if(!BOT_ACTIVO) return
        const msg = messages[0]
        if(!msg.message || msg.key.fromMe) return
        // Aquí va tu lógica de respuestas por grupo
        console.log("Mensaje de:", msg.key.remoteJid)
    })
}

app.listen(PORT, () => { console.log("Panel en puerto " + PORT) })
start()

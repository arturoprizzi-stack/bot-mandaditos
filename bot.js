const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys")
const express = require("express")
const app = express()
const PORT = process.env.PORT || 3000

let BOT_ACTIVO = true
let GRUPOS_CONFIG = {
    "Veloces": true,
    "Al Dente": true,
    "Mandelitos": true
}

let sockGlobal = null
let estadoConexion = "iniciando"

app.use(express.json())

app.get("/", (req, res) => {
    res.send(`
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Panel Bot</title></head>
    <body style="font-family:sans-serif;padding:20px;background:#111;color:white;">
        <h1>🤖 Bot - Mandelitos</h1>
        <p><b>Estado:</b> ${estadoConexion}</p>
        <p><b>Bot:</b> ${BOT_ACTIVO? "🟢 PRENDIDO" : "🔴 APAGADO"}</p>
        <button onclick="fetch('/toggle-bot',{method:'POST'}).then(()=>location.reload())" style="padding:15px;width:100%;background:${BOT_ACTIVO? 'red':'green'};color:white;border:none;border-radius:10px;">${BOT_ACTIVO? 'APAGAR':'PRENDER'}</button>
        <hr><h2>Grupos</h2>
        ${Object.keys(GRUPOS_CONFIG).map(g => `
            <div style="display:flex;justify-content:space-between;padding:15px;background:#222;margin:10px 0;border-radius:10px;">
                <span>${g}</span>
                <button onclick="fetch('/toggle-grupo/${g}',{method:'POST'}).then(()=>location.reload())" style="background:${GRUPOS_CONFIG[g]? 'green':'gray'};color:white;border:none;padding:10px 20px;border-radius:5px;">${GRUPOS_CONFIG[g]? 'ON':'OFF'}</button>
            </div>`).join('')}
    </body></html>`)
})

app.post("/toggle-bot", (req,res) => { BOT_ACTIVO =!BOT_ACTIVO; res.json({activo: BOT_ACTIVO}) })
app.post("/toggle-grupo/:nombre", (req,res) => { const n = req.params.nombre; if(GRUPOS_CONFIG[n]!== undefined) GRUPOS_CONFIG[n] =!GRUPOS_CONFIG[n]; res.json({ok:true}) })

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_final2")
    const numero = "5216695456822"
    const sock = makeWASocket({ auth: state, printQRInTerminal: false })
    sockGlobal = sock
    sock.ev.on("creds.update", saveCreds)

    if (!state.creds.registered) {
        await new Promise(r => setTimeout(r, 3000))
        try {
            let code = await sock.requestPairingCode(numero)
            console.log("TU CODIGO ES: " + code)
            estadoConexion = "Esperando codigo: " + code
        } catch(e) { console.log("Error codigo:", e.message) }
    }

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update
        if (connection === "open") { console.log("¡VINCULADO!"); estadoConexion = "🟢 Conectado y trabajando" }
        if (connection === "close") {
            estadoConexion = "Reconectando..."
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
            if(shouldReconnect) setTimeout(start, 5000)
            else estadoConexion = "Desconectado - necesita codigo nuevo"
        }
    })

    sock.ev.on("messages.upsert", async ({ messages }) => {
        if(!BOT_ACTIVO) return
        const msg = messages[0]
        if(!msg.message || msg.key.fromMe) return
        const jid = msg.key.remoteJid
        const esGrupo = jid.endsWith("@g.us")
        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase()
        console.log(`Mensaje de ${jid}: ${texto}`)
        if(!esGrupo){
            if(texto.includes("hola") || texto.includes("menu") || texto.includes("buenas")){
                await sock.sendMessage(jid, { text: `¡Hola! 👋 Soy el Bot de Mandaditos Mandelitos\n\n🛵 MENU:\n1️⃣ Mandado Veloz\n2️⃣ Mandado Al Dente\n3️⃣ Mandelitos\n\nEscribe el número del servicio que necesitas.` })
                return
            }
        }
        if(esGrupo){
            try{
                const meta = await sock.groupMetadata(jid)
                const nombreGrupo = meta.subject
                let activo = false
                for(let k in GRUPOS_CONFIG){
                    if(nombreGrupo.includes(k) && GRUPOS_CONFIG[k]) activo = true
                }
                if(!activo) return
                if(texto.includes("hola") || texto.includes("bot")){
                    await sock.sendMessage(jid, { text: `¡Aquí estoy! 🟢 Bot activo para ${nombreGrupo}` })
                }
            }catch(e){ console.log("Error grupo:", e.message) }
        }
    })
}

app.listen(PORT, () => console.log("Panel en puerto " + PORT))
start()

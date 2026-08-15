const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys")
const express = require("express")
const app = express()
const PORT = process.env.PORT || 3000

// === NUEVA CONFIGURACION POR RESTAURANTE ===
let BOT_ACTIVO = true
let RESTAURANTES_CONFIG = {
    "Villafit": true,
    "Saboria": true,
    "Casa del Roll": true,
    "Tacos La Carretita": true,
    "MAZ SALADS": true,
    "ALDENTE": true
}

let sockGlobal = null
let estadoConexion = "iniciando"

app.use(express.json())

app.get("/", (req, res) => {
    res.send(`
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Panel Bot</title></head>
    <body style="font-family:sans-serif;padding:20px;background:#111;color:white;">
        <h1>🤖 Bot - Mandaditos v2 BLINDADO</h1>
        <p><b>Estado:</b> ${estadoConexion}</p>
        <p><b>Bot:</b> ${BOT_ACTIVO? "🟢 PRENDIDO" : "🔴 APAGADO"}</p>
        <button onclick="fetch('/toggle-bot',{method:'POST'}).then(()=>location.reload())" style="padding:15px;width:100%;background:${BOT_ACTIVO? 'red':'green'};color:white;border:none;border-radius:10px;font-weight:bold;">${BOT_ACTIVO? 'APAGAR TODO':'PRENDER TODO'}</button>
        <hr><h2>🍽️ Restaurantes (Interruptor General + Individual)</h2>
        <div style="padding:15px;background:#333;margin:10px 0;border-radius:10px;border:2px solid #0f0;">
            <b>INTERRUPTOR GENERAL</b>
            <p style="font-size:12px;color:#aaa;">Prende/Apaga todos los restaurantes de un jalón</p>
        </div>
        ${Object.keys(RESTAURANTES_CONFIG).map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:15px;background:#222;margin:10px 0;border-radius:10px;">
                <div>
                    <b>${r}</b><br>
                    <span style="font-size:11px;color:#aaa;">
                        ${r==="Villafit"?"Veloces 2 - Solo FOTOS": r==="Saboria"?"Veloces 2 - Solo Domingos SABORIA": r==="Casa del Roll"?"Veloces 5 - Av. de la Marina 432": r==="Tacos La Carretita"?"Veloces 2 - Tacos La Carretita": r==="MAZ SALADS"?"MAZ SALADS TOREO - BRENDASALADS": "Al Dente Pedidos - 8 keywords"}
                    </span>
                </div>
                <button onclick="fetch('/toggle-restaurante/${encodeURIComponent(r)}',{method:'POST'}).then(()=>location.reload())" style="background:${RESTAURANTES_CONFIG[r]? 'green':'gray'};color:white;border:none;padding:10px 20px;border-radius:5px;font-weight:bold;">${RESTAURANTES_CONFIG[r]? 'ON':'OFF'}</button>
            </div>`).join('')}
        <hr><p style="font-size:12px;color:#888;">Reglas blindadas: Anti Yo/Y ajeno, Anti Entregado, Anti citado</p>
    </body></html>`)
})

app.post("/toggle-bot", (req,res) => { BOT_ACTIVO =!BOT_ACTIVO; res.json({activo: BOT_ACTIVO}) })
app.post("/toggle-restaurante/:nombre", (req,res) => {
    const n = decodeURIComponent(req.params.nombre);
    if(RESTAURANTES_CONFIG[n]!== undefined) RESTAURANTES_CONFIG[n] =!RESTAURANTES_CONFIG[n];
    res.json({ok:true})
})

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
        try{
            if(!BOT_ACTIVO) return
            const msg = messages[0]
            if(!msg.message || msg.key.fromMe) return

            const jid = msg.key.remoteJid
            const esGrupo = jid.endsWith("@g.us")
            if(!esGrupo) return

            const textoOriginal = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "")
            const texto = textoOriginal.toLowerCase().trim()
            const tieneFoto =!!msg.message.imageMessage
            const esCitado =!!msg.message.extendedTextMessage?.contextInfo?.quotedMessage
            const pushName = (msg.pushName || "").toLowerCase()
            const participante = (msg.key.participant || "").toLowerCase()

            console.log(`[${new Date().toLocaleTimeString()}] Grupo:${jid} | De:${msg.pushName} | Foto:${tieneFoto} | Citado:${esCitado} | Texto:${textoOriginal.substring(0,60)}`)

            // === FILTROS GLOBALES BLINDADOS QUE ME PEDISTE ===
            if (esCitado) { console.log("❌ Ignorado por ser mensaje citado"); return; }
            if (texto.includes("entregado")) { console.log("❌ Ignorado por decir entregado"); return; }
            if (["yo","y","yo 🙋‍♂️","yo🙋‍♂️","yo 🙋","yo👍"].includes(texto)) { console.log("❌ Ignorado, es un YO de otro compañero"); return; }

            const meta = await sock.groupMetadata(jid)
            const nombreGrupo = meta.subject || ""
            const nombreGrupoLower = nombreGrupo.toLowerCase()

            // === LOGICA POR RESTAURANTE ===

            // 1. Villafit - Veloces 2 - Solo FOTOS
            if (RESTAURANTES_CONFIG["Villafit"] && nombreGrupoLower.includes("veloces 2")) {
                if (tieneFoto && (texto.includes("villafit") || pushName.includes("villafit") || textoOriginal.includes("Villafit"))) {
                    await sock.sendMessage(jid, { text: "Yo 🙋‍♂️" }); console.log("✅ YO -> Villafit"); return;
                }
            }

            // 2. Saboria - Veloces 2 - Solo Domingos + SABORIA
            if (RESTAURANTES_CONFIG["Saboria"] && nombreGrupoLower.includes("veloces 2")) {
                const hoy = new Date(); const esDomingo = hoy.getDay() === 0;
                if (!esDomingo) { /* no hacer nada entre semana */ }
                else if (texto.includes("saboria")) {
                    await sock.sendMessage(jid, { text: "Yo 🙋‍♂️" }); console.log("✅ YO -> Saboria Domingo"); return;
                }
            }

            // 3. Casa del Roll - Veloces 5 - Av. de la Marina 432
            if (RESTAURANTES_CONFIG["Casa del Roll"] && nombreGrupoLower.includes("veloces 5")) {
                if (texto.includes("av. de la marina 432") || texto.includes("av de la marina 432")) {
                    await sock.sendMessage(jid, { text: "Yo 🙋‍♂️" }); console.log("✅ YO -> Casa del Roll"); return;
                }
            }

            // 4. Tacos La Carretita - Veloces 2
            if (RESTAURANTES_CONFIG["Tacos La Carretita"] && nombreGrupoLower.includes("veloces 2")) {
                if (texto.includes("tacos la carretita")) {
                    await sock.sendMessage(jid, { text: "Yo 🙋‍♂️" }); console.log("✅ YO -> Tacos La Carretita"); return;
                }
            }

            // 5. MAZ SALADS - MAZ SALADS TOREO - Todo de BRENDASALADS
            if (RESTAURANTES_CONFIG["MAZ SALADS"] && nombreGrupoLower.includes("maz salads")) {
                if (pushName.includes("brendasalads") || texto.includes("brendasalads") || participante.includes("brenda")) {
                    await sock.sendMessage(jid, { text: "Yo 🙋‍♂️" }); console.log("✅ YO -> MAZ SALADS"); return;
                }
            }

            // 6. ALDENTE - Al Dente Pedidos - 8 keywords de ALDENTE
            if (RESTAURANTES_CONFIG["ALDENTE"] && nombreGrupoLower.includes("al dente")) {
                if (pushName.includes("aldente")) {
                    const keywords = ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"];
                    if (keywords.some(k => texto.includes(k))) {
                        await sock.sendMessage(jid, { text: "Yo 🙋‍♂️" }); console.log("✅ YO -> ALDENTE " + texto); return;
                    }
                }
            }

        }catch(e){ console.error("Error mensajes:", e) }
    })
}

app.listen(PORT, () => console.log("Panel en puerto " + PORT))
start()

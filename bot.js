const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const P = require("pino")

async function startBot() {
    try {
        const { version } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState("auth_info")
        const sock = makeWASocket({ 
            version, 
            auth: state, 
            logger: P({ level: "silent" }), 
            printQRInTerminal: false, 
            browser: ["Chrome", "Chrome", "120.0.0.0"] 
        })

        if (!sock.authState.creds.registered) {
            console.log("Esperando 5 segundos para pedir codigo...")
            await new Promise(r => setTimeout(r, 5000))
            try {
                const code = await sock.requestPairingCode("526695456822")
                console.log("==========================")
                console.log("TU CODIGO ES: " + code)
                console.log("==========================")
            } catch(e) {
                console.log("Error pidiendo codigo, reintentando...", e.message)
            }
        }

        sock.ev.on("creds.update", saveCreds)
        
        sock.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect } = update
            if (connection === "open") { 
                console.log("¡BOT CONECTADO!") 
            }
            if (connection === "close") {
                const reason = lastDisconnect?.error?.output?.statusCode
                const shouldReconnect = reason !== DisconnectReason.loggedOut
                console.log("Conexion cerrada, razon:", reason, " Reconectando:", shouldReconnect)
                if (shouldReconnect) {
                    setTimeout(() => startBot(), 3000)
                }
            }
        })
    } catch (err) {
        console.log("Error fatal, reintentando en 5s", err)
        setTimeout(() => startBot(), 5000)
    }
}
startBot()

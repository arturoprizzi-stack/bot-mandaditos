const fs = require("fs"); try { fs.rmSync("auth_info", {recursive: true, force: true}); } catch {}
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys")
const P = require("pino")

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info")
    const { version } = await fetchLatestBaileysVersion()
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: "silent" }),
        printQRInTerminal: false,
        browser: ["Mandaditos", "Chrome", "1.0"]
    })

    if (!sock.authState.creds.registered) {
        console.log("Esperando para pedir codigo...")
        await new Promise(r => setTimeout(r, 3000))
        try {
            const numero = "5216695456822"
            const code = await sock.requestPairingCode(numero)
            console.log("======================================")
            console.log(`TU CODIGO ES: ${code}`)
            console.log("======================================")
        } catch (e) {
            console.log("Error pidiendo codigo:", e.message)
        }
    }

    sock.ev.on("creds.update", saveCreds)
    
    sock.ev.on("connection.update", (update) => {
        const { connection } = update
        if (connection === "open") {
            console.log("¡CONECTADO CON EXITO!")
        }
    })
}

startBot()

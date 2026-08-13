const fs = require("fs"); try { fs.rmSync("auth_info", {recursive: true, force: true}); } catch {}
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys")
const P = require("pino")

async function startBot() {
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState("auth_info")
    const sock = makeWASocket({ version, auth: state, logger: P({ level: "silent" }), printQRInTerminal: false, browser: ["Chrome", "Chrome", "120.0.0.0"] })
    if (!sock.authState.creds.registered) {
        const code = await sock.requestPairingCode("521YOURNUMBER")
        console.log("TU CODIGO ES: " + code)
    }
    sock.ev.on("creds.update", saveCreds)
    sock.ev.on("connection.update", (update) => {
        const { connection } = update
        if (connection === "open") { console.log("¡BOT CONECTADO!") }
    })
}
startBot()

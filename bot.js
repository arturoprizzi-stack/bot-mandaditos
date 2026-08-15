const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_final")
    const numero = "5216695456822"

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    })

    sock.ev.on("creds.update", saveCreds)

    if (!state.creds.registered) {
        await new Promise(r => setTimeout(r, 3000))
        try {
            let code = await sock.requestPairingCode(numero)
            console.log("TU CODIGO ES: " + code)
        } catch(e) {
            console.log("Error pidiendo codigo:", e.message)
        }
    }

    sock.ev.on("connection.update", async (update) => {
        const { connection } = update
        if (connection === "open") {
            console.log("¡VINCULADO CON EXITO!")
        }
        if (connection === "close") {
            console.log("Conexion cerrada, reconectando: true")
            // No cerramos con false, reintentamos
            setTimeout(start, 5000)
        }
    })
}
start()

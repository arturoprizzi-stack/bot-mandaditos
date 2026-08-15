const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const P = require("pino")

async function startBot() {
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState("auth_info")
    const sock = makeWASocket({ 
        version, 
        auth: state, 
        logger: P({ level: "silent" }), 
        browser: ["Chrome", "Windows", "10"] 
    })

    sock.ev.on("creds.update", saveCreds)

    // ESTO ES LO NUEVO PARA EL CODIGO DE 8 DIGITOS
    if(!sock.authState.creds.registered){
        const numero = "5216691234567" // <--- CAMBIA ESTO POR TU NUMERO REAL
        setTimeout(async () => {
            const code = await sock.requestPairingCode(numero)
            console.log("==================================")
            console.log("TU CODIGO ES: " + code)
            console.log("==================================")
        }, 3000)
    }

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Conexion cerrada, reconectando:', shouldReconnect)
            if(shouldReconnect) startBot()
        } else if(connection === 'open') {
            console.log('¡CONECTADO! Bot funcionando')
        }
    })
}
startBot()

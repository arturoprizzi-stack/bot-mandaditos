const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    })

    const botNumber = "526695456822"

    if (!sock.authState.creds.registered) {
        await new Promise(r => setTimeout(r, 3000))
        const code = await sock.requestPairingCode(botNumber)
        console.log("==============================")
        console.log(`TU CODIGO ES: ${code}`)
        console.log("==============================")
    }

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) startBot()
        } else if (connection === 'open') {
            console.log('¡BOT CONECTADO!')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        console.log("Mensaje recibido")
    })
}
startBot()

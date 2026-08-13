const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let TRABAJANDO = false; // false = NO agarra nada, true = SI agarra

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    }
});
client.on('qr', qr => { qrcode.generate(qr, {small: true}); console.log('ESCANEA EL QR'); });
client.on('ready', () => { 
    console.log('BOT LISTO!');
    if(TRABAJANDO){ console.log('MODO: TRABAJANDO - SI agarro pedidos'); }
    else{ console.log('MODO: DESCANSO - NO agarro nada, solo miro'); }
});

client.on('message', async msg => {
    try {
        if(!TRABAJANDO) return;
        if (!msg.body) return;
        const chat = await msg.getChat().catch(() => null);
        if(!chat) return;
        console.log(`Mensaje en ${chat.name}: ${msg.body.substring(0,50)}`);

     

        const texto = msg.body.toLowerCase();
        if (texto.includes('pedido') || texto.includes('domicilio')) {
            console.log(`!!! PEDIDO DETECTADO EN ${chat.name}`);
            // await chat.sendMessage('Yo voy!');
        }
    } catch (e) {
        console.log('Error:', e);
    }
});

client.initialize();

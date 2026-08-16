const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// --- CONEXION CON EL PANEL NUEVO ---
function getConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.log("No hay config.json aun, usando todo prendido");
  }
  return { villafit: true, menudo: true, roll: true, carretita: true, maz: true, aldente: true };
}

// --- LOGICA FINAL POR RESTAURANTE ---
function debeDecirYo(msg, config) {
  const grupo = msg.grupo;
  const contacto = msg.contacto;
  const texto = (msg.texto || "");
  const esFoto = msg.hasImage;
  const tLower = texto.toLowerCase();
  const tUpper = texto.toUpperCase();

  if (grupo === "Veloces 2" && ["VILLAFIT","VILLAFIT2"].includes(contacto)) {
    if (config.villafit && esFoto) return true;
    return false;
  }
  if (grupo === "Veloces 2" && ["MENUDO*SANCHEZ","MENUDO*SANCHEZ2"].includes(contacto)) {
    if (config.menudo && tUpper.includes("SABORIA")) {
      const hoy = new Date().getDay();
      if (hoy === 0) return true; // Solo domingos
    }
  }
  if (grupo === "Veloces 5" && contacto === "ROLES*SANCHEZC") {
    if (config.roll && texto.includes("Av. de la Marina 432")) return true;
  }
  if (grupo === "Veloces 2" && contacto === "TACOS*ESTADIO") {
    if (config.carretita && tLower.includes("tacos la carretita")) return true;
  }
  if (grupo === "MAZ SALADS TOREO" && contacto === "BRENDASALADS") {
    if (config.maz) return true;
  }
  if (grupo === "Al Dente Pedidos" && contacto === "ALDENTE") {
    const claves = ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"];
    if (config.aldente && claves.some(k => tLower.includes(k))) return true;
  }
  return false;
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', async (qr) => {
  await qrcode.toFile(path.join(__dirname, 'qr.png'), qr);
  console.log('QR generado en qr.png');
});

client.on('ready', () => {
  console.log('BOT LISTO');
});

client.on('message', async (msg) => {
  try {
    const chat = await msg.getChat();
    if (!chat.isGroup) return;

    const config = getConfig();
    const chatName = chat.name;
    const author = msg.author || "";
    const contact = await msg.getContact();
    const notifyName = contact.pushname || contact.name || "";

    // Normalizamos para tu logica
    const mensajeParaLogica = {
      grupo: chatName,
      contacto: notifyName.toUpperCase(),
      texto: msg.body || "",
      hasImage: msg.hasMedia
    };

    // También checamos por ID por si el nombre cambia
    if (author.includes("MENUDO") || notifyName.toUpperCase().includes("MENUDO")) mensajeParaLogica.contacto = "MENUDO*SANCHEZ";
    if (notifyName === "VILLAFIT" || notifyName === "VILLAFIT2") mensajeParaLogica.contacto = notifyName;

    if (debeDecirYo(mensajeParaLogica, config)) {
      await chat.sendMessage("Yo");
      console.log(`YO -> ${chatName} | ${mensajeParaLogica.contacto} | ${mensajeParaLogica.texto.substring(0,60)}`);
    }

  } catch (e) {
    console.log("Error msg:", e.message);
  }
});

client.initialize();

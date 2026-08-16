const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

app.use(express.json());

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Config por defecto - 6 restaurantes
let defaultConfig = {
  villafit: true,
  menudo: true,
  roll: true,
  carretita: true,
  maz: true,
  aldente: true
};

// Cargar config si existe
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return defaultConfig;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

app.get('/', (req, res) => {
  const config = loadConfig();
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Bot Mandaditos - Panel</title>
      <style>
        body { background: #111; color: #fff; font-family: sans-serif; padding: 20px; }
        h1 { color: #00ff88; }
        .card { background: #222; padding: 15px; border-radius: 10px; margin-bottom: 15px; }
        label { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #333; margin: 8px 0; border-radius: 8px; cursor: pointer; }
        input[type=checkbox] { width: 22px; height: 22px; }
        .nota { font-size: 12px; color: #aaa; margin-top: 4px; }
        button { background: #00ff88; color: #000; border: none; padding: 12px 20px; border-radius: 8px; font-weight: bold; width: 100%; margin-top: 10px; }
        a { color: #00ff88; }
      </style>
    </head>
    <body>
      <h1>Bot Mandaditos - Panel</h1>
      <p>Hora: ${new Date().toLocaleString()}</p>
      <a href="/qr">Ver QR de WhatsApp</a>
      
      <div class="card">
        <h3>🍽️ Restaurantes - ON / OFF por restaurante</h3>
        
        <label>
          <span>VILLAFIT (Solo Fotos)<br><span class="nota">Veloces 2 - VILLAFIT / VILLAFIT2 - Solo si trae imagen</span></span>
          <input type="checkbox" id="sw-villafit" ${config.villafit ? 'checked' : ''}>
        </label>

        <label>
          <span>MENUDO DOÑA LUPE SABORIA<br><span class="nota">Veloces 2 - MENUDO*SANCHEZ - Palabra: SABORIA - Solo domingos</span></span>
          <input type="checkbox" id="sw-menudo" ${config.menudo ? 'checked' : ''}>
        </label>

        <label>
          <span>LA CASA DEL ROLL - Sánchez Celis<br><span class="nota">Veloces 5 - ROLES*SANCHEZC - Av. de la Marina 432</span></span>
          <input type="checkbox" id="sw-roll" ${config.roll ? 'checked' : ''}>
        </label>

        <label>
          <span>TACOS LA CARRETITA<br><span class="nota">Veloces 2 - TACOS*ESTADIO - "Tacos La Carretita" case-insensitive</span></span>
          <input type="checkbox" id="sw-carretita" ${config.carretita ? 'checked' : ''}>
        </label>

        <label>
          <span>MAZ SALADS<br><span class="nota">MAZ SALADS TOREO - BRENDASALADS - Todos los pedidos</span></span>
          <input type="checkbox" id="sw-maz" ${config.maz ? 'checked' : ''}>
        </label>

        <label>
          <span>ALDENTE - Zona Cerritos<br><span class="nota">Al Dente Pedidos - ALDENTE - quete, quette, muralla, saljo, saljoo, sajo, sajoo, olla</span></span>
          <input type="checkbox" id="sw-aldente" ${config.aldente ? 'checked' : ''}>
        </label>

        <button onclick="guardar()">GUARDAR CAMBIOS</button>
        <p id="status"></p>
      </div>

      <script>
        async function guardar() {
          const config = {
            villafit: document.getElementById('sw-villafit').checked,
            menudo: document.getElementById('sw-menudo').checked,
            roll: document.getElementById('sw-roll').checked,
            carretita: document.getElementById('sw-carretita').checked,
            maz: document.getElementById('sw-maz').checked,
            aldente: document.getElementById('sw-aldente').checked
          };
          const res = await fetch('/api/config', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(config)
          });
          document.getElementById('status').innerText = '✅ Guardado correctamente - Bot actualizado';
          setTimeout(()=> document.getElementById('status').innerText='', 3000);
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
  saveConfig(req.body);
  console.log('Config actualizada:', req.body);
  res.json({ ok: true });
});

app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, 'qr.png'), (err) => {
    if(err) res.send('QR aun no generado, inicia el bot con: node bot.js');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Panel abierto en puerto ${PORT}`);
});

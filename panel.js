const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

app.use(express.json());

app.get('/', (req, res) => {
  res.send(`
    <h1>Bot Veloces - Panel</h1>
    <p>Bot funcionando correctamente</p>
    <p>Hora: ${new Date().toLocaleString()}</p>
    <a href="/qr">Ver QR</a>
  `);
});

app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, 'qr.png'), (err) => {
    if(err) res.send('QR aun no generado, inicia el bot con: node index.js');
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Panel abierto en http://localhost:${PORT}`);
});
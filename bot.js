// bot.js - LÓGICA FINAL
function debeDecirYo(msg) {
  const grupo = msg.grupo;
  const contacto = msg.contacto;
  const texto = (msg.texto || "");
  const esFoto = msg.hasImage;
  const tLower = texto.toLowerCase();
  const tUpper = texto.toUpperCase();

  // VILLAFIT - SOLO FOTOS
  if (grupo === "Veloces 2" && ["VILLAFIT","VILLAFIT2"].includes(contacto)) {
    if (config.villafit && esFoto) return true;
    return false;
  }
  // SABORIA
  if (grupo === "Veloces 2" && ["MENUDO*SANCHEZ","MENUDO*SANCHEZ2"].includes(contacto)) {
    if (config.menudo && tUpper.includes("SABORIA")) return true;
  }
  // ROLL
  if (grupo === "Veloces 5" && contacto === "ROLES*SANCHEZC") {
    if (config.roll && texto.includes("Av. de la Marina 432")) return true;
  }
  // CARRETITA
  if (grupo === "Veloces 2" && contacto === "TACOS*ESTADIO") {
    if (config.carretita && tLower.includes("tacos la carretita")) return true;
  }
  // MAZ SALADS
  if (grupo === "MAZ SALADS TOREO" && contacto === "BRENDASALADS") {
    if (config.maz) return true;
  }
  // ALDENTE
  if (grupo === "Al Dente Pedidos" && contacto === "ALDENTE") {
    const claves = ["quete","quette","muralla","saljo","saljoo","sajo","sajoo","olla"];
    if (config.aldente && claves.some(k => tLower.includes(k))) return true;
  }
  return false;
}

// Sommige browsers (vooral Chrome op Android) proberen een http-adres eerst via https te openen. Onze lokale
// server spreekt alleen http, en antwoordt dan met onzin op het https-begin: Chrome toont ERR_SSL_PROTOCOL_ERROR
// en valt niet altijd terug. Deze voorpost kijkt naar de eerste byte van elke verbinding: is dat het begin van een
// https-handshake (0x16), dan wordt de verbinding direct verbroken. Chrome ziet dat als "https werkt hier niet" en
// opent de pagina via gewoon http. Al het andere gaat ongewijzigd door naar de normale http-server (en Socket.IO).
const net = require('net');

function createGuard(httpServer) {
  return net.createServer((socket) => {
    socket.on('error', () => { /* verbinding weg: niets aan te doen */ });
    socket.setTimeout(30000, () => socket.destroy()); // nooit iets gestuurd: opruimen
    socket.once('data', (buf) => {
      socket.setTimeout(0);
      if (buf.length && buf[0] === 0x16) { socket.destroy(); return; } // https-poging: kort en duidelijk weigeren
      socket.pause();
      socket.unshift(buf);
      httpServer.emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
  });
}

module.exports = { createGuard };

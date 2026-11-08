// Netwerkadres van de laptop voor de QR-code (lokaal) of het https-adres (online, Render).
'use strict';
const os = require('os');
const dgram = require('dgram');

// Het adres van de laptop in het wifi-netwerk. Virtuele netwerkkaarten (Docker, WSL/Hyper-V, VirtualBox,
// VMware, Tailscale, ZeroTier, VPN) worden overgeslagen; 192.168.x.x krijgt voorrang, dan 10.x, dan 172.16-31.x.
const VIRTUAL_IF = /(docker|br-|veth|vethernet|wsl|hyper-?v|virtualbox|vbox|vmnet|vmware|tailscale|zerotier|zt[0-9a-z]|utun|tun|tap|wg|ham|npcap|loopback|bluetooth)/i;
// Het juiste adres voor de telefoons zoeken: het adres waarmee de laptop zelf het netwerk op gaat (de route naar de
// router). Dat vraagt de laptop aan het besturingssysteem via een UDP-'verbinding' die niets verstuurt. Zo maakt het
// niet uit of er ook een kabel, VMware of een vast adres op een andere verbinding zit. Lukt dat niet (geen router),
// dan kiest de quiz zelf het beste adres uit de lijst. Elke 15 seconden opnieuw, voor als de laptop van netwerk wisselt.
let routeAddress = null;
function refreshRouteAddress() {
  try {
    const sock = dgram.createSocket('udp4');
    sock.on('error', () => { routeAddress = null; try { sock.close(); } catch (e) { /* al dicht */ } });
    sock.connect(53, '8.8.8.8', () => {
      try { routeAddress = sock.address().address; } catch (e) { routeAddress = null; }
      try { sock.close(); } catch (e) { /* al dicht */ }
    });
  } catch (e) { routeAddress = null; }
}
refreshRouteAddress();
setInterval(refreshRouteAddress, 15000).unref();
function getLanAddress() {
  const ifs = os.networkInterfaces();
  const exists = routeAddress && Object.values(ifs).some((list) => (list || []).some((i) => i.address === routeAddress && !i.internal));
  return exists ? routeAddress : pickLanAddress(ifs);
}
function pickLanAddress(interfaces) {
  const found = [];
  for (const [name, list] of Object.entries(interfaces || {})) {
    for (const i of list || []) {
      const isV4 = i.family === 'IPv4' || i.family === 4;
      if (!isV4 || i.internal || i.address.startsWith('169.254.')) continue;
      found.push({ name, address: i.address, virtual: VIRTUAL_IF.test(name) || /^172\.17\./.test(i.address) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(i.address) });
    }
  }
  // Reserve als er geen route naar een router is: echte verbindingen vóór virtuele, dan 192.168.x.x, 10.x, 172.16–31
  const rank = (a) => (a.virtual ? 10 : 0) + (/^192\.168\./.test(a.address) ? 0 : /^10\./.test(a.address) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 2 : 5);
  found.sort((a, b) => rank(a) - rank(b));
  return found.length ? found[0].address : null;
}
function getJoinUrl(port) {
  const publicUrl = process.env.RENDER_EXTERNAL_URL; // online (Render): het https-adres; lokaal: zelf het adres zoeken
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  return `http://${getLanAddress() || 'localhost'}:${port}`;
}

module.exports = { pickLanAddress, getLanAddress, getJoinUrl, VIRTUAL_IF };

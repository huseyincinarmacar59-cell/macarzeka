// Sahte PeerJS sunucusu: kimlik kaydı + mesaj aktarma (yalnızca test için)
const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 9100 });
const ids = new Map(); // id -> ws
wss.on("connection", (ws) => {
  ws.ids = new Set();
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.type === "claim") {
      if (ids.has(m.id) && ids.get(m.id) !== ws) ws.send(JSON.stringify({ type: "taken", id: m.id }));
      else { ids.set(m.id, ws); ws.ids.add(m.id); ws.send(JSON.stringify({ type: "claimed", id: m.id })); }
    } else if (m.type === "release") {
      if (ids.get(m.id) === ws) ids.delete(m.id); ws.ids.delete(m.id);
    } else if (m.to) {
      const t = ids.get(m.to);
      if (t && t.readyState === 1) t.send(JSON.stringify(m));
      else if (m.type === "conn") ws.send(JSON.stringify({ type: "unavail", to: m.from, target: m.to, cid: m.cid }));
    }
  });
  ws.on("close", () => { for (const id of ws.ids) if (ids.get(id) === ws) ids.delete(id); });
});
console.log("relay hazır");

// window.MZ_PEER — PeerJS'in kullandığımız kısmını taklit eder (test için)
(function () {
  var ws, hazir = false, kuyruk = [], peers = {}, conns = {};
  window.__offline = false;
  function bagla() {
    ws = new WebSocket("ws://127.0.0.1:9100");
    ws.onopen = function () { hazir = true; kuyruk.splice(0).forEach(function (m) { ws.send(m); }); };
    ws.onmessage = function (ev) { if (!window.__offline) al(JSON.parse(ev.data)); };
  }
  function yolla(m) { if (window.__offline) return; var s = JSON.stringify(m); if (hazir) ws.send(s); else kuyruk.push(s); }
  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (n, f) { (this._h[n] = this._h[n] || []).push(f); return this; };
  Emitter.prototype.emit = function (n) { var a = [].slice.call(arguments, 1); (this._h[n] || []).slice().forEach(function (f) { try { f.apply(null, a); } catch (e) { console.error(e); } }); };

  function Conn(cid, kendi, karsi, metadata) {
    Emitter.call(this); this.cid = cid; this.kendi = kendi; this.peer = karsi; this.metadata = metadata; this.open = false;
    conns[cid + "|" + kendi] = this;
  }
  Conn.prototype = Object.create(Emitter.prototype);
  Conn.prototype.send = function (d) { if (!this.open) return; yolla({ type: "data", from: this.kendi, to: this.peer, cid: this.cid, d: d }); };
  Conn.prototype.close = function () {
    if (this._kapali) return; this._kapali = true; var w = this.open; this.open = false;
    delete conns[this.cid + "|" + this.kendi];
    yolla({ type: "close", from: this.kendi, to: this.peer, cid: this.cid });
    var self = this; setTimeout(function () { self.emit("close"); }, 0);
  };

  function Peer(id) {
    Emitter.call(this); this.id = id; this.destroyed = false; this.open = false;
    peers[id] = this; yolla({ type: "claim", id: id });
  }
  Peer.prototype = Object.create(Emitter.prototype);
  Peer.prototype.connect = function (to, o) {
    var cid = Math.random().toString(36).slice(2);
    var c = new Conn(cid, this.id, to, (o && o.metadata) || null);
    yolla({ type: "conn", from: this.id, to: to, cid: cid, metadata: c.metadata });
    return c;
  };
  Peer.prototype.destroy = function () {
    if (this.destroyed) return; this.destroyed = true;
    var id = this.id;
    Object.keys(conns).forEach(function (k) { var c = conns[k]; if (c.kendi === id) c.close(); });
    yolla({ type: "release", id: id }); delete peers[id];
  };
  Peer.prototype.reconnect = function () { yolla({ type: "claim", id: this.id }); };

  function al(m) {
    if (m.type === "claimed") { var p = peers[m.id]; if (p && !p.destroyed) { p.open = true; setTimeout(function () { p.emit("open", p.id); }, 30); } }
    else if (m.type === "taken") { var p2 = peers[m.id]; if (p2) p2.emit("error", { type: "unavailable-id", message: "ID taken" }); }
    else if (m.type === "unavail") { var p3 = peers[m.to]; if (p3) p3.emit("error", { type: "peer-unavailable", message: "Could not connect to peer " + m.target }); }
    else if (m.type === "conn") {
      var hp = peers[m.to]; if (!hp || hp.destroyed) return;
      var c = new Conn(m.cid, m.to, m.from, m.metadata);
      hp.emit("connection", c);
      yolla({ type: "ack", from: m.to, to: m.from, cid: m.cid });
      setTimeout(function () { c.open = true; c.emit("open"); }, 20);
    } else if (m.type === "ack") {
      var c2 = conns[m.cid + "|" + m.to]; if (c2) setTimeout(function () { c2.open = true; c2.emit("open"); }, 20);
    } else if (m.type === "data") {
      var c3 = conns[m.cid + "|" + m.to]; if (c3) c3.emit("data", m.d);
    } else if (m.type === "close") {
      var c4 = conns[m.cid + "|" + m.to]; if (c4) { c4._kapali = true; c4.open = false; delete conns[m.cid + "|" + m.to]; c4.emit("close"); }
    }
  }
  // Çevrimdışı benzetimi: bütün bağlantıları düşür
  window.__cevrimdisi = function (v) {
    window.__offline = v;
    if (v) {
      Object.keys(conns).forEach(function (k) { var c = conns[k]; c._kapali = true; c.open = false; delete conns[k]; c.emit("close"); });
      Object.keys(peers).forEach(function (id) { peers[id].emit("disconnected"); });
    } else {
      Object.keys(peers).forEach(function (id) { if (!peers[id].destroyed) yolla({ type: "claim", id: id }); });
    }
  };
  bagla();
  window.MZ_PEER = Peer;
})();

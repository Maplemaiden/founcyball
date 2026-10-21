(() => {
  "use strict";

  const PREFIX = "founcyball-";
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function randomCode(len = 6) {
    let s = "";
    for (let i = 0; i < len; i++) {
      s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    }
    return s;
  }

  function peerIdFromCode(code) {
    return PREFIX + String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function codeFromPeerId(id) {
    if (!id || !String(id).startsWith(PREFIX)) return "";
    return String(id).slice(PREFIX.length);
  }

  /**
   * PeerJS 开房联机（静态站可用，依赖公共 PeerServer）
   */
  function createNet() {
    let peer = null;
    let conn = null;
    let role = null; // "host" | "guest"
    let roomCode = "";
    let handlers = {};
    let destroyed = false;

    function emit(ev, data) {
      const fn = handlers[ev];
      if (typeof fn === "function") fn(data);
    }

    function send(msg) {
      if (!conn || !conn.open) return false;
      try {
        conn.send(msg);
        return true;
      } catch (_) {
        return false;
      }
    }

    function wireConn(c) {
      conn = c;
      c.on("open", () => {
        emit("connected", { role, roomCode });
        if (role === "guest") {
          send({ t: "hello", role: "guest" });
        } else {
          send({ t: "welcome", role: "host", roomCode });
        }
      });
      c.on("data", (data) => {
        if (!data || typeof data !== "object") return;
        emit("message", data);
      });
      c.on("close", () => {
        emit("disconnected", {});
      });
      c.on("error", (err) => {
        emit("error", { message: (err && err.message) || String(err) });
      });
    }

    function destroyPeer() {
      destroyed = true;
      try {
        if (conn) conn.close();
      } catch (_) {}
      conn = null;
      try {
        if (peer) peer.destroy();
      } catch (_) {}
      peer = null;
      role = null;
      roomCode = "";
    }

    function createRoom() {
      return new Promise((resolve, reject) => {
        if (typeof window.Peer !== "function") {
          reject(new Error("PeerJS 未加载，请检查网络"));
          return;
        }
        destroyPeer();
        destroyed = false;
        const code = randomCode(6);
        const id = peerIdFromCode(code);
        role = "host";
        roomCode = code;
        peer = new window.Peer(id, { debug: 0 });

        const fail = (err) => {
          destroyPeer();
          reject(err instanceof Error ? err : new Error(String(err)));
        };

        peer.on("error", (err) => {
          const type = err && err.type;
          if (type === "unavailable-id") {
            // 极少撞车：再试一次
            createRoom().then(resolve, reject);
            return;
          }
          emit("error", { message: (err && err.message) || String(err) });
          if (!conn) fail(err);
        });

        peer.on("open", (openId) => {
          roomCode = codeFromPeerId(openId) || code;
          emit("ready", { role, roomCode });
          resolve({ role, roomCode });
        });

        peer.on("connection", (c) => {
          if (conn && conn.open) {
            try {
              c.close();
            } catch (_) {}
            return;
          }
          wireConn(c);
        });
      });
    }

    function joinRoom(code) {
      return new Promise((resolve, reject) => {
        if (typeof window.Peer !== "function") {
          reject(new Error("PeerJS 未加载，请检查网络"));
          return;
        }
        const normalized = String(code || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        if (normalized.length < 4) {
          reject(new Error("房间号太短"));
          return;
        }
        destroyPeer();
        destroyed = false;
        role = "guest";
        roomCode = normalized;
        peer = new window.Peer(undefined, { debug: 0 });

        peer.on("error", (err) => {
          emit("error", { message: (err && err.message) || String(err) });
          if (!conn || !conn.open) {
            destroyPeer();
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });

        peer.on("open", () => {
          const c = peer.connect(peerIdFromCode(normalized), {
            reliable: true,
          });
          wireConn(c);
          const timer = setTimeout(() => {
            if (!conn || !conn.open) {
              destroyPeer();
              reject(new Error("连接超时，请确认房主在线且房间号正确"));
            }
          }, 12000);
          c.on("open", () => {
            clearTimeout(timer);
            emit("ready", { role, roomCode });
            resolve({ role, roomCode });
          });
        });
      });
    }

    return {
      on(ev, fn) {
        handlers[ev] = fn;
      },
      createRoom,
      joinRoom,
      send,
      disconnect: destroyPeer,
      getRole: () => role,
      getRoomCode: () => roomCode,
      isConnected: () => !!(conn && conn.open),
    };
  }

  window.FouncyNet = { createNet, peerIdFromCode, codeFromPeerId };
})();

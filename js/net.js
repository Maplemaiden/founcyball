(() => {
  "use strict";

  const PREFIX = "founcyball-";
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  /** 多 STUN，提高打洞成功率（无可靠免费 TURN 时先靠这个） */
  const PEER_OPTIONS = {
    debug: 0,
    secure: true,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
      ],
      iceCandidatePoolSize: 4,
    },
  };

  function randomCode(len = 6) {
    let s = "";
    for (let i = 0; i < len; i++) {
      s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    }
    return s;
  }

  function peerIdFromCode(code) {
    return (
      PREFIX +
      String(code || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
    );
  }

  function codeFromPeerId(id) {
    if (!id || !String(id).startsWith(PREFIX)) return "";
    return String(id).slice(PREFIX.length);
  }

  /**
   * PeerJS 开房联机
   * - 可靠发送队列 + 心跳
   * - 加入房间自动重试（公共信令经常抖）
   */
  function createNet() {
    let peer = null;
    let conn = null;
    let role = null; // "host" | "guest"
    let roomCode = "";
    let handlers = {};
    let destroyed = false;
    let heartbeatTimer = 0;
    let outboundQueue = [];
    let lastPongAt = 0;
    let seq = 1;

    function emit(ev, data) {
      const fn = handlers[ev];
      if (typeof fn === "function") fn(data);
    }

    function clearHeartbeat() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = 0;
      }
    }

    function flushOutbound() {
      if (!conn || !conn.open) return;
      while (outboundQueue.length) {
        const msg = outboundQueue.shift();
        try {
          conn.send(msg);
        } catch (_) {
          outboundQueue.unshift(msg);
          break;
        }
      }
    }

    function send(msg) {
      if (!msg || typeof msg !== "object") return false;
      if (!conn || !conn.open) {
        outboundQueue.push(msg);
        return false;
      }
      try {
        conn.send(msg);
        return true;
      } catch (_) {
        outboundQueue.push(msg);
        return false;
      }
    }

    function startHeartbeat() {
      clearHeartbeat();
      lastPongAt = Date.now();
      heartbeatTimer = setInterval(() => {
        if (!conn || !conn.open) return;
        send({ t: "ping", ts: Date.now() });
        // 12s 无 pong 视为假死
        if (Date.now() - lastPongAt > 12000) {
          emit("error", { message: "连接心跳超时，请双方刷新后重开房间" });
          try {
            conn.close();
          } catch (_) {}
        }
      }, 2500);
    }

    function wireConn(c) {
      // 替换旧连接
      if (conn && conn !== c) {
        try {
          conn.close();
        } catch (_) {}
      }
      conn = c;
      c.on("open", () => {
        lastPongAt = Date.now();
        startHeartbeat();
        flushOutbound();
        emit("connected", { role, roomCode });
        if (role === "guest") {
          send({ t: "hello", role: "guest" });
        } else {
          send({ t: "welcome", role: "host", roomCode });
        }
      });
      c.on("data", (data) => {
        if (!data || typeof data !== "object") return;
        if (data.t === "ping") {
          send({ t: "pong", ts: data.ts || Date.now() });
          return;
        }
        if (data.t === "pong") {
          lastPongAt = Date.now();
          return;
        }
        emit("message", data);
      });
      c.on("close", () => {
        clearHeartbeat();
        emit("disconnected", {});
      });
      c.on("error", (err) => {
        emit("error", { message: (err && err.message) || String(err) });
      });
    }

    function destroyPeer() {
      destroyed = true;
      clearHeartbeat();
      outboundQueue = [];
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
        peer = new window.Peer(id, PEER_OPTIONS);

        let settled = false;
        const fail = (err) => {
          if (settled) return;
          settled = true;
          destroyPeer();
          reject(err instanceof Error ? err : new Error(String(err)));
        };

        peer.on("error", (err) => {
          const type = err && err.type;
          if (type === "unavailable-id") {
            if (!settled) {
              settled = true;
              createRoom().then(resolve, reject);
            }
            return;
          }
          // 已开房成功后的网络抖动只提示，不拆房间
          emit("error", { message: (err && err.message) || String(err) });
          if (!settled && !conn) fail(err);
        });

        peer.on("open", (openId) => {
          roomCode = codeFromPeerId(openId) || code;
          emit("ready", { role, roomCode });
          if (!settled) {
            settled = true;
            resolve({ role, roomCode });
          }
        });

        peer.on("connection", (c) => {
          if (conn && conn.open) {
            try {
              c.close();
            } catch (_) {}
            return;
          }
          // 房主侧也显式要求可靠通道语义
          if (c && c.peerConnection) {
            /* DataConnection 已由 guest 用 reliable 发起 */
          }
          wireConn(c);
        });

        peer.on("disconnected", () => {
          // 尝试重连信令，保留 peer id
          if (destroyed || !peer) return;
          try {
            peer.reconnect();
          } catch (_) {}
          emit("error", { message: "信令短暂断开，正在重连…" });
        });
      });
    }

    function joinRoom(code, attempt = 1) {
      const maxAttempts = 4;
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
        peer = new window.Peer(undefined, PEER_OPTIONS);

        let settled = false;
        const fail = (err) => {
          if (settled) return;
          settled = true;
          const msg = (err && err.message) || String(err);
          const type = err && err.type;
          const retryable =
            type === "peer-unavailable" ||
            type === "network" ||
            type === "server-error" ||
            /timeout|unavailable|Could not connect/i.test(msg);

          if (retryable && attempt < maxAttempts) {
            emit("error", {
              message: `未找到房间，重试中 (${attempt}/${maxAttempts})…`,
            });
            try {
              if (conn) conn.close();
            } catch (_) {}
            conn = null;
            try {
              if (peer) peer.destroy();
            } catch (_) {}
            peer = null;
            const delay = 900 * attempt;
            setTimeout(() => {
              joinRoom(normalized, attempt + 1).then(resolve, reject);
            }, delay);
            return;
          }
          destroyPeer();
          reject(
            new Error(
              attempt >= maxAttempts
                ? `加入失败（已重试 ${maxAttempts} 次）。请确认房主仍在房间页，或双方刷新后重开。`
                : msg
            )
          );
        };

        peer.on("error", (err) => {
          emit("error", { message: (err && err.message) || String(err) });
          if (!conn || !conn.open) fail(err);
        });

        peer.on("open", () => {
          const c = peer.connect(peerIdFromCode(normalized), {
            reliable: true,
            serialization: "json",
          });
          wireConn(c);
          const timer = setTimeout(() => {
            if (!conn || !conn.open) {
              fail(new Error("连接超时，请确认房主在线且房间号正确"));
            }
          }, 16000);
          c.on("open", () => {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            emit("ready", { role, roomCode });
            resolve({ role, roomCode });
          });
          c.on("error", (err) => {
            clearTimeout(timer);
            fail(err);
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
      nextSeq() {
        return seq++;
      },
      disconnect: destroyPeer,
      getRole: () => role,
      getRoomCode: () => roomCode,
      isConnected: () => !!(conn && conn.open),
    };
  }

  window.FouncyNet = { createNet, peerIdFromCode, codeFromPeerId };
})();

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const rooms = new Map();

function id(size = 8) {
  return crypto.randomBytes(size).toString("base64url").slice(0, size).toUpperCase();
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_500_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function makeRoom(drawSeconds) {
  const roomCode = id(6);
  const adminId = id(12);
  const room = {
    code: roomCode,
    adminId,
    drawSeconds,
    writeSeconds: 75,
    stage: "lobby",
    roundEndsAt: 0,
    players: [],
    writings: [],
    drawings: [],
    events: new Set()
  };
  rooms.set(roomCode, room);
  return room;
}

function publicRoom(room, clientId = "") {
  const player = room.players.find((item) => item.id === clientId);
  return {
    code: room.code,
    adminId: room.adminId,
    drawSeconds: room.drawSeconds,
    writeSeconds: room.writeSeconds,
    stage: room.stage,
    roundEndsAt: room.roundEndsAt,
    players: room.players.map(({ id, name }) => ({ id, name })),
    writingCount: room.writings.length,
    drawingCount: room.drawings.length,
    gallery: room.stage === "gallery" ? room.drawings : [],
    myWriting: room.writings.find((item) => item.playerId === clientId)?.text || "",
    myDrawing: room.drawings.find((item) => item.playerId === clientId)?.drawing || "",
    assignedPrompt: player?.prompt || ""
  };
}

function publish(room) {
  for (const client of room.events) {
    client.res.write(`data: ${JSON.stringify(publicRoom(room, client.clientId))}\n\n`);
  }
}

function getRoom(code) {
  return rooms.get(String(code || "").trim().toUpperCase());
}

function requireAdmin(room, body, res) {
  if (body.adminId !== room.adminId) {
    json(res, 403, { error: "관리자만 할 수 있어요." });
    return false;
  }
  return true;
}

function assignPrompts(room) {
  const texts = room.writings.map((item) => item.text).filter(Boolean);
  room.players.forEach((player, index) => {
    player.prompt = texts.length ? texts[index % texts.length] : "상상 속 장면";
  });
}

function startWriting(room) {
  room.stage = "writing";
  room.roundEndsAt = Date.now() + room.writeSeconds * 1000;
  room.writings = [];
  room.drawings = [];
  room.players.forEach((player) => {
    player.prompt = "";
  });
}

function startDrawing(room) {
  assignPrompts(room);
  room.stage = "drawing";
  room.roundEndsAt = Date.now() + room.drawSeconds * 1000;
  room.drawings = [];
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/");

  try {
    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readBody(req);
      const drawSeconds = Math.max(30, Math.min(300, Number(body.drawSeconds || 90)));
      const room = makeRoom(drawSeconds);
      json(res, 200, { adminId: room.adminId, room: publicRoom(room, room.adminId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/join$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      if (room.players.length >= 30) return json(res, 403, { error: "이 방은 30명으로 가득 찼어요." });
      if (room.stage !== "lobby") return json(res, 403, { error: "이미 게임이 시작된 방이에요." });
      const body = await readBody(req);
      const name = String(body.name || "플레이어").trim().slice(0, 18) || "플레이어";
      const playerId = id(12);
      room.players.push({ id: playerId, name, joinedAt: Date.now(), prompt: "" });
      json(res, 200, { playerId, room: publicRoom(room, playerId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/settings$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      const body = await readBody(req);
      if (!requireAdmin(room, body, res)) return;
      room.drawSeconds = Math.max(30, Math.min(300, Number(body.drawSeconds || room.drawSeconds)));
      json(res, 200, { room: publicRoom(room, room.adminId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/start-writing$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      const body = await readBody(req);
      if (!requireAdmin(room, body, res)) return;
      if (room.players.length < 1) return json(res, 400, { error: "참가자가 들어온 뒤 시작할 수 있어요." });
      startWriting(room);
      json(res, 200, { room: publicRoom(room, room.adminId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/start-drawing$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      const body = await readBody(req);
      if (!requireAdmin(room, body, res)) return;
      startDrawing(room);
      json(res, 200, { room: publicRoom(room, room.adminId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/submit-writing$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      if (room.stage !== "writing") return json(res, 400, { error: "지금은 글쓰기 시간이 아니에요." });
      const body = await readBody(req);
      const player = room.players.find((item) => item.id === body.playerId);
      if (!player) return json(res, 403, { error: "참가자 정보가 맞지 않아요." });
      const text = String(body.text || "").trim().slice(0, 100);
      if (!text) return json(res, 400, { error: "글을 입력해 주세요." });
      room.writings = room.writings.filter((item) => item.playerId !== player.id);
      room.writings.push({ playerId: player.id, name: player.name, text, submittedAt: Date.now() });
      if (room.writings.length >= room.players.length) startDrawing(room);
      json(res, 200, { room: publicRoom(room, player.id) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/submit-drawing$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      if (room.stage !== "drawing") return json(res, 400, { error: "지금은 그리기 시간이 아니에요." });
      const body = await readBody(req);
      const player = room.players.find((item) => item.id === body.playerId);
      if (!player) return json(res, 403, { error: "참가자 정보가 맞지 않아요." });
      const drawing = String(body.drawing || "");
      if (!drawing.startsWith("data:image/png;base64,")) return json(res, 400, { error: "그림 데이터가 필요해요." });
      room.drawings = room.drawings.filter((item) => item.playerId !== player.id);
      room.drawings.push({
        playerId: player.id,
        name: player.name,
        prompt: player.prompt,
        drawing,
        submittedAt: Date.now()
      });
      if (room.drawings.length >= room.players.length) {
        room.stage = "gallery";
        room.roundEndsAt = 0;
      }
      json(res, 200, { room: publicRoom(room, player.id) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/gallery$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      const body = await readBody(req);
      if (!requireAdmin(room, body, res)) return;
      room.stage = "gallery";
      room.roundEndsAt = 0;
      json(res, 200, { room: publicRoom(room, room.adminId) });
      publish(room);
      return;
    }

    if (req.method === "GET" && url.pathname.match(/^\/api\/rooms\/[^/]+\/events$/)) {
      const room = getRoom(parts[3]);
      if (!room) {
        res.writeHead(404);
        res.end();
        return;
      }
      const clientId = url.searchParams.get("client") || "";
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "Connection": "keep-alive"
      });
      res.write(`data: ${JSON.stringify(publicRoom(room, clientId))}\n\n`);
      const client = { clientId, res };
      room.events.add(client);
      req.on("close", () => room.events.delete(client));
      return;
    }
  } catch (error) {
    json(res, 400, { error: error.message });
    return;
  }

  json(res, 404, { error: "없는 주소예요." });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = path.normalize(path.join(publicDir, requested));
  const fallback = path.join(publicDir, "index.html");
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (error, data) => {
    const finalPath = error ? fallback : filePath;
    fs.readFile(finalPath, (fallbackError, fallbackData) => {
      if (fallbackError) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(finalPath);
      const type = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html";
      res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
      res.end(error ? fallbackData : data);
    });
  });
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.stage === "writing" && room.roundEndsAt && Date.now() > room.roundEndsAt) {
      startDrawing(room);
      publish(room);
    }
    if (room.stage === "drawing" && room.roundEndsAt && Date.now() > room.roundEndsAt) {
      room.stage = "gallery";
      room.roundEndsAt = 0;
      publish(room);
    }
  }
}, 1000);

http.createServer((req, res) => {
  if (req.url === "/healthz") json(res, 200, { ok: true });
  else if (req.url.startsWith("/api/")) handleApi(req, res);
  else serveStatic(req, res);
}).listen(port, () => {
  console.log(`Garlic Phone is running at http://localhost:${port}`);
});

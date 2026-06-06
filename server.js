const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const rooms = new Map();
const modes = new Set(["normal", "knockoff", "animation", "custom"]);
const timeModes = new Set(["fast", "normal", "slow", "regressive", "progressive", "dynamic", "infinite", "host", "fasterFirst", "slowerFirst"]);
const turnModes = new Set(["few", "most", "all", "allPlusOne", "double", "triple", "single", "2", "3", "4", "5", "6", "7", "8"]);

function id(size = 8, mixed = false) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const alphabet = `${letters}${numbers}`;
  let value = "";
  do {
    value = Array.from(crypto.randomBytes(size), (byte) => alphabet[byte % alphabet.length]).join("");
  } while (mixed && (!/[A-Z]/.test(value) || !/[0-9]/.test(value)));
  return value;
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

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function timeSeconds(timeMode) {
  if (timeMode === "fast") return { writeSeconds: 30, drawSeconds: 30 };
  if (timeMode === "slow") return { writeSeconds: 60, drawSeconds: 60 };
  if (timeMode === "infinite") return { writeSeconds: 300, drawSeconds: 300 };
  return { writeSeconds: 40, drawSeconds: 40 };
}

function makeSettings(settings = {}) {
  const timeMode = timeModes.has(settings.timeMode) ? settings.timeMode : "normal";
  const seconds = timeSeconds(timeMode);
  return {
    maxPlayers: clamp(settings.maxPlayers, 2, 30, 14),
    timeMode,
    writeSeconds: seconds.writeSeconds,
    drawSeconds: seconds.drawSeconds,
    turns: turnModes.has(settings.turns) ? settings.turns : "all",
    keepDrawing: Boolean(settings.keepDrawing),
    secrecy: settings.secrecy === "private" ? "private" : "public",
    sound: settings.sound === false ? false : true
  };
}

function makeRoom(hostName, settings) {
  const roomCode = id(6, true);
  const hostId = id(12);
  const mode = modes.has(settings?.mode) ? settings.mode : "normal";
  const room = {
    code: roomCode,
    hostId,
    settings: makeSettings(settings),
    mode,
    stage: "lobby",
    nextStage: "",
    countdownEndsAt: 0,
    roundEndsAt: 0,
    players: [{ id: hostId, name: hostName, avatar: clamp(settings?.avatar, 0, 9, 0), joinedAt: Date.now(), prompt: "", promptAuthorId: "", promptAuthorName: "" }],
    writings: [],
    drawings: [],
    events: new Set()
  };
  rooms.set(roomCode, room);
  return { room, playerId: hostId };
}

function getRoom(code) {
  return rooms.get(String(code || "").trim().toUpperCase());
}

function publicRoom(room, clientId = "") {
  const player = room.players.find((item) => item.id === clientId);
  return {
    code: room.code,
    hostId: room.hostId,
    settings: room.settings,
    mode: room.mode,
    stage: room.stage,
    nextStage: room.nextStage,
    countdownEndsAt: room.countdownEndsAt,
    roundEndsAt: room.roundEndsAt,
    players: room.players.map(({ id, name, avatar }) => ({ id, name, avatar })),
    writingCount: room.writings.length,
    drawingCount: room.drawings.length,
    gallery: room.stage === "gallery" ? room.drawings : [],
    albums: room.stage === "gallery" ? makeAlbums(room) : [],
    myWriting: room.writings.find((item) => item.playerId === clientId)?.text || "",
    myDrawing: room.drawings.find((item) => item.playerId === clientId)?.drawing || "",
    assignedPrompt: player?.prompt || ""
  };
}

function makeAlbums(room) {
  const albumMap = new Map();
  for (const writing of room.writings) {
    albumMap.set(writing.playerId, {
      authorId: writing.playerId,
      authorName: writing.name,
      authorAvatar: writing.avatar,
      prompt: writing.text,
      drawings: []
    });
  }
  for (const drawing of room.drawings) {
    const authorId = drawing.promptAuthorId || drawing.playerId;
    if (!albumMap.has(authorId)) {
      albumMap.set(authorId, {
        authorId,
        authorName: drawing.promptAuthorName || drawing.name,
        authorAvatar: drawing.promptAuthorAvatar ?? drawing.avatar,
        prompt: drawing.prompt || "",
        drawings: []
      });
    }
    albumMap.get(authorId).drawings.push(drawing);
  }
  return [...albumMap.values()];
}

function publish(room) {
  for (const client of room.events) {
    client.res.write(`data: ${JSON.stringify(publicRoom(room, client.clientId))}\n\n`);
  }
}

function requireHost(room, body, res) {
  if (body.playerId !== room.hostId) {
    json(res, 403, { error: "방장만 할 수 있어요." });
    return false;
  }
  return true;
}

function assignPrompts(room) {
  const writings = room.writings.filter((item) => item.text);
  room.players.forEach((player, index) => {
    const writing = writings[index % writings.length];
    player.prompt = writing ? writing.text : "상상 속 장면";
    player.promptAuthorId = writing ? writing.playerId : "";
    player.promptAuthorName = writing ? writing.name : "";
  });
}

function startCountdown(room, nextStage) {
  room.stage = "countdown";
  room.nextStage = nextStage;
  room.countdownEndsAt = Date.now() + 3000;
  room.roundEndsAt = 0;
}

function startWriting(room) {
  room.stage = "writing";
  room.nextStage = "";
  room.countdownEndsAt = 0;
  room.roundEndsAt = Date.now() + room.settings.writeSeconds * 1000;
  room.writings = [];
  room.drawings = [];
  room.players.forEach((player) => {
    player.prompt = "";
    player.promptAuthorId = "";
    player.promptAuthorName = "";
  });
}

function startDrawing(room) {
  assignPrompts(room);
  room.stage = "drawing";
  room.nextStage = "";
  room.countdownEndsAt = 0;
  room.roundEndsAt = Date.now() + room.settings.drawSeconds * 1000;
  room.drawings = [];
}

function recommendedPrompt(playerName = "") {
  const prompts = [
    "웃고 있는 마늘 캐릭터",
    "운동장에서 춤추는 고추",
    "칠판 앞에 선 브로콜리 선생님",
    "비 오는 날 우산을 든 당근",
    "소풍 가는 토마토 친구",
    "달빛 아래 노래하는 가지",
    "책을 읽는 감자 탐험가",
    "파도가 치는 바다의 오이 배",
    "호박 마차를 탄 채소 왕",
    `${playerName || "친구"}를 놀라게 한 양파`
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/");

  try {
    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readBody(req);
      const name = String(body.name || "플레이어").trim().slice(0, 18) || "플레이어";
      const { room, playerId } = makeRoom(name, { ...body.settings, mode: body.mode, avatar: body.avatar });
      json(res, 200, { playerId, room: publicRoom(room, playerId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/join$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      if (room.players.length >= room.settings.maxPlayers) return json(res, 403, { error: "이 방은 가득 찼어요." });
      if (room.stage !== "lobby") return json(res, 403, { error: "이미 게임이 시작된 방이에요." });
      const body = await readBody(req);
      const name = String(body.name || "플레이어").trim().slice(0, 18) || "플레이어";
      const playerId = id(12);
      room.players.push({ id: playerId, name, avatar: clamp(body.avatar, 0, 9, room.players.length % 10), joinedAt: Date.now(), prompt: "", promptAuthorId: "", promptAuthorName: "" });
      json(res, 200, { playerId, room: publicRoom(room, playerId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/settings$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      const body = await readBody(req);
      if (!requireHost(room, body, res)) return;
      if (room.stage !== "lobby") return json(res, 400, { error: "시작 전 대기실에서만 설정할 수 있어요." });
      if (modes.has(body.mode)) room.mode = body.mode;
      const next = makeSettings({ ...room.settings, ...body.settings });
      next.maxPlayers = Math.max(room.players.length, next.maxPlayers);
      room.settings = next;
      json(res, 200, { room: publicRoom(room, body.playerId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/start$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      const body = await readBody(req);
      if (!requireHost(room, body, res)) return;
      if (room.players.length < 1) return json(res, 400, { error: "참가자가 들어온 뒤 시작할 수 있어요." });
      startCountdown(room, "writing");
      json(res, 200, { room: publicRoom(room, body.playerId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/start-drawing$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      const body = await readBody(req);
      if (!requireHost(room, body, res)) return;
      startDrawing(room);
      json(res, 200, { room: publicRoom(room, body.playerId) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/force-writing$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      const body = await readBody(req);
      if (!requireHost(room, body, res)) return;
      if (room.stage !== "drawing") return json(res, 400, { error: "그림 그리는 중에만 글쓰기로 바꿀 수 있어요." });
      startCountdown(room, "writing");
      json(res, 200, { room: publicRoom(room, body.playerId) });
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
      const text = (String(body.text || "").trim() || recommendedPrompt(player.name)).slice(0, 100);
      room.writings = room.writings.filter((item) => item.playerId !== player.id);
      room.writings.push({ playerId: player.id, name: player.name, avatar: player.avatar, text, submittedAt: Date.now() });
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
        promptAuthorId: player.promptAuthorId,
        promptAuthorName: player.promptAuthorName,
        promptAuthorAvatar: room.players.find((item) => item.id === player.promptAuthorId)?.avatar ?? player.avatar,
        avatar: player.avatar,
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
      if (!requireHost(room, body, res)) return;
      room.stage = "gallery";
      room.roundEndsAt = 0;
      json(res, 200, { room: publicRoom(room, body.playerId) });
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
    if (room.stage === "countdown" && room.countdownEndsAt && Date.now() > room.countdownEndsAt) {
      if (room.nextStage === "drawing") startDrawing(room);
      else startWriting(room);
      publish(room);
    }
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

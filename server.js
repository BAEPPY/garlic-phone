const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const rooms = new Map();
const badWordsPath = path.join(publicDir, "bad-words.json");
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

const blockedWords = [
  "씨발", "시발", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "개새끼", "새끼", "꺼져", "죽어",
  "좆", "존나", "미친", "등신", "멍청이", "바보새끼", "닥쳐", "엿먹어", "지랄",
  "니애미", "느금마", "애미", "애비", "장애", "찐따", "빡대가리", "또라이",
  "fuck", "shit", "bitch", "asshole", "damn", "sex", "porn"
];

try {
  const externalBlockedWords = JSON.parse(fs.readFileSync(badWordsPath, "utf8").replace(/^\uFEFF/, ""));
  if (Array.isArray(externalBlockedWords)) {
    blockedWords.push(...externalBlockedWords.filter((word) => typeof word === "string"));
  }
} catch {
  console.warn("bad-words.json을 읽지 못해서 기본 금지어만 사용합니다.");
}

function normalizeForFilter(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[0-9０-９]/g, "")
    .replace(/[\s._\-~!@#$%^&*()[\]{}+=|\\:;"'<>,.?/`·ㆍ…ㄱ-ㅎㅏ-ㅣ]/g, "");
}

const normalizedBlockedWords = [...new Set(blockedWords.map(normalizeForFilter).filter(Boolean))];

function hasBlockedWord(value) {
  const normalized = normalizeForFilter(value);
  return Boolean(normalized) && normalizedBlockedWords.some((word) => normalized.includes(word));
}

function cleanUserText(value, fallback, maxLength) {
  const text = String(value || "").trim().slice(0, maxLength) || fallback;
  if (hasBlockedWord(text)) {
    const error = new Error("욕설이나 비하 표현은 사용할 수 없어요.");
    error.code = "BLOCKED_WORD";
    throw error;
  }
  return text;
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
    resetOnCountdown: false,
    countdownEndsAt: 0,
    roundEndsAt: 0,
    turnIndex: 0,
    totalTurns: 0,
    entries: [],
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
  const current = currentEntries(room);
  const previous = player ? previousEntryForPlayer(room, player) : null;
  const currentPlayerEntry = current.find((item) => item.playerId === clientId);
  return {
    code: room.code,
    hostId: room.hostId,
    settings: room.settings,
    mode: room.mode,
    stage: room.stage,
    nextStage: room.nextStage,
    countdownEndsAt: room.countdownEndsAt,
    roundEndsAt: room.roundEndsAt,
    turnIndex: room.turnIndex,
    totalTurns: room.totalTurns,
    players: room.players.map(({ id, name, avatar }) => ({ id, name, avatar })),
    writingCount: room.stage === "writing" ? current.length : room.entries.filter((item) => item.type === "writing").length,
    drawingCount: room.stage === "drawing" ? current.length : room.entries.filter((item) => item.type === "drawing").length,
    gallery: room.stage === "gallery" ? room.entries.filter((item) => item.type === "drawing") : [],
    albums: room.stage === "gallery" ? makeAlbums(room) : [],
    myWriting: room.stage === "writing" ? currentPlayerEntry?.text || "" : "",
    myDrawing: room.stage === "drawing" ? currentPlayerEntry?.drawing || "" : "",
    assignedPrompt: room.stage === "drawing" ? previous?.text || player?.prompt || "" : "",
    assignedDrawing: room.stage === "writing" && room.turnIndex > 0 ? previous?.drawing || "" : ""
  };
}

function makeAlbums(room) {
  return room.players.map((player) => {
    const steps = room.entries
      .filter((entry) => entry.chainId === player.id)
      .sort((a, b) => a.turn - b.turn);
    return {
      authorId: player.id,
      authorName: player.name,
      authorAvatar: player.avatar,
      prompt: steps.find((step) => step.type === "writing")?.text || "",
      drawings: steps.filter((step) => step.type === "drawing"),
      steps
    };
  });
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

function turnCount(room) {
  const players = Math.max(1, room.players.length);
  const turns = room.settings.turns;
  if (/^\d+$/.test(String(turns))) return clamp(turns, 1, Math.max(1, players * 3), players);
  if (turns === "single") return 1;
  if (turns === "few") return Math.max(1, Math.ceil(players / 2));
  if (turns === "most") return Math.max(1, players - 1);
  if (turns === "allPlusOne") return players + 1;
  if (turns === "double") return players * 2;
  if (turns === "triple") return players * 3;
  return players;
}

function turnType(room) {
  return room.turnIndex % 2 === 0 ? "writing" : "drawing";
}

function currentEntries(room) {
  return room.entries.filter((entry) => entry.turn === room.turnIndex);
}

function chainOwnerForPlayer(room, playerId) {
  const index = room.players.findIndex((player) => player.id === playerId);
  if (index < 0) return null;
  const ownerIndex = (index - room.turnIndex + room.players.length * 10) % room.players.length;
  return room.players[ownerIndex] || null;
}

function previousEntryForPlayer(room, player) {
  if (!player || room.turnIndex <= 0) return null;
  const owner = chainOwnerForPlayer(room, player.id);
  if (!owner) return null;
  return room.entries.find((entry) => entry.chainId === owner.id && entry.turn === room.turnIndex - 1) || null;
}

function blankDrawing() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
}

function assignPrompts(room) {
  const writings = currentEntries(room).filter((item) => item.type === "writing" && item.text);
  room.players.forEach((player, index) => {
    const writing = writings[index % writings.length];
    const previous = previousEntryForPlayer(room, player);
    player.prompt = previous?.text || (writing ? writing.text : "상상 속 장면");
    player.promptAuthorId = previous?.playerId || (writing ? writing.playerId : "");
    player.promptAuthorName = previous?.name || (writing ? writing.name : "");
  });
}

function startCountdown(room, nextStage, resetGame = false) {
  room.stage = "countdown";
  room.nextStage = nextStage;
  room.resetOnCountdown = resetGame;
  room.countdownEndsAt = Date.now() + 3000;
  room.roundEndsAt = 0;
}

function startWriting(room, reset = false) {
  if (reset) {
    room.turnIndex = 0;
    room.totalTurns = turnCount(room);
    room.entries = [];
    room.writings = [];
    room.drawings = [];
  }
  room.stage = "writing";
  room.nextStage = "";
  room.countdownEndsAt = 0;
  room.roundEndsAt = Date.now() + room.settings.writeSeconds * 1000;
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
}

function finishGame(room) {
  room.stage = "gallery";
  room.nextStage = "";
  room.countdownEndsAt = 0;
  room.roundEndsAt = 0;
}

function advanceTurn(room) {
  if (room.turnIndex + 1 >= room.totalTurns) {
    finishGame(room);
    return;
  }
  room.turnIndex += 1;
  if (turnType(room) === "drawing") startDrawing(room);
  else startWriting(room);
}

function missingPlayers(room) {
  const submitted = new Set(currentEntries(room).map((entry) => entry.playerId));
  return room.players.filter((player) => !submitted.has(player.id));
}

function addWritingEntry(room, player, text) {
  const owner = room.turnIndex === 0 ? player : chainOwnerForPlayer(room, player.id);
  if (!owner) return;
  room.entries = room.entries.filter((entry) => !(entry.turn === room.turnIndex && entry.playerId === player.id));
  const previous = previousEntryForPlayer(room, player);
  room.entries.push({
    turn: room.turnIndex,
    type: "writing",
    chainId: owner.id,
    playerId: player.id,
    name: player.name,
    avatar: player.avatar,
    text,
    sourceDrawing: previous?.drawing || "",
    submittedAt: Date.now()
  });
}

function addDrawingEntry(room, player, drawing) {
  const owner = chainOwnerForPlayer(room, player.id);
  if (!owner) return;
  const previous = previousEntryForPlayer(room, player);
  room.entries = room.entries.filter((entry) => !(entry.turn === room.turnIndex && entry.playerId === player.id));
  room.entries.push({
    turn: room.turnIndex,
    type: "drawing",
    chainId: owner.id,
    playerId: player.id,
    name: player.name,
    avatar: player.avatar,
    prompt: previous?.text || player.prompt || "상상 속 장면",
    drawing,
    submittedAt: Date.now()
  });
}

function fillMissingWriting(room) {
  for (const player of missingPlayers(room)) {
    addWritingEntry(room, player, recommendedPrompt(player.name));
  }
}

function fillMissingDrawing(room) {
  for (const player of missingPlayers(room)) {
    addDrawingEntry(room, player, blankDrawing());
  }
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
      const name = cleanUserText(body.name, "플레이어", 18);
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
      const name = cleanUserText(body.name, "플레이어", 18);
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
      startCountdown(room, "writing", true);
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
      fillMissingDrawing(room);
      advanceTurn(room);
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
      const text = cleanUserText(body.text, recommendedPrompt(player.name), 100);
      addWritingEntry(room, player, text);
      if (currentEntries(room).length >= room.players.length) advanceTurn(room);
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
      if (!/^data:image\/(png|webp|jpeg);base64,/.test(drawing)) return json(res, 400, { error: "그림 데이터가 필요해요." });
      addDrawingEntry(room, player, drawing);
      if (currentEntries(room).length >= room.players.length) advanceTurn(room);
      json(res, 200, { room: publicRoom(room, player.id) });
      publish(room);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/rooms\/[^/]+\/gallery$/)) {
      const room = getRoom(parts[3]);
      if (!room) return json(res, 404, { error: "방을 찾을 수 없어요." });
      const body = await readBody(req);
      if (!requireHost(room, body, res)) return;
      finishGame(room);
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
      else startWriting(room, room.resetOnCountdown);
      room.resetOnCountdown = false;
      publish(room);
    }
    if (room.stage === "writing" && room.roundEndsAt && Date.now() > room.roundEndsAt) {
      fillMissingWriting(room);
      advanceTurn(room);
      publish(room);
    }
    if (room.stage === "drawing" && room.roundEndsAt && Date.now() > room.roundEndsAt) {
      fillMissingDrawing(room);
      advanceTurn(room);
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

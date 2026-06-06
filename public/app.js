const params = new URLSearchParams(location.search);
const state = {
  mode: params.get("admin") ? "admin" : "player",
  adminId: params.get("admin") || localStorage.getItem("drawingPhoneAdminId") || "",
  playerId: localStorage.getItem("drawingPhonePlayerId") || "",
  roomCode: params.get("room") || "",
  room: null,
  source: null,
  tool: "pencil",
  drawing: false,
  strokes: [],
  currentStroke: null
};

const $ = (selector) => document.querySelector(selector);
const els = {
  views: [...document.querySelectorAll(".view")],
  heroCanvas: $("#heroCanvas"),
  adminRoomCode: $("#adminRoomCode"),
  adminDrawTime: $("#adminDrawTime"),
  adminDrawTimeText: $("#adminDrawTimeText"),
  createRoomButton: $("#createRoomButton"),
  startWritingButton: $("#startWritingButton"),
  startDrawingButton: $("#startDrawingButton"),
  openGalleryButton: $("#openGalleryButton"),
  qrImage: $("#qrImage"),
  qrCanvas: $("#qrCanvas"),
  inviteLink: $("#inviteLink"),
  copyInviteButton: $("#copyInviteButton"),
  adminStageLabel: $("#adminStageLabel"),
  adminStageTitle: $("#adminStageTitle"),
  adminTimer: $("#adminTimer"),
  adminPlayerCount: $("#adminPlayerCount"),
  adminWritingCount: $("#adminWritingCount"),
  adminDrawingCount: $("#adminDrawingCount"),
  adminPlayers: $("#adminPlayers"),
  adminGallery: $("#adminGallery"),
  joinRoomCode: $("#joinRoomCode"),
  playerName: $("#playerName"),
  joinCode: $("#joinCode"),
  joinButton: $("#joinButton"),
  joinStatus: $("#joinStatus"),
  waitPlayerCount: $("#waitPlayerCount"),
  waitPlayers: $("#waitPlayers"),
  writeTimer: $("#writeTimer"),
  writingInput: $("#writingInput"),
  submitWritingButton: $("#submitWritingButton"),
  writingStatus: $("#writingStatus"),
  drawingPrompt: $("#drawingPrompt"),
  drawTimer: $("#drawTimer"),
  drawCanvas: $("#drawCanvas"),
  colorInput: $("#colorInput"),
  sizeInput: $("#sizeInput"),
  toolButtons: [...document.querySelectorAll(".tool")],
  undoButton: $("#undoButton"),
  clearButton: $("#clearButton"),
  submitDrawingButton: $("#submitDrawingButton"),
  drawingStatus: $("#drawingStatus"),
  playerGallery: $("#playerGallery")
};

const ctx = els.drawCanvas.getContext("2d");
ctx.lineCap = "round";
ctx.lineJoin = "round";
paintBackground("#ffffff");

els.qrImage.addEventListener("error", () => {
  els.qrCanvas.classList.add("active");
});

els.qrImage.addEventListener("load", () => {
  els.qrCanvas.classList.remove("active");
});

function secondsLabel(value) {
  return `${value}초`;
}

function showView(id) {
  els.views.forEach((view) => view.classList.toggle("active", view.id === id));
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "요청에 실패했어요.");
  return data;
}

function connectEvents() {
  if (!state.roomCode) return;
  if (state.source) state.source.close();
  const client = state.mode === "admin" ? state.adminId : state.playerId;
  state.source = new EventSource(`/api/rooms/${state.roomCode}/events?client=${encodeURIComponent(client)}`);
  state.source.onmessage = (event) => {
    state.room = JSON.parse(event.data);
    render();
  };
  state.source.onerror = () => {
    if (!state.room) setPlayerStatus("방 정보를 불러오지 못했어요.");
  };
}

function setAdmin(room, adminId) {
  state.mode = "admin";
  state.adminId = adminId;
  state.roomCode = room.code;
  state.room = room;
  localStorage.setItem("drawingPhoneAdminId", adminId);
  history.replaceState(null, "", `/?room=${room.code}&admin=${adminId}`);
  connectEvents();
  render();
}

function setPlayer(room, playerId) {
  state.mode = "player";
  state.playerId = playerId;
  state.roomCode = room.code;
  state.room = room;
  localStorage.setItem("drawingPhonePlayerId", playerId);
  history.replaceState(null, "", `/?room=${room.code}`);
  connectEvents();
  render();
}

function render() {
  if (state.mode === "admin") renderAdmin();
  else renderPlayer();
}

function renderAdmin() {
  showView("adminView");
  const room = state.room;
  els.adminRoomCode.textContent = room?.code || "새 방";
  els.startWritingButton.disabled = !room || room.stage !== "lobby" || room.players.length < 1;
  els.startDrawingButton.disabled = !room || room.stage !== "writing";
  els.openGalleryButton.disabled = !room || room.stage === "lobby";
  els.copyInviteButton.disabled = !room;
  els.inviteLink.value = room ? inviteUrl(room.code) : "";
  els.adminDrawTime.disabled = !room || room.stage !== "lobby";

  if (!room) {
    drawQr("");
    els.qrImage.removeAttribute("src");
    els.qrCanvas.classList.add("active");
    return;
  }

  els.adminDrawTime.value = room.drawSeconds;
  els.adminDrawTimeText.textContent = secondsLabel(room.drawSeconds);
  els.adminStageLabel.textContent = stageName(room.stage);
  els.adminStageTitle.textContent = adminTitle(room);
  els.adminPlayerCount.textContent = `${room.players.length}/30`;
  els.adminWritingCount.textContent = `${room.writingCount}/${room.players.length}`;
  els.adminDrawingCount.textContent = `${room.drawingCount}/${room.players.length}`;
  renderPlayers(els.adminPlayers, room.players);
  renderGallery(els.adminGallery, room.gallery);
  els.qrCanvas.classList.remove("active");
  els.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(inviteUrl(room.code))}`;
  drawQr(inviteUrl(room.code));
}

function renderPlayer() {
  const room = state.room;
  if (!room || !state.playerId) {
    showView("joinView");
    els.joinRoomCode.textContent = state.roomCode || "방 코드";
    els.joinCode.value = state.roomCode;
    return;
  }

  if (room.stage === "lobby") {
    showView("waitView");
    els.waitPlayerCount.textContent = `${room.players.length}/30`;
    renderPlayers(els.waitPlayers, room.players);
  }

  if (room.stage === "writing") {
    showView("writeView");
    els.submitWritingButton.disabled = Boolean(room.myWriting);
    els.writingInput.disabled = Boolean(room.myWriting);
    if (room.myWriting) {
      els.writingInput.value = room.myWriting;
      els.writingStatus.textContent = "제출했어요. 다른 사람들을 기다리는 중이에요.";
    }
  }

  if (room.stage === "drawing") {
    showView("drawView");
    els.drawingPrompt.textContent = room.assignedPrompt || "상상 속 장면";
    els.submitDrawingButton.disabled = Boolean(room.myDrawing);
    els.drawingStatus.textContent = room.myDrawing ? "제출했어요. 결과를 기다리는 중이에요." : "";
  }

  if (room.stage === "gallery") {
    showView("galleryView");
    renderGallery(els.playerGallery, room.gallery);
  }
}

function stageName(stage) {
  return ({ lobby: "대기실", writing: "글쓰기", drawing: "그리기", gallery: "결과" })[stage] || "대기실";
}

function adminTitle(room) {
  if (room.stage === "lobby") return "참가자가 들어오면 게임을 시작할 수 있어요.";
  if (room.stage === "writing") return "참가자들이 문장을 쓰는 중이에요.";
  if (room.stage === "drawing") return "참가자들이 받은 문장을 그리고 있어요.";
  return "제출된 그림을 함께 확인하세요.";
}

function renderPlayers(target, players) {
  target.innerHTML = "";
  if (!players.length) {
    target.innerHTML = `<div class="player">아직 참가자가 없어요.</div>`;
    return;
  }
  players.forEach((player, index) => {
    const item = document.createElement("div");
    item.className = "player";
    item.innerHTML = `<span>${escapeHtml(player.name)}</span><small>${index + 1}</small>`;
    target.append(item);
  });
}

function renderGallery(target, gallery) {
  target.innerHTML = "";
  gallery.forEach((item) => {
    const card = document.createElement("article");
    card.className = "gallery-card";
    card.innerHTML = `
      <img src="${item.drawing}" alt="${escapeHtml(item.name)}의 그림" />
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.prompt || "")}</span>
      </div>
    `;
    target.append(card);
  });
}

function setPlayerStatus(message) {
  els.joinStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function inviteUrl(code) {
  return `${location.origin}/?room=${code}`;
}

function drawQr(text) {
  const canvas = els.qrCanvas;
  const qr = canvas.getContext("2d");
  qr.fillStyle = "#ffffff";
  qr.fillRect(0, 0, canvas.width, canvas.height);
  if (!text) {
    qr.fillStyle = "#64748b";
    qr.font = "700 16px sans-serif";
    qr.textAlign = "center";
    qr.fillText("방을 만들면", 110, 103);
    qr.fillText("QR이 생겨요", 110, 126);
    return;
  }

  const grid = 29;
  const pad = 14;
  const cell = Math.floor((canvas.width - pad * 2) / grid);
  const bits = hashBits(text, grid * grid);
  qr.fillStyle = "#111827";
  drawFinder(qr, pad, pad, cell);
  drawFinder(qr, pad + cell * 22, pad, cell);
  drawFinder(qr, pad, pad + cell * 22, cell);
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      if (inFinder(x, y)) continue;
      if (bits[y * grid + x]) qr.fillRect(pad + x * cell, pad + y * cell, cell, cell);
    }
  }
}

function hashBits(text, length) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return Array.from({ length }, (_, index) => {
    seed = Math.imul(seed ^ (index + 31), 16777619);
    return (seed >>> 27) & 1;
  });
}

function drawFinder(qr, x, y, cell) {
  qr.fillRect(x, y, cell * 7, cell * 7);
  qr.fillStyle = "#ffffff";
  qr.fillRect(x + cell, y + cell, cell * 5, cell * 5);
  qr.fillStyle = "#111827";
  qr.fillRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3);
}

function inFinder(x, y) {
  return (x < 8 && y < 8) || (x > 20 && y < 8) || (x < 8 && y > 20);
}

function paintBackground(color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, els.drawCanvas.width, els.drawCanvas.height);
}

function pointerPoint(event) {
  const rect = els.drawCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * els.drawCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * els.drawCanvas.height
  };
}

function drawStroke(stroke) {
  if (stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
}

function redraw() {
  paintBackground("#ffffff");
  state.strokes.forEach((stroke) => {
    if (stroke.tool === "bucket") paintBackground(stroke.color);
    else drawStroke(stroke);
  });
}

function canDraw() {
  return state.room?.stage === "drawing" && !state.room.myDrawing;
}

els.createRoomButton.addEventListener("click", async () => {
  try {
    const data = await api("/api/rooms", { drawSeconds: Number(els.adminDrawTime.value) });
    setAdmin(data.room, data.adminId);
  } catch (error) {
    els.adminStageTitle.textContent = error.message;
  }
});

els.adminDrawTime.addEventListener("input", async () => {
  els.adminDrawTimeText.textContent = secondsLabel(els.adminDrawTime.value);
  if (!state.room) return;
  try {
    await api(`/api/rooms/${state.room.code}/settings`, {
      adminId: state.adminId,
      drawSeconds: Number(els.adminDrawTime.value)
    });
  } catch (error) {
    els.adminStageTitle.textContent = error.message;
  }
});

els.startWritingButton.addEventListener("click", async () => {
  try {
    await api(`/api/rooms/${state.room.code}/start-writing`, { adminId: state.adminId });
  } catch (error) {
    els.adminStageTitle.textContent = error.message;
  }
});

els.startDrawingButton.addEventListener("click", async () => {
  try {
    await api(`/api/rooms/${state.room.code}/start-drawing`, { adminId: state.adminId });
  } catch (error) {
    els.adminStageTitle.textContent = error.message;
  }
});

els.openGalleryButton.addEventListener("click", async () => {
  try {
    await api(`/api/rooms/${state.room.code}/gallery`, { adminId: state.adminId });
  } catch (error) {
    els.adminStageTitle.textContent = error.message;
  }
});

els.copyInviteButton.addEventListener("click", async () => {
  if (!state.room) return;
  await navigator.clipboard.writeText(inviteUrl(state.room.code));
  els.adminStageTitle.textContent = "초대 링크를 복사했어요.";
});

els.joinButton.addEventListener("click", async () => {
  try {
    const code = (els.joinCode.value || state.roomCode).trim().toUpperCase();
    const data = await api(`/api/rooms/${code}/join`, { name: els.playerName.value });
    setPlayer(data.room, data.playerId);
  } catch (error) {
    setPlayerStatus(error.message);
  }
});

els.submitWritingButton.addEventListener("click", async () => {
  try {
    const data = await api(`/api/rooms/${state.room.code}/submit-writing`, {
      playerId: state.playerId,
      text: els.writingInput.value
    });
    state.room = data.room;
    render();
  } catch (error) {
    els.writingStatus.textContent = error.message;
  }
});

els.toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    els.toolButtons.forEach((item) => item.classList.toggle("active", item === button));
  });
});

els.drawCanvas.addEventListener("pointerdown", (event) => {
  if (!canDraw()) return;
  if (state.tool === "bucket") {
    state.strokes.push({ tool: "bucket", color: els.colorInput.value });
    redraw();
    return;
  }
  state.drawing = true;
  state.currentStroke = {
    tool: state.tool,
    color: els.colorInput.value,
    size: Number(els.sizeInput.value),
    points: [pointerPoint(event)]
  };
  els.drawCanvas.setPointerCapture(event.pointerId);
});

els.drawCanvas.addEventListener("pointermove", (event) => {
  if (!state.drawing || !state.currentStroke) return;
  state.currentStroke.points.push(pointerPoint(event));
  redraw();
  drawStroke(state.currentStroke);
});

els.drawCanvas.addEventListener("pointerup", () => {
  if (!state.currentStroke) return;
  state.strokes.push(state.currentStroke);
  state.currentStroke = null;
  state.drawing = false;
});

els.undoButton.addEventListener("click", () => {
  state.strokes.pop();
  redraw();
});

els.clearButton.addEventListener("click", () => {
  state.strokes = [];
  redraw();
});

els.submitDrawingButton.addEventListener("click", async () => {
  try {
    const data = await api(`/api/rooms/${state.room.code}/submit-drawing`, {
      playerId: state.playerId,
      drawing: els.drawCanvas.toDataURL("image/png")
    });
    state.room = data.room;
    render();
  } catch (error) {
    els.drawingStatus.textContent = error.message;
  }
});

setInterval(() => {
  const remaining = state.room?.roundEndsAt ? Math.max(0, Math.ceil((state.room.roundEndsAt - Date.now()) / 1000)) : null;
  const text = remaining === null ? "--:--" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  els.adminTimer.textContent = text;
  els.writeTimer.textContent = text;
  els.drawTimer.textContent = text;
}, 250);

function drawHero() {
  const canvas = els.heroCanvas;
  const hero = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  hero.scale(ratio, ratio);
  hero.fillStyle = "#111827";
  hero.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  const colors = ["#67e8f9", "#fbbf24", "#f472b6", "#a7f3d0", "#f8fafc"];
  for (let i = 0; i < 42; i += 1) {
    const x = 80 + i * 44;
    const y = 35 + ((i * 31) % 180);
    hero.strokeStyle = colors[i % colors.length];
    hero.lineWidth = 3 + (i % 5);
    hero.beginPath();
    hero.moveTo(x, y);
    hero.bezierCurveTo(x + 30, y - 45, x + 90, y + 60, x + 128, y + 4);
    hero.stroke();
  }
}

drawHero();
window.addEventListener("resize", drawHero);

if (state.mode === "admin" && state.roomCode && state.adminId) {
  connectEvents();
  renderAdmin();
} else if (state.roomCode) {
  showView("joinView");
  els.joinCode.value = state.roomCode;
  els.joinRoomCode.textContent = state.roomCode;
} else {
  showView("adminView");
  drawQr("");
}

const params = new URLSearchParams(location.search);
const savedPlayerId = localStorage.getItem("garlicPhonePlayerId") || "";
const state = {
  playerId: savedPlayerId,
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
  screens: [...document.querySelectorAll(".screen")],
  homeView: $("#homeView"),
  lobbyView: $("#lobbyView"),
  playerName: $("#playerName"),
  joinCode: $("#joinCode"),
  roomCodeField: $("#roomCodeField"),
  enterButton: $("#enterButton"),
  randomNameButton: $("#randomNameButton"),
  homeStatus: $("#homeStatus"),
  leaveLobbyButton: $("#leaveLobbyButton"),
  playerCount: $("#playerCount"),
  maxPlayersSelect: $("#maxPlayersSelect"),
  playerList: $("#playerList"),
  timePresetSelect: $("#timePresetSelect"),
  turnsSelect: $("#turnsSelect"),
  keepDrawingSelect: $("#keepDrawingSelect"),
  scoreboardToggle: $("#scoreboardToggle"),
  secrecySelect: $("#secrecySelect"),
  copyInviteButton: $("#copyInviteButton"),
  qrButton: $("#qrButton"),
  startGameButton: $("#startGameButton"),
  inviteDialog: $("#inviteDialog"),
  closeInviteButton: $("#closeInviteButton"),
  qrImage: $("#qrImage"),
  qrCanvas: $("#qrCanvas"),
  inviteLink: $("#inviteLink"),
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
  gallery: $("#gallery")
};

const ctx = els.drawCanvas.getContext("2d");
ctx.lineCap = "round";
ctx.lineJoin = "round";
paintBackground("#ffffff");

const names = ["마늘선생님", "칠판요정", "분필장인", "급식히어로", "교실탐험가", "숙제박사"];

function showScreen(id) {
  els.screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
}

function settingFromControls() {
  const time = els.timePresetSelect.value;
  const timeMap = {
    quick: { writeSeconds: 45, drawSeconds: 60 },
    normal: { writeSeconds: 75, drawSeconds: 90 },
    slow: { writeSeconds: 120, drawSeconds: 150 }
  };
  return {
    maxPlayers: Number(els.maxPlayersSelect.value),
    ...timeMap[time],
    turns: els.turnsSelect.value,
    keepDrawing: els.keepDrawingSelect.value === "enabled",
    scoreboard: els.scoreboardToggle.checked,
    secrecy: els.secrecySelect.value
  };
}

function controlsFromSettings(settings) {
  if (!settings) return;
  els.maxPlayersSelect.value = String(settings.maxPlayers);
  if (settings.writeSeconds <= 45) els.timePresetSelect.value = "quick";
  else if (settings.writeSeconds >= 120) els.timePresetSelect.value = "slow";
  else els.timePresetSelect.value = "normal";
  els.turnsSelect.value = settings.turns;
  els.keepDrawingSelect.value = settings.keepDrawing ? "enabled" : "disabled";
  els.scoreboardToggle.checked = Boolean(settings.scoreboard);
  els.secrecySelect.value = settings.secrecy;
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
  if (!state.roomCode || !state.playerId) return;
  if (state.source) state.source.close();
  state.source = new EventSource(`/api/rooms/${state.roomCode}/events?client=${encodeURIComponent(state.playerId)}`);
  state.source.onmessage = (event) => {
    state.room = JSON.parse(event.data);
    render();
  };
  state.source.onerror = () => {
    if (!state.room) setStatus("방 정보를 불러오지 못했어요.");
  };
}

function enterRoom(room, playerId) {
  state.playerId = playerId;
  state.roomCode = room.code;
  state.room = room;
  localStorage.setItem("garlicPhonePlayerId", playerId);
  history.replaceState(null, "", `/?room=${room.code}`);
  connectEvents();
  render();
}

function render() {
  if (!state.room || !state.playerId) {
    showScreen("homeView");
    els.roomCodeField.classList.toggle("hidden", !state.roomCode);
    els.joinCode.value = state.roomCode;
    return;
  }

  if (state.room.stage === "lobby") renderLobby();
  if (state.room.stage === "writing") renderWriting();
  if (state.room.stage === "drawing") renderDrawing();
  if (state.room.stage === "gallery") renderGalleryScreen();
}

function renderLobby() {
  showScreen("lobbyView");
  const room = state.room;
  const isHost = room.hostId === state.playerId;
  controlsFromSettings(room.settings);
  els.playerCount.textContent = `${room.players.length}/${room.settings.maxPlayers}`;
  renderPlayers(room.players, room.settings.maxPlayers, room.hostId);
  setControlsDisabled(!isHost);
  els.startGameButton.disabled = !isHost || room.players.length < 1;
  els.inviteLink.value = inviteUrl(room.code);
  setQr(inviteUrl(room.code));
}

function renderWriting() {
  showScreen("writeView");
  els.submitWritingButton.disabled = Boolean(state.room.myWriting);
  els.writingInput.disabled = Boolean(state.room.myWriting);
  if (state.room.myWriting) {
    els.writingInput.value = state.room.myWriting;
    els.writingStatus.textContent = "제출했어요. 다른 사람들을 기다리는 중이에요.";
  } else {
    els.writingStatus.textContent = "100자 안으로 입력할 수 있어요.";
  }
}

function renderDrawing() {
  showScreen("drawView");
  els.drawingPrompt.textContent = state.room.assignedPrompt || "상상 속 장면";
  els.submitDrawingButton.disabled = Boolean(state.room.myDrawing);
  els.drawingStatus.textContent = state.room.myDrawing ? "제출했어요. 결과를 기다리는 중이에요." : "";
}

function renderGalleryScreen() {
  showScreen("galleryView");
  els.gallery.innerHTML = "";
  state.room.gallery.forEach((item) => {
    const card = document.createElement("article");
    card.className = "gallery-card";
    card.innerHTML = `
      <img src="${item.drawing}" alt="${escapeHtml(item.name)}의 그림" />
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.prompt || "")}</span>
      </div>
    `;
    els.gallery.append(card);
  });
}

function setControlsDisabled(disabled) {
  [
    els.maxPlayersSelect,
    els.timePresetSelect,
    els.turnsSelect,
    els.keepDrawingSelect,
    els.scoreboardToggle,
    els.secrecySelect
  ].forEach((control) => {
    control.disabled = disabled;
  });
}

function renderPlayers(players, maxPlayers, hostId) {
  els.playerList.innerHTML = "";
  for (let i = 0; i < maxPlayers; i += 1) {
    const player = players[i];
    const row = document.createElement("div");
    row.className = `player-row${player ? "" : " empty"}`;
    row.innerHTML = player
      ? `<span class="player-icon">🧄</span><span>${escapeHtml(player.name)}</span><span>${player.id === hostId ? "👑" : ""}</span>`
      : `<span class="player-icon">☺</span><span>EMPTY</span><span></span>`;
    els.playerList.append(row);
  }
}

function setStatus(message) {
  els.homeStatus.textContent = message;
}

function inviteUrl(code) {
  return `${location.origin}/?room=${code}`;
}

function setQr(url) {
  els.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
  drawQrFallback(url);
}

function drawQrFallback(text) {
  const canvas = els.qrCanvas;
  const qr = canvas.getContext("2d");
  qr.fillStyle = "#ffffff";
  qr.fillRect(0, 0, canvas.width, canvas.height);
  qr.fillStyle = "#32156b";
  qr.font = "800 15px sans-serif";
  qr.textAlign = "center";
  qr.fillText("QR을 불러오지 못하면", 110, 102);
  qr.fillText("링크를 복사해 주세요", 110, 126);
  if (!text) return;
  let seed = 0;
  for (const char of text) seed = (seed + char.charCodeAt(0) * 17) % 9973;
  for (let y = 0; y < 17; y += 1) {
    for (let x = 0; x < 17; x += 1) {
      seed = (seed * 37 + x + y) % 9973;
      if (seed % 3 === 0) qr.fillRect(18 + x * 8, 18 + y * 8, 8, 8);
    }
  }
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

async function saveSettings() {
  if (!state.room || state.room.hostId !== state.playerId) return;
  try {
    await api(`/api/rooms/${state.room.code}/settings`, {
      playerId: state.playerId,
      settings: settingFromControls()
    });
  } catch (error) {
    setStatus(error.message);
  }
}

els.randomNameButton.addEventListener("click", () => {
  els.playerName.value = names[Math.floor(Math.random() * names.length)];
});

els.enterButton.addEventListener("click", async () => {
  try {
    const name = els.playerName.value.trim();
    if (!name) {
      setStatus("닉네임을 먼저 입력해 주세요.");
      return;
    }
    const code = (els.joinCode.value || state.roomCode).trim().toUpperCase();
    const data = code
      ? await api(`/api/rooms/${code}/join`, { name })
      : await api("/api/rooms", { name, settings: settingFromControls() });
    enterRoom(data.room, data.playerId);
  } catch (error) {
    setStatus(error.message);
  }
});

els.leaveLobbyButton.addEventListener("click", () => {
  localStorage.removeItem("garlicPhonePlayerId");
  location.href = "/";
});

[
  els.maxPlayersSelect,
  els.timePresetSelect,
  els.turnsSelect,
  els.keepDrawingSelect,
  els.scoreboardToggle,
  els.secrecySelect
].forEach((control) => {
  control.addEventListener("change", saveSettings);
});

els.copyInviteButton.addEventListener("click", async () => {
  if (!state.room) return;
  await navigator.clipboard.writeText(inviteUrl(state.room.code));
  els.copyInviteButton.textContent = "복사됨";
  window.setTimeout(() => {
    els.copyInviteButton.textContent = "🔗 초대";
  }, 1200);
});

els.qrButton.addEventListener("click", () => {
  if (!state.room) return;
  els.inviteDialog.showModal();
});

els.closeInviteButton.addEventListener("click", () => {
  els.inviteDialog.close();
});

els.qrImage.addEventListener("error", () => {
  els.qrCanvas.classList.add("active");
});

els.qrImage.addEventListener("load", () => {
  els.qrCanvas.classList.remove("active");
});

els.startGameButton.addEventListener("click", async () => {
  try {
    await api(`/api/rooms/${state.room.code}/start`, { playerId: state.playerId });
  } catch (error) {
    setStatus(error.message);
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
  els.writeTimer.textContent = text;
  els.drawTimer.textContent = text;
}, 250);

if (state.roomCode) {
  els.joinCode.value = state.roomCode;
  els.roomCodeField.classList.remove("hidden");
}

showScreen("homeView");

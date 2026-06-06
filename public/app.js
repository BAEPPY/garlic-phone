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
  currentStroke: null,
  avatarIndex: Number(localStorage.getItem("garlicPhoneAvatar") || "0"),
  selectedAlbumIndex: 0,
  albumAutoTimer: null
};

const $ = (selector) => document.querySelector(selector);
const els = {
  screens: [...document.querySelectorAll(".screen")],
  countdownOverlay: $("#countdownOverlay"),
  countdownNumber: $("#countdownNumber"),
  playerName: $("#playerName"),
  joinCode: $("#joinCode"),
  roomCodeField: $("#roomCodeField"),
  enterButton: $("#enterButton"),
  randomNameButton: $("#randomNameButton"),
  veggieScene: $(".veggie-scene"),
  homeStatus: $("#homeStatus"),
  leaveLobbyButton: $("#leaveLobbyButton"),
  playerCount: $("#playerCount"),
  maxPlayersSelect: $("#maxPlayersSelect"),
  playerList: $("#playerList"),
  presetTab: $("#presetTab"),
  customTab: $("#customTab"),
  presetPane: $("#presetPane"),
  customPane: $("#customPane"),
  customLockNote: $("#customLockNote"),
  modeButtons: [...document.querySelectorAll(".mode-card")],
  timePresetSelect: $("#timePresetSelect"),
  turnsSelect: $("#turnsSelect"),
  keepDrawingSelect: $("#keepDrawingSelect"),
  secrecySelect: $("#secrecySelect"),
  soundToggle: $("#soundToggle"),
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
  forceWritingButton: $("#forceWritingButton"),
  drawCanvas: $("#drawCanvas"),
  colorInput: $("#colorInput"),
  sizeInput: $("#sizeInput"),
  toolButtons: [...document.querySelectorAll(".tool")],
  undoButton: $("#undoButton"),
  clearButton: $("#clearButton"),
  submitDrawingButton: $("#submitDrawingButton"),
  drawingStatus: $("#drawingStatus"),
  galleryHomeButton: $("#galleryHomeButton"),
  albumList: $("#albumList"),
  albumSettings: $("#albumSettings"),
  albumViewer: $("#albumViewer"),
  displayAutoToggle: $("#displayAutoToggle"),
  albumSpeedSelect: $("#albumSpeedSelect"),
  albumReverseToggle: $("#albumReverseToggle"),
  startAlbumButton: $("#startAlbumButton"),
  albumTitle: $("#albumTitle"),
  albumPrompt: $("#albumPrompt"),
  albumDrawing: $("#albumDrawing"),
  prevAlbumButton: $("#prevAlbumButton"),
  nextAlbumButton: $("#nextAlbumButton")
};

const ctx = els.drawCanvas.getContext("2d");
ctx.lineCap = "round";
ctx.lineJoin = "round";
paintBackground("#ffffff");

const playerIcons = ["🧄", "🧅", "🌶", "🥕", "🥦", "🍆", "🍅", "🥔", "🥒", "🎃"];
const avatarSets = [
  ["garlic", "onion", "pepper", "carrot", "broccoli"],
  ["garlic", "tomato", "carrot"],
  ["potato", "pepper", "broccoli"],
  ["cucumber", "carrot", "tomato"],
  ["eggplant", "broccoli", "onion"],
  ["pumpkin", "tomato", "garlic"],
  ["garlic", "cucumber", "pepper"],
  ["onion", "eggplant", "carrot"],
  ["broccoli", "potato", "tomato"],
  ["pepper", "pumpkin", "cucumber"]
];

function showScreen(id) {
  els.screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
}

function showSettingsPane(name) {
  const showPreset = name === "preset";
  els.presetTab.classList.toggle("active", showPreset);
  els.customTab.classList.toggle("active", !showPreset);
  els.presetPane.classList.toggle("active", showPreset);
  els.customPane.classList.toggle("active", !showPreset);
}

function selectedMode() {
  return els.modeButtons.find((button) => button.classList.contains("selected"))?.dataset.mode || "normal";
}

function renderAvatar() {
  const index = ((state.avatarIndex % avatarSets.length) + avatarSets.length) % avatarSets.length;
  els.veggieScene.className = `veggie-scene avatar-${index}`;
  els.veggieScene.innerHTML = avatarSets[index].map((type) => `<b class="veg ${type}"></b>`).join("");
}

function settingFromControls() {
  return {
    maxPlayers: Number(els.maxPlayersSelect.value),
    timeMode: els.timePresetSelect.value,
    turns: els.turnsSelect.value,
    keepDrawing: els.keepDrawingSelect.value === "enabled",
    secrecy: els.secrecySelect.value,
    sound: els.soundToggle.checked
  };
}

function controlsFromSettings(settings) {
  if (!settings) return;
  els.maxPlayersSelect.value = String(settings.maxPlayers);
  els.timePresetSelect.value = settings.timeMode || "normal";
  els.turnsSelect.value = settings.turns || "all";
  els.keepDrawingSelect.value = settings.keepDrawing ? "enabled" : "disabled";
  els.secrecySelect.value = settings.secrecy || "public";
  els.soundToggle.checked = settings.sound !== false;
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
  localStorage.setItem("garlicPhoneAvatar", String(state.avatarIndex));
  history.replaceState(null, "", `/?room=${room.code}`);
  connectEvents();
  render();
}

function render() {
  renderCountdown();
  if (!state.room || !state.playerId) {
    showScreen("homeView");
    els.roomCodeField.classList.toggle("hidden", !state.roomCode);
    els.joinCode.value = state.roomCode;
    return;
  }

  if (state.room.stage === "lobby" || state.room.stage === "countdown") renderLobby();
  if (state.room.stage === "writing") renderWriting();
  if (state.room.stage === "drawing") renderDrawing();
  if (state.room.stage === "gallery") renderGalleryScreen();
}

function renderCountdown() {
  const active = state.room?.stage === "countdown";
  els.countdownOverlay.hidden = !active;
  if (!active) return;
  const remaining = Math.max(1, Math.ceil((state.room.countdownEndsAt - Date.now()) / 1000));
  els.countdownNumber.textContent = String(Math.min(3, remaining));
}

function renderLobby() {
  showScreen("lobbyView");
  const room = state.room;
  const isHost = room.hostId === state.playerId;
  controlsFromSettings(room.settings);
  els.modeButtons.forEach((button) => button.classList.toggle("selected", button.dataset.mode === room.mode));
  els.playerCount.textContent = `${room.players.length}/${room.settings.maxPlayers}`;
  renderPlayers(room.players, room.settings.maxPlayers, room.hostId);
  setControlsDisabled(!isHost || room.stage === "countdown");
  els.startGameButton.disabled = !isHost || room.players.length < 1 || room.stage === "countdown";
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
  els.drawingPrompt.textContent = state.room.assignedPrompt || "상상 한 장면";
  els.forceWritingButton.hidden = state.room.hostId !== state.playerId;
  els.submitDrawingButton.disabled = Boolean(state.room.myDrawing);
  els.drawingStatus.textContent = state.room.myDrawing ? "제출했어요. 결과를 기다리는 중이에요." : "";
}

function renderGalleryScreen() {
  showScreen("galleryView");
  renderAlbumList();
  renderSelectedAlbum();
}

function renderAlbumList() {
  const albums = orderedAlbums();
  if (state.selectedAlbumIndex >= albums.length) state.selectedAlbumIndex = 0;
  els.albumList.innerHTML = "";
  albums.forEach((album, index) => {
    const button = document.createElement("button");
    button.className = `player-row album-row${index === state.selectedAlbumIndex ? " selected" : ""}`;
    button.type = "button";
    button.innerHTML = `<span class="player-icon">${playerIcons[index % playerIcons.length]}</span><span>${escapeHtml(album.authorName)}의 앨범</span><span>${album.drawings.length}</span>`;
    button.addEventListener("click", () => {
      state.selectedAlbumIndex = index;
      showAlbumViewer();
      renderSelectedAlbum();
      restartAlbumAuto();
    });
    els.albumList.append(button);
  });
}

function showAlbumViewer() {
  els.albumSettings.hidden = true;
  els.albumViewer.hidden = false;
}

function renderSelectedAlbum() {
  const albums = orderedAlbums();
  const album = albums[state.selectedAlbumIndex];
  if (!album) return;
  const drawing = album.drawings[0] || {};
  els.albumTitle.textContent = `${album.authorName}의 앨범`;
  els.albumPrompt.textContent = album.prompt || "제시어가 없어요.";
  els.albumDrawing.src = drawing.drawing || "";
  renderAlbumList();
}

function orderedAlbums() {
  const albums = [...(state.room?.albums || [])];
  return els.albumReverseToggle.checked ? albums.reverse() : albums;
}

function moveAlbum(step) {
  const albums = orderedAlbums();
  if (!albums.length) return;
  state.selectedAlbumIndex = (state.selectedAlbumIndex + step + albums.length) % albums.length;
  renderSelectedAlbum();
}

function restartAlbumAuto() {
  window.clearInterval(state.albumAutoTimer);
  if (!els.displayAutoToggle.checked || els.albumViewer.hidden) return;
  state.albumAutoTimer = window.setInterval(() => moveAlbum(1), Number(els.albumSpeedSelect.value));
}

function setControlsDisabled(disabled) {
  const customLocked = state.room?.mode !== "custom";
  els.modeButtons.forEach((button) => {
    button.disabled = disabled;
  });
  [els.timePresetSelect, els.turnsSelect, els.keepDrawingSelect, els.secrecySelect].forEach((control) => {
    control.disabled = disabled || customLocked;
  });
  els.maxPlayersSelect.disabled = disabled;
  els.soundToggle.disabled = disabled;
  els.customLockNote.hidden = !customLocked;
}

function renderPlayers(players, maxPlayers, hostId) {
  els.playerList.innerHTML = "";
  for (let i = 0; i < maxPlayers; i += 1) {
    const player = players[i];
    const row = document.createElement("div");
    row.className = `player-row${player ? "" : " empty"}`;
    const icon = playerIcons[(player?.avatar ?? i) % playerIcons.length];
    row.innerHTML = player
      ? `<span class="player-icon">${icon}</span><span>${escapeHtml(player.name)}</span><span>${player.id === hostId ? "방장" : ""}</span>`
      : `<span class="player-icon">+</span><span>EMPTY</span><span></span>`;
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
  qr.fillText("QR이 안 보이면", 110, 102);
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

async function saveSettings(extra = {}) {
  if (!state.room || state.room.hostId !== state.playerId) return;
  try {
    await api(`/api/rooms/${state.room.code}/settings`, {
      playerId: state.playerId,
      settings: settingFromControls(),
      ...extra
    });
  } catch (error) {
    setStatus(error.message);
  }
}

function updateClock(element, totalSeconds, finalNumber = false) {
  const remaining = state.room?.roundEndsAt ? Math.max(0, Math.ceil((state.room.roundEndsAt - Date.now()) / 1000)) : null;
  const text = remaining === null ? "--:--" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const progress = remaining === null ? 0 : 1 - remaining / Math.max(1, totalSeconds);
  const showFinal = finalNumber && remaining !== null && remaining <= 10;
  element.classList.toggle("final-count", showFinal);
  element.querySelector("span").textContent = showFinal ? String(remaining) : text;
  element.style.setProperty("--progress", `${Math.min(1, Math.max(0, progress)) * 360}deg`);
}

els.presetTab.addEventListener("click", () => showSettingsPane("preset"));
els.customTab.addEventListener("click", () => showSettingsPane("custom"));

els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    els.modeButtons.forEach((item) => item.classList.toggle("selected", item === button));
    if (button.dataset.mode === "custom") showSettingsPane("custom");
    saveSettings({ mode: selectedMode() });
  });
});

els.randomNameButton.addEventListener("click", () => {
  state.avatarIndex = (state.avatarIndex + 1) % avatarSets.length;
  localStorage.setItem("garlicPhoneAvatar", String(state.avatarIndex));
  renderAvatar();
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
      ? await api(`/api/rooms/${code}/join`, { name, avatar: state.avatarIndex })
      : await api("/api/rooms", { name, avatar: state.avatarIndex, settings: settingFromControls(), mode: selectedMode() });
    enterRoom(data.room, data.playerId);
  } catch (error) {
    setStatus(error.message);
  }
});

els.leaveLobbyButton.addEventListener("click", () => {
  localStorage.removeItem("garlicPhonePlayerId");
  location.href = "/";
});

els.galleryHomeButton.addEventListener("click", () => {
  localStorage.removeItem("garlicPhonePlayerId");
  location.href = "/";
});

[els.maxPlayersSelect, els.timePresetSelect, els.turnsSelect, els.keepDrawingSelect, els.secrecySelect, els.soundToggle].forEach((control) => {
  control.addEventListener("change", () => saveSettings());
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

els.forceWritingButton.addEventListener("click", async () => {
  try {
    await api(`/api/rooms/${state.room.code}/force-writing`, { playerId: state.playerId });
  } catch (error) {
    els.drawingStatus.textContent = error.message;
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

els.startAlbumButton.addEventListener("click", () => {
  showAlbumViewer();
  state.selectedAlbumIndex = 0;
  renderSelectedAlbum();
  restartAlbumAuto();
});

els.prevAlbumButton.addEventListener("click", () => {
  moveAlbum(-1);
  restartAlbumAuto();
});

els.nextAlbumButton.addEventListener("click", () => {
  moveAlbum(1);
  restartAlbumAuto();
});

[els.displayAutoToggle, els.albumSpeedSelect, els.albumReverseToggle].forEach((control) => {
  control.addEventListener("change", () => {
    renderSelectedAlbum();
    restartAlbumAuto();
  });
});

setInterval(() => {
  renderCountdown();
  updateClock(els.writeTimer, state.room?.settings?.writeSeconds || 1);
  updateClock(els.drawTimer, state.room?.settings?.drawSeconds || 1, state.room?.stage === "drawing");
}, 250);

if (state.roomCode) {
  els.joinCode.value = state.roomCode;
  els.roomCodeField.classList.remove("hidden");
}

renderAvatar();
showScreen("homeView");

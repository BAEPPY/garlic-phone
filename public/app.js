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
  selectedAlbumStep: 0,
  albumAutoTimer: null,
  serverTimeOffset: 0,
  lastWritingTurn: -1,
  lastDrawingTurn: -1,
  autoSubmittingDrawing: false
};
let blockedToastTimer = null;

const $ = (selector) => document.querySelector(selector);
const els = {
  screens: [...document.querySelectorAll(".screen")],
  countdownOverlay: $("#countdownOverlay"),
  countdownNumber: $("#countdownNumber"),
  blockedWordToast: $("#blockedWordToast"),
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
  promptTopicSelect: $("#promptTopicSelect"),
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
  writingReference: $("#writingReference"),
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
  nextAlbumButton: $("#nextAlbumButton"),
  saveAlbumButton: $("#saveAlbumButton"),
  newGameButton: $("#newGameButton")
};

const ctx = els.drawCanvas.getContext("2d");
ctx.lineCap = "round";
ctx.lineJoin = "round";
paintBackground("#ffffff");

const avatarImages = Array.from({ length: 10 }, (_, index) => `/assets/avatars/avatar-${index}.webp`);
const promptSuggestions = [
  "별을 바라보는 양파 우주비행사",
  "꽃밭에서 웃는 파프리카 친구",
  "연필을 든 무 학생",
  "구름 위를 걷는 배추 요정",
  "노래 대회에 나간 시금치 가수",
  "작은 모자를 쓴 상추 탐정",
  "분수대 옆에서 쉬는 깻잎 화가",
  "바람개비를 돌리는 대파 아이",
  "눈사람을 만드는 고구마 형제",
  "도서관에서 공부하는 양배추 박사",
  "무지개 다리를 건너는 완두콩 가족",
  "피아노를 치는 가지 음악가",
  "모래성을 쌓는 오이 친구",
  "로봇을 조종하는 감자 기사",
  "해바라기 옆에서 낮잠 자는 당근 토끼",
  "자전거를 타는 브로콜리 선수",
  "별빛 아래 춤추는 호박 공주",
  "종이배를 띄우는 연근 소녀",
  "숲속 길을 안내하는 셀러리 지도사",
  "풍선을 들고 뛰는 피망 꼬마",
  "빨간 망토를 두른 토마토 영웅",
  "산꼭대기에서 외치는 콜리플라워 탐험대장",
  "하늘을 나는 애호박 비행사",
  "그림책 속으로 들어간 케일 마법사",
  "바닷가에서 조개를 줍는 콩나물 친구",
  "기차역에서 손 흔드는 숙주 요정",
  "빗방울을 연주하는 청경채 악단",
  "커다란 안경을 쓴 비트 선생님",
  "나비와 인사하는 아스파라거스 왕자",
  "달팽이와 경주하는 우엉 선수",
  "작은 성을 지키는 도라지 기사",
  "별 모양 쿠키를 굽는 파슬리 요리사",
  "운동화를 신은 루꼴라 달리기 선수",
  "커다란 책가방을 멘 콜라비 학생",
  "벚꽃길을 걷는 고사리 여행자",
  "연못가에서 낚시하는 무 할아버지",
  "마법 빗자루를 탄 양파 마녀",
  "캠핑장에서 노래하는 감자 친구들",
  "눈 오는 마을의 배추 우체부",
  "커피잔 속을 여행하는 완두콩 탐험가",
  "별사탕을 나누는 토마토 친구",
  "구름 침대에서 쉬는 브로콜리 왕",
  "시장에서 길을 잃은 당근 꼬마",
  "책상 위에서 그림 그리는 오이 화가",
  "작은 북을 치는 대파 악사",
  "무대 위에서 인사하는 파프리카 배우",
  "폭포 아래에서 명상하는 가지 수도사",
  "은하수를 건너는 호박 마차",
  "편지를 배달하는 상추 비둘기",
  "햇살 아래 웃고 있는 마늘 친구"
];
const fallbackPromptSuggestion = "별을 바라보는 양파 우주비행사";
let promptPacks = {
  none: promptSuggestions
};

const nicknameVeggies = [
  "마늘", "파", "감자", "고추", "당근", "양파", "브로콜리", "토마토", "오이", "상추",
  "배추", "무", "호박", "가지", "버섯", "옥수수", "피망", "양배추", "시금치", "깻잎",
  "콩나물", "부추", "연근", "고구마", "완두콩"
];

const blockedWords = [
  "씨발", "시발", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "개새끼", "새끼", "꺼져", "죽어",
  "좆", "존나", "미친", "등신", "멍청이", "바보새끼", "닥쳐", "엿먹어", "지랄",
  "니애미", "느금마", "애미", "애비", "장애", "찐따", "빡대가리", "또라이",
  "fuck", "shit", "bitch", "asshole", "damn", "sex", "porn"
];
let normalizedBlockedWords = [];

function randomNickname() {
  const veggie = nicknameVeggies[Math.floor(Math.random() * nicknameVeggies.length)];
  return `${veggie}${Math.floor(1000 + Math.random() * 9000)}`;
}

function normalizeForFilter(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[0-9０-９]/g, "")
    .replace(/[\s._\-~!@#$%^&*()[\]{}+=|\\:;"'<>,.?/`·ㆍ…ㄱ-ㅎㅏ-ㅣ]/g, "");
}

function refreshBlockedWords() {
  normalizedBlockedWords = [...new Set(blockedWords.map(normalizeForFilter).filter(Boolean))];
}

function hasBlockedWord(value) {
  const normalized = normalizeForFilter(value);
  return Boolean(normalized) && normalizedBlockedWords.some((word) => normalized.includes(word));
}

function randomSafePrompt() {
  const topic = state.room?.settings?.promptTopic || els.promptTopicSelect.value || "none";
  const list = promptPacks[topic]?.length ? promptPacks[topic] : promptPacks.none || promptSuggestions;
  return list[Math.floor(Math.random() * list.length)];
}

function showBlockedWordToast() {
  window.clearTimeout(blockedToastTimer);
  els.blockedWordToast.hidden = false;
  blockedToastTimer = window.setTimeout(() => {
    els.blockedWordToast.hidden = true;
  }, 1000);
}

function isBlockedWordError(message) {
  return String(message || "").includes("욕설이나 비하");
}

function setRoom(room) {
  if (room?.serverNow) {
    state.serverTimeOffset = room.serverNow - Date.now();
  }
  state.room = room;
}

function syncedNow() {
  return Date.now() + state.serverTimeOffset;
}

async function loadBlockedWords() {
  try {
    const res = await fetch("/bad-words.json", { cache: "no-store" });
    if (!res.ok) return;
    const words = await res.json();
    if (Array.isArray(words)) {
      blockedWords.push(...words.filter((word) => typeof word === "string" && normalizeForFilter(word).length > 1));
      refreshBlockedWords();
    }
  } catch {
    // 서버 필터가 한 번 더 막으므로 화면 목록 로딩 실패는 조용히 넘어갑니다.
  }
}

async function loadPromptPacks() {
  try {
    const res = await fetch("/prompt-packs.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.packs) return;
    promptPacks = Object.fromEntries(
      Object.entries(data.packs)
        .filter(([, pack]) => Array.isArray(pack.prompts))
        .map(([id, pack]) => [id, pack.prompts])
    );
  } catch {
    promptPacks = { none: promptSuggestions };
  }
}

function showScreen(id) {
  document.body.dataset.view = id;
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
  const index = normalizeAvatar(state.avatarIndex);
  els.veggieScene.className = "veggie-scene image-avatar";
  els.veggieScene.innerHTML = `<img src="${avatarImages[index]}" alt="?꾨줈??梨꾩냼" />`;
}

function normalizeAvatar(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((number % avatarImages.length) + avatarImages.length) % avatarImages.length;
}

function avatarHtml(index, label = "프로필") {
  return `<img class="avatar-img" src="${avatarImages[normalizeAvatar(index)]}" alt="${label}" />`;
}

function settingFromControls() {
  return {
    maxPlayers: Number(els.maxPlayersSelect.value),
    timeMode: els.timePresetSelect.value,
    promptTopic: els.promptTopicSelect.value,
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
  els.promptTopicSelect.value = settings.promptTopic || "none";
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
  if (!res.ok) throw new Error(data.error || "?붿껌???ㅽ뙣?덉뼱??");
  return data;
}

function connectEvents() {
  if (!state.roomCode || !state.playerId) return;
  if (state.source) state.source.close();
  state.source = new EventSource(`/api/rooms/${state.roomCode}/events?client=${encodeURIComponent(state.playerId)}`);
  state.source.onmessage = (event) => {
    setRoom(JSON.parse(event.data));
    render();
  };
  state.source.onerror = () => {
    if (!state.room) setStatus("諛??뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?댁슂.");
  };
}

function enterRoom(room, playerId) {
  state.playerId = playerId;
  state.roomCode = room.code;
  setRoom(room);
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
  const remaining = Math.max(1, Math.ceil((state.room.countdownEndsAt - syncedNow()) / 1000));
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
  if (state.lastWritingTurn !== state.room.turnIndex) {
    els.writingInput.value = "";
    state.lastWritingTurn = state.room.turnIndex;
  }
  const hasReference = Boolean(state.room.assignedDrawing);
  if (hasReference) {
    els.writingReference.src = state.room.assignedDrawing;
    els.writingReference.removeAttribute("hidden");
  } else {
    els.writingReference.setAttribute("hidden", "");
    els.writingReference.removeAttribute("src");
  }
  els.submitWritingButton.disabled = Boolean(state.room.myWriting);
  els.writingInput.disabled = Boolean(state.room.myWriting);
  if (state.room.myWriting) {
    els.writingInput.value = state.room.myWriting;
    els.writingStatus.textContent = "제출했어요. 다른 사람들을 기다리는 중이에요.";
  } else if (hasReference) {
    els.writingStatus.textContent = "그림을 보고 떠오르는 제시어를 적어 주세요.";
  } else {
    els.writingStatus.textContent = "100자 안으로 입력할 수 있어요.";
  }
}

function renderDrawing() {
  showScreen("drawView");
  if (state.lastDrawingTurn !== state.room.turnIndex) {
    state.strokes = [];
    paintBackground("#ffffff");
    state.lastDrawingTurn = state.room.turnIndex;
  }
  els.drawingPrompt.textContent = state.room.assignedPrompt || "상상 속 장면";
  els.forceWritingButton.hidden = state.room.hostId !== state.playerId;
  els.submitDrawingButton.disabled = Boolean(state.room.myDrawing);
  els.drawingStatus.textContent = state.room.myDrawing ? "제출했어요. 다음 턴을 기다리는 중이에요." : "";
}

function renderGalleryScreen() {
  showScreen("galleryView");
  els.albumSettings.hidden = false;
  els.albumViewer.hidden = true;
  window.clearInterval(state.albumAutoTimer);
  state.selectedAlbumStep = 0;
  renderAlbumList();
}

function renderAlbumList() {
  const albums = orderedAlbums();
  if (state.selectedAlbumIndex >= albums.length) state.selectedAlbumIndex = 0;
  els.albumList.innerHTML = "";
  if (!albums.length) {
    const row = document.createElement("div");
    row.className = "player-row empty";
    row.innerHTML = `<span class="player-icon">+</span><span>아직 앨범이 없어요</span><span></span>`;
    els.albumList.append(row);
    return;
  }
  albums.forEach((album, index) => {
    const button = document.createElement("button");
    button.className = `player-row album-row${index === state.selectedAlbumIndex ? " selected" : ""}`;
    button.type = "button";
    button.innerHTML = `<span class="player-icon">${avatarHtml(album.authorAvatar ?? index, `${album.authorName} 프로필`)}</span><span>${escapeHtml(album.authorName)}의 앨범</span><span>${album.steps?.length || 0}</span>`;
    button.addEventListener("click", () => {
      state.selectedAlbumIndex = index;
      state.selectedAlbumStep = 0;
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
  const steps = album.steps?.length ? album.steps : [];
  if (state.selectedAlbumStep >= steps.length) state.selectedAlbumStep = 0;
  const step = steps[state.selectedAlbumStep] || {};
  els.albumTitle.textContent = `${album.authorName}의 앨범`;
  els.albumPrompt.textContent = step.type === "drawing"
    ? step.prompt || album.prompt || "제시어가 없어요."
    : step.text || album.prompt || "제시어가 없어요.";
  const drawing = step.type === "drawing" ? step.drawing : "";
  if (drawing) {
    els.albumDrawing.src = drawing;
    els.albumDrawing.removeAttribute("hidden");
  } else {
    els.albumDrawing.setAttribute("hidden", "");
    els.albumDrawing.removeAttribute("src");
  }
  els.prevAlbumButton.disabled = steps.length <= 1;
  els.nextAlbumButton.disabled = steps.length <= 1;
  renderAlbumList();
}

function orderedAlbums() {
  const albums = [...(state.room?.albums || [])];
  return els.albumReverseToggle.checked ? albums.reverse() : albums;
}

function moveAlbumStep(step) {
  const album = currentAlbum();
  const steps = album?.steps || [];
  if (!steps.length) return;
  state.selectedAlbumStep = (state.selectedAlbumStep + step + steps.length) % steps.length;
  renderSelectedAlbum();
}

function currentAlbum() {
  return orderedAlbums()[state.selectedAlbumIndex] || null;
}

function saveCurrentAlbum() {
  const album = currentAlbum();
  const step = album?.steps?.[state.selectedAlbumStep];
  const drawing = step?.drawing || album?.drawings?.[0]?.drawing;
  if (!drawing) return;
  const link = document.createElement("a");
  link.href = drawing;
  link.download = `${album.authorName || "garlic-phone"}-album.png`;
  document.body.append(link);
  link.click();
  link.remove();
}

function restartAlbumAuto() {
  window.clearInterval(state.albumAutoTimer);
  if (!els.displayAutoToggle.checked || els.albumViewer.hidden) return;
  state.albumAutoTimer = window.setInterval(() => moveAlbumStep(1), Number(els.albumSpeedSelect.value));
}

function setControlsDisabled(disabled) {
  const customLocked = state.room?.mode !== "custom";
  els.modeButtons.forEach((button) => {
    button.disabled = disabled;
  });
  [els.timePresetSelect, els.promptTopicSelect, els.turnsSelect, els.keepDrawingSelect, els.secrecySelect].forEach((control) => {
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
    row.innerHTML = player
      ? `<span class="player-icon">${avatarHtml(player.avatar ?? i, `${player.name} 프로필`)}</span><span>${escapeHtml(player.name)}</span><span>${player.id === hostId ? "방장" : ""}</span>`
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
  qr.fillText("QR이 보이지 않으면", 110, 102);
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

async function submitCurrentDrawing(auto = false) {
  if (!state.room || state.room.stage !== "drawing" || state.room.myDrawing || state.autoSubmittingDrawing) return;
  state.autoSubmittingDrawing = true;
  els.submitDrawingButton.disabled = true;
  if (auto) els.drawingStatus.textContent = "시간이 끝나서 현재 그림을 저장하고 있어요.";
  try {
    const data = await api(`/api/rooms/${state.room.code}/submit-drawing`, {
      playerId: state.playerId,
      drawing: els.drawCanvas.toDataURL("image/webp", 0.75)
    });
    setRoom(data.room);
    render();
  } catch (error) {
    if (!auto) els.drawingStatus.textContent = error.message;
  } finally {
    state.autoSubmittingDrawing = false;
  }
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
  const remaining = state.room?.roundEndsAt ? Math.max(0, Math.ceil((state.room.roundEndsAt - syncedNow()) / 1000)) : null;
  const progress = remaining === null ? 0 : 1 - remaining / Math.max(1, totalSeconds);
  const showFinal = remaining !== null && remaining <= 10 && state.room?.stage !== "countdown";
  element.classList.toggle("final-count", showFinal);
  element.querySelector("span").textContent = showFinal ? String(remaining) : "";
  element.style.setProperty("--progress", `${Math.min(1, Math.max(0, progress)) * 360}deg`);
}

els.presetTab.addEventListener("click", () => showSettingsPane("preset"));
els.customTab.addEventListener("click", () => {
  showSettingsPane("custom");
  saveSettings({ mode: "custom" });
});

els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    els.modeButtons.forEach((item) => item.classList.toggle("selected", item === button));
    saveSettings({ mode: selectedMode() });
  });
});

els.randomNameButton.addEventListener("click", () => {
  state.avatarIndex = (state.avatarIndex + 1) % avatarImages.length;
  localStorage.setItem("garlicPhoneAvatar", String(state.avatarIndex));
  renderAvatar();
});

els.enterButton.addEventListener("click", async () => {
  try {
    const name = els.playerName.value.trim() || randomNickname();
    if (hasBlockedWord(name)) {
      showBlockedWordToast();
      return;
    }
    const code = (els.joinCode.value || state.roomCode).trim().toUpperCase();
    const data = code
      ? await api(`/api/rooms/${code}/join`, { name, avatar: state.avatarIndex })
      : await api("/api/rooms", { name, avatar: state.avatarIndex, settings: settingFromControls(), mode: selectedMode() });
    enterRoom(data.room, data.playerId);
  } catch (error) {
    if (isBlockedWordError(error.message)) showBlockedWordToast();
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

[els.maxPlayersSelect, els.timePresetSelect, els.promptTopicSelect, els.turnsSelect, els.keepDrawingSelect, els.secrecySelect, els.soundToggle].forEach((control) => {
  control.addEventListener("change", () => saveSettings());
});

els.copyInviteButton.addEventListener("click", async () => {
  if (!state.room) return;
  await navigator.clipboard.writeText(inviteUrl(state.room.code));
  els.copyInviteButton.textContent = "복사됨";
  window.setTimeout(() => {
    els.copyInviteButton.textContent = "초대";
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
    const usedAutoPrompt = !els.writingInput.value.trim();
    if (!els.writingInput.value.trim()) {
      els.writingInput.value = randomSafePrompt();
    }
    if (!usedAutoPrompt && hasBlockedWord(els.writingInput.value)) {
      showBlockedWordToast();
      return;
    }
    const data = await api(`/api/rooms/${state.room.code}/submit-writing`, {
      playerId: state.playerId,
      text: els.writingInput.value
    });
    setRoom(data.room);
    render();
  } catch (error) {
    if (isBlockedWordError(error.message)) showBlockedWordToast();
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
  submitCurrentDrawing(false);
});

els.startAlbumButton.addEventListener("click", () => {
  showAlbumViewer();
  state.selectedAlbumIndex = 0;
  state.selectedAlbumStep = 0;
  renderSelectedAlbum();
  restartAlbumAuto();
});

els.prevAlbumButton.addEventListener("click", () => {
  moveAlbumStep(-1);
  restartAlbumAuto();
});

els.nextAlbumButton.addEventListener("click", () => {
  moveAlbumStep(1);
  restartAlbumAuto();
});

els.saveAlbumButton.addEventListener("click", saveCurrentAlbum);

els.newGameButton.addEventListener("click", () => {
  localStorage.removeItem("garlicPhonePlayerId");
  location.href = "/";
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
  if (state.room?.stage === "drawing" && !state.room.myDrawing && state.room.roundEndsAt) {
    const millisecondsLeft = state.room.roundEndsAt - syncedNow();
    if (millisecondsLeft <= 1200) submitCurrentDrawing(true);
  }
}, 250);

if (state.roomCode) {
  els.joinCode.value = state.roomCode;
  els.roomCodeField.classList.remove("hidden");
}

renderAvatar();
refreshBlockedWords();
loadBlockedWords();
loadPromptPacks();
showScreen("homeView");

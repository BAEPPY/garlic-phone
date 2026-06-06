const { spawn } = require("child_process");
const { chromium } = require("playwright");

const root = "C:/Users/김지은/Documents/Codex/2026-06-06/new-chat";
const nodePath = "C:/Users/김지은/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe";
const server = spawn(nodePath, [`${root}/server.js`], { cwd: root, stdio: "ignore" });

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch("http://localhost:4173/");
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Server did not start.");
}

(async () => {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.goto("http://localhost:4173/");
  await page.getByRole("button", { name: "방 만들기" }).click();
  await page.waitForFunction(() => document.querySelector("#inviteLink")?.value.includes("?room="));
  const invite = await page.locator("#inviteLink").inputValue();
  const roomCode = await page.locator("#adminRoomCode").innerText();
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await player.goto(invite);
  await player.getByPlaceholder("예: 지은").fill("지은");
  await player.getByRole("button", { name: "입장" }).click();
  await player.waitForSelector("#waitView.active");
  await page.getByRole("button", { name: "게임 시작" }).click();
  await player.waitForSelector("#writeView.active");
  await player.locator("#writingInput").fill("구름 위에서 피아노 치는 사람");
  await player.getByRole("button", { name: "글 제출" }).click();
  await player.waitForSelector("#drawView.active");
  const prompt = await player.locator("#drawingPrompt").innerText();
  const overflow = await player.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const qrHasPixels = await page.evaluate(() => {
    const ctx = document.querySelector("#qrCanvas").getContext("2d");
    const data = ctx.getImageData(0, 0, 220, 220).data;
    return data.some((value, index) => index % 4 !== 3 && value < 80);
  });
  await browser.close();
  console.log(JSON.stringify({ roomCode, prompt, overflow, qrHasPixels }));
})().finally(() => server.kill());

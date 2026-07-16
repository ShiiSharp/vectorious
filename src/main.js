import { Game } from "./runtime/game.js";
import { Renderer } from "./runtime/renderer.js";
import { Input } from "./runtime/input.js";

const canvas = document.querySelector("#game");
const scoreNode = document.querySelector("#score");
const livesNode = document.querySelector("#lives");
const messageNode = document.querySelector("#message");

const game = new Game(canvas.width, canvas.height);
const renderer = new Renderer(canvas);
const input = new Input();

let lastTime = performance.now();

function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  game.update(dt, input.state);
  renderer.render(game.snapshot());

  scoreNode.textContent = String(game.score).padStart(6, "0");
  livesNode.textContent = `LIFE ${game.lives}`;
  messageNode.textContent = game.statusText(input.usingGamepad);

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

const COLORS = {
  cyan: "#75f7ff",
  lime: "#b9ff78",
  pink: "#ff7adf",
  red: "#ff6262",
  dim: "rgba(117, 247, 255, 0.22)",
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }

  render(state) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, state.width, state.height);
    this.drawBackdrop(state);
    this.withGlow(COLORS.cyan, 10, () => {
      this.drawStars(state.stars, state.time);
      this.drawPlayer(state.player, state.time);
      for (const shot of state.playerShots) {
        this.drawPlayerShot(shot);
      }
    });

    this.withGlow(COLORS.pink, 12, () => {
      for (const enemy of state.enemies) {
        this.drawEnemy(enemy, state.time);
      }
    });

    this.withGlow(COLORS.lime, 14, () => {
      for (const soul of state.souls) {
        this.drawSoul(soul);
      }
    });

    for (const burst of state.bursts) {
      this.drawBurst(burst);
    }

    this.drawScanlines(state);
  }

  drawBackdrop({ width, height, time }) {
    const ctx = this.ctx;
    const gradient = ctx.createRadialGradient(width * 0.22, height * 0.42, 20, width * 0.5, height * 0.5, width * 0.78);
    gradient.addColorStop(0, "rgba(8, 28, 42, 0.45)");
    gradient.addColorStop(0.55, "rgba(4, 7, 20, 0.92)");
    gradient.addColorStop(1, "#02030a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = COLORS.dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 80; y < height; y += 80) {
      const wave = Math.sin(time * 0.9 + y * 0.02) * 12;
      ctx.moveTo(0, y);
      ctx.lineTo(width + wave, y + wave * 0.18);
    }
    ctx.stroke();
  }

  drawStars(stars, time) {
    const ctx = this.ctx;
    for (const star of stars) {
      const pulse = 0.6 + Math.sin(time * 4 + star.phase) * 0.35;
      ctx.strokeStyle = star.layer === 3 ? COLORS.cyan : "rgba(185, 255, 120, 0.75)";
      ctx.lineWidth = star.layer;
      ctx.beginPath();
      ctx.moveTo(star.x - star.layer * 5 * pulse, star.y);
      ctx.lineTo(star.x + star.layer * 2, star.y);
      ctx.stroke();
    }
  }

  drawPlayer(player, time) {
    const ctx = this.ctx;
    const flicker = player.invincible > 0 && Math.floor(time * 18) % 2 === 0;
    if (flicker) {
      return;
    }

    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x + 28, player.y);
    ctx.lineTo(player.x - 22, player.y - 20);
    ctx.lineTo(player.x - 10, player.y);
    ctx.lineTo(player.x - 22, player.y + 20);
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = COLORS.lime;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.x - 12, player.y - 8);
    ctx.lineTo(player.x - 42 - Math.sin(time * 30) * 8, player.y);
    ctx.lineTo(player.x - 12, player.y + 8);
    ctx.stroke();
  }

  drawPlayerShot(shot) {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.lime;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shot.x - 18, shot.y);
    ctx.lineTo(shot.x + 16, shot.y);
    ctx.stroke();
  }

  drawEnemy(enemy, time) {
    const ctx = this.ctx;
    const wobble = Math.sin(time * 5 + enemy.phase) * 4;
    ctx.strokeStyle = COLORS.pink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(enemy.x - 24, enemy.y);
    ctx.lineTo(enemy.x, enemy.y - 24 + wobble);
    ctx.lineTo(enemy.x + 26, enemy.y);
    ctx.lineTo(enemy.x, enemy.y + 24 + wobble);
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawSoul(soul) {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.lime;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(soul.x, soul.y, soul.radius, soul.spin, soul.spin + Math.PI * 1.55);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(soul.x + Math.cos(soul.spin) * 2, soul.y + Math.sin(soul.spin) * 2);
    ctx.quadraticCurveTo(soul.x - 8, soul.y - 10, soul.x + 3, soul.y - 16);
    ctx.stroke();
  }

  drawBurst(burst) {
    const ctx = this.ctx;
    const t = burst.age / burst.life;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = burst.color;
    ctx.shadowColor = burst.color;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10;
      const inner = 8 + t * 12;
      const outer = 28 + t * 70;
      ctx.beginPath();
      ctx.moveTo(burst.x + Math.cos(angle) * inner, burst.y + Math.sin(angle) * inner);
      ctx.lineTo(burst.x + Math.cos(angle) * outer, burst.y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawScanlines({ width, height, time }) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(117, 247, 255, 0.035)";
    for (let y = Math.floor((time * 36) % 6); y < height; y += 6) {
      ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();
  }

  withGlow(color, blur, draw) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    draw();
    ctx.restore();
  }
}

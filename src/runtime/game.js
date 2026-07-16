const PLAYER_SPEED = 360;
const PLAYER_FIRE_INTERVAL = 0.13;
const ENEMY_FIRE_INTERVAL = 1.35;
const TAU = Math.PI * 2;

export class Game {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.time = 0;
    this.score = 0;
    this.lives = 3;
    this.spawnTimer = 0;
    this.player = {
      x: 150,
      y: height * 0.5,
      radius: 18,
      cooldown: 0,
      invincible: 0,
    };
    this.stars = Array.from({ length: 120 }, (_, index) => this.makeStar(index));
    this.playerShots = [];
    this.enemies = [];
    this.souls = [];
    this.bursts = [];
  }

  update(dt, input) {
    this.time += dt;
    this.updateStars(dt);
    this.updatePlayer(dt, input);
    this.updateSpawns(dt);
    this.updateShots(dt);
    this.updateEnemies(dt);
    this.updateSouls(dt);
    this.updateBursts(dt);
    this.resolveHits();
  }

  statusText(usingGamepad) {
    if (this.lives <= 0) {
      return "SYSTEM REBOOTING";
    }

    return usingGamepad ? "MOVE + TRIGGER 1" : "ARROWS / WASD + Z";
  }

  snapshot() {
    return {
      width: this.width,
      height: this.height,
      time: this.time,
      stars: this.stars,
      player: this.player,
      playerShots: this.playerShots,
      enemies: this.enemies,
      souls: this.souls,
      bursts: this.bursts,
    };
  }

  makeStar(index) {
    const layer = 1 + (index % 3);
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      layer,
      phase: Math.random() * TAU,
    };
  }

  updateStars(dt) {
    for (const star of this.stars) {
      star.x -= dt * (32 + star.layer * 44);
      if (star.x < -8) {
        star.x = this.width + Math.random() * 80;
        star.y = Math.random() * this.height;
      }
    }
  }

  updatePlayer(dt, input) {
    if (this.lives <= 0) {
      this.player.invincible -= dt;
      if (this.player.invincible < -1.2) {
        this.lives = 3;
        this.score = 0;
        this.enemies.length = 0;
        this.souls.length = 0;
        this.playerShots.length = 0;
        this.player.x = 150;
        this.player.y = this.height * 0.5;
      }
      return;
    }

    const length = Math.hypot(input.x, input.y) || 1;
    this.player.x += (input.x / length) * PLAYER_SPEED * dt;
    this.player.y += (input.y / length) * PLAYER_SPEED * dt;
    this.player.x = clamp(this.player.x, 55, this.width * 0.62);
    this.player.y = clamp(this.player.y, 58, this.height - 58);
    this.player.cooldown = Math.max(0, this.player.cooldown - dt);
    this.player.invincible = Math.max(0, this.player.invincible - dt);

    if (input.fire && this.player.cooldown <= 0) {
      this.player.cooldown = PLAYER_FIRE_INTERVAL;
      this.playerShots.push({
        x: this.player.x + 25,
        y: this.player.y,
        vx: 760,
        radius: 5,
        age: 0,
      });
    }
  }

  updateSpawns(dt) {
    if (this.lives <= 0) {
      return;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.42, 1.15 - this.time * 0.01);
      this.enemies.push({
        x: this.width + 55,
        y: 90 + Math.random() * (this.height - 180),
        vx: -130 - Math.random() * 85,
        radius: 22,
        fireTimer: 0.45 + Math.random() * 0.7,
        phase: Math.random() * TAU,
      });
    }
  }

  updateShots(dt) {
    for (const shot of this.playerShots) {
      shot.x += shot.vx * dt;
      shot.age += dt;
    }

    removeWhere(this.playerShots, (shot) => shot.x > this.width + 40);
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      enemy.x += enemy.vx * dt;
      enemy.y += Math.sin(this.time * 2.3 + enemy.phase) * 42 * dt;
      enemy.fireTimer -= dt;

      if (enemy.fireTimer <= 0 && this.lives > 0) {
        enemy.fireTimer = ENEMY_FIRE_INTERVAL + Math.random() * 0.65;
        const dx = this.player.x - enemy.x;
        const dy = this.player.y - enemy.y;
        const length = Math.hypot(dx, dy) || 1;
        const speed = 205 + Math.random() * 55;
        this.souls.push({
          x: enemy.x - 18,
          y: enemy.y,
          vx: (dx / length) * speed,
          vy: (dy / length) * speed,
          radius: 12,
          spin: Math.random() * TAU,
        });
      }
    }

    removeWhere(this.enemies, (enemy) => enemy.x < -80);
  }

  updateSouls(dt) {
    for (const soul of this.souls) {
      soul.x += soul.vx * dt;
      soul.y += soul.vy * dt;
      soul.spin += dt * 5;
    }

    removeWhere(this.souls, (soul) => (
      soul.x < -50 || soul.y < -50 || soul.y > this.height + 50
    ));
  }

  updateBursts(dt) {
    for (const burst of this.bursts) {
      burst.age += dt;
    }

    removeWhere(this.bursts, (burst) => burst.age > burst.life);
  }

  resolveHits() {
    for (const enemy of this.enemies) {
      for (const shot of this.playerShots) {
        if (distance(enemy, shot) < enemy.radius + shot.radius) {
          enemy.dead = true;
          shot.dead = true;
          this.score += 100;
          this.addBurst(enemy.x, enemy.y, "#ff7adf");
        }
      }

      if (this.player.invincible <= 0 && distance(enemy, this.player) < enemy.radius + this.player.radius) {
        enemy.dead = true;
        this.damagePlayer();
      }
    }

    for (const soul of this.souls) {
      if (this.player.invincible <= 0 && distance(soul, this.player) < soul.radius + this.player.radius * 0.75) {
        soul.dead = true;
        this.damagePlayer();
      }
    }

    removeWhere(this.enemies, (enemy) => enemy.dead);
    removeWhere(this.playerShots, (shot) => shot.dead);
    removeWhere(this.souls, (soul) => soul.dead);
  }

  damagePlayer() {
    this.lives -= 1;
    this.player.invincible = this.lives > 0 ? 1.5 : 0.1;
    this.addBurst(this.player.x, this.player.y, "#75f7ff");
  }

  addBurst(x, y, color) {
    this.bursts.push({ x, y, color, age: 0, life: 0.42 });
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function removeWhere(list, predicate) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (predicate(list[index])) {
      list.splice(index, 1);
    }
  }
}

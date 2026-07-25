(() => {
  const keyMap = new Map([
    ["ArrowUp", "up"],
    ["KeyW", "up"],
    ["ArrowDown", "down"],
    ["KeyS", "down"],
    ["ArrowLeft", "left"],
    ["KeyA", "left"],
    ["ArrowRight", "right"],
    ["KeyD", "right"],
    ["KeyZ", "fire"],
    ["Space", "fire"],
    ["KeyX", "activate"],
    ["Enter", "start"],
    ["Digit1", "stage1"],
    ["Digit2", "stage2"],
    ["Digit3", "stage3"],
    ["Digit4", "stage4"],
    ["Digit5", "stage5"],
    ["Digit6", "stage6"],
    ["Digit7", "stage7"],
    ["Numpad1", "stage1"],
    ["Numpad2", "stage2"],
    ["Numpad3", "stage3"],
    ["Numpad4", "stage4"],
    ["Numpad5", "stage5"],
    ["Numpad6", "stage6"],
    ["Numpad7", "stage7"],
  ]);

  const POWERUPS = ["SPEED", "MISSILE", "DOUBLE", "LASER", "OPTION", "SHIELD"];
  const TAU = Math.PI * 2;
  const RESPAWN_INVINCIBLE = 5;
  const LASER_GROW_SPEED = 980;
  const CRASH_DURATION = 3;
  const AIR_DURATION = 20;
  const MAIN_DURATION = 120;
  const PRE_BOSS_DURATION = 30;
  const FORMATION_SIZE = 8;
  const CAPSULE_CYCLE_MAX = 6;
  const GAUGE_LABELS = [...POWERUPS];

  const COLORS = {
    cyan: "#75f7ff",
    lime: "#b9ff78",
    pink: "#ff7adf",
    red: "#ff6262",
    amber: "#ffd166",
    blue: "#7aa2ff",
    dim: "rgba(117, 247, 255, 0.22)",
  };

  const DEFAULT_STAGES = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    name: `STAGE ${index + 1}`,
    theme: "vector-space",
    palette: {
      primary: COLORS.cyan,
      secondary: COLORS.lime,
      enemy: COLORS.pink,
    },
  }));
  const STAGES = (window.VECTORIUS_STAGE_DATA ?? DEFAULT_STAGES).map((stage, index) => ({
    ...DEFAULT_STAGES[index],
    ...stage,
  }));

  class Input {
    constructor() {
      this.keys = new Set();
      this.usingGamepad = false;
      this.stageSelectLatch = 0;
      this.gamepadButtons = new Set();
      this.state = {
        x: 0,
        y: 0,
        fire: false,
        activate: false,
        start: false,
        stageSelect: 0,
        stageStep: 0,
      };

      window.addEventListener("keydown", (event) => {
        if (/^[1-7]$/.test(event.key)) {
          event.preventDefault();
          this.stageSelectLatch = Number(event.key);
          this.usingGamepad = false;
        }

        if (keyMap.has(event.code)) {
          event.preventDefault();
          this.keys.add(event.code);
          this.usingGamepad = false;
        }
      });

      window.addEventListener("keyup", (event) => {
        if (keyMap.has(event.code)) {
          event.preventDefault();
          this.keys.delete(event.code);
        }
      });

      const update = () => {
        this.readKeyboard();
        this.readGamepad();
        requestAnimationFrame(update);
      };

      update();
    }

    readKeyboard() {
      const active = new Set([...this.keys].map((code) => keyMap.get(code)));
      this.state.x = Number(active.has("right")) - Number(active.has("left"));
      this.state.y = Number(active.has("down")) - Number(active.has("up"));
      this.state.fire = active.has("fire");
      this.state.activate = active.has("activate");
      this.state.start = active.has("start");
      this.state.stageSelect = this.stageSelectLatch;
      this.state.stageStep = 0;
      this.stageSelectLatch = 0;
    }

    readGamepad() {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = [...pads].find(Boolean);

      if (!pad) {
        this.gamepadButtons.clear();
        return;
      }

      const axisX = Math.abs(pad.axes[0] ?? 0) > 0.22 ? pad.axes[0] : 0;
      const axisY = Math.abs(pad.axes[1] ?? 0) > 0.22 ? pad.axes[1] : 0;
      const dpadX = Number(pad.buttons[15]?.pressed) - Number(pad.buttons[14]?.pressed);
      const dpadY = Number(pad.buttons[13]?.pressed) - Number(pad.buttons[12]?.pressed);
      const buttonDown = (index) =>
        Boolean(pad.buttons[index]?.pressed || (pad.buttons[index]?.value ?? 0) > 0.35);
      const fire = [0, 2, 5, 7].some(buttonDown);
      const activate = [1, 3, 4, 6].some(buttonDown);
      const start = buttonDown(9);
      const currentButtons = new Set(
        pad.buttons
          .map((button, index) => (button.pressed || button.value > 0.35 ? index : -1))
          .filter((index) => index >= 0),
      );
      const leftPressed = currentButtons.has(14) && !this.gamepadButtons.has(14);
      const rightPressed = currentButtons.has(15) && !this.gamepadButtons.has(15);

      if (axisX || axisY || dpadX || dpadY || fire || activate || start) {
        this.usingGamepad = true;
        this.state.x = dpadX || axisX;
        this.state.y = dpadY || axisY;
        this.state.fire = fire;
        this.state.activate = activate;
        this.state.start = start;
        this.state.stageStep = Number(rightPressed) - Number(leftPressed);
      }
      this.gamepadButtons = currentButtons;
    }
  }

  class Game {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.time = 0;
      this.mode = "title";
      this.score = 0;
      this.lives = 3;
      this.spawnTimer = 0;
      this.runTime = 0;
      this.selectedStageIndex = 0;
      this.stageIndex = 0;
      this.stagePhase = "air";
      this.phaseTimer = 0;
      this.stageScroll = 0;
      this.formationTimer = 0;
      this.formationsLaunched = 0;
      this.nextFormationId = 1;
      this.nextSpaceWaveId = 1;
      this.nextCruiserId = 1;
      this.sphereSpawnCount = 0;
      this.formationGroups = new Map();
      this.bossSpawned = false;
      this.bossDefeat = null;
      this.volcanoTimer = 0;
      this.sphereTimer = 0;
      this.sphereSpawnCount = 0;
      this.generatorStates = [];
      this.groundTurretStates = [];
      this.walkerStates = [];
      this.jumperStates = [];
      this.laserDroneStates = [];
      this.spaceAssault = null;
      this.meteorRush = null;
      this.warpSpawnTimer = 0;
      this.enemySpawnCount = 0;
      this.loopClearTimer = 0;
      this.loopNumber = 1;
      this.killCount = 0;
      this.powerCapsules = 0;
      this.flashText = "";
      this.flashTimer = 0;
      this.activateWasHeld = false;
      this.startWasHeld = false;
      this.gameOverTimer = 0;
      this.gameOverCanConfirm = false;
      this.respawnTimer = 0;
      this.respawnPowerCapsules = 0;
      this.readyTimer = 0;
      this.crashExplosionTimer = 0;
      this.stageCheckpoint = null;
      this.player = {
        x: 150,
        y: height * 0.5,
        radius: 18,
        hitRadius: 9,
        cooldown: 0,
        missileCooldown: 0,
        invincible: 0,
        speedLevel: 1,
        missile: false,
        double: false,
        laser: false,
        shield: 0,
        moving: false,
        crashing: false,
        crashVy: 0,
        crashSpin: 0,
        crashTimer: 0,
        crashStartY: 0,
        crashSmokeTimer: 0,
        angle: 0,
        trail: [],
      };
      this.options = [];
      this.stars = Array.from({ length: 120 }, (_, index) => this.makeStar(index));
      this.playerShots = [];
      this.missiles = [];
      this.enemies = [];
      this.souls = [];
      this.bossBeams = [];
      this.volcanoShots = [];
      this.capsules = [];
      this.lasers = [];
      this.bursts = [];
      this.smoke = [];
    }

    update(dt, input) {
      if (this.mode === "ready") {
        this.updateReady(dt);
        return;
      }
      if (this.mode === "crashExplosion") {
        this.updateCrashExplosion(dt);
        return;
      }

      this.time += dt;
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      this.updateStars(dt);
      this.updateSmoke(dt);

      if (this.mode === "title") {
        const startHeld = input.start || input.fire || input.activate;
        if (input.stageSelect > 0) {
          this.selectedStageIndex = input.stageSelect - 1;
          this.flash(`START STAGE ${input.stageSelect}`);
        } else if (input.stageStep) {
          this.selectedStageIndex =
            (this.selectedStageIndex + input.stageStep + STAGES.length) % STAGES.length;
          this.flash(`START STAGE ${this.selectedStageIndex + 1}`);
        } else if (startHeld && !this.startWasHeld) {
          this.startGame(this.selectedStageIndex);
        }
        this.startWasHeld = startHeld;
        return;
      }

      if (this.mode === "gameover") {
        this.updateGameOver(dt, input);
        return;
      }

      if (this.mode === "loopclear") {
        this.updateLoopClear(dt, input);
        this.updateBursts(dt);
        return;
      }

      if (this.mode === "respawn") {
        this.updateRespawn(dt);
        this.updateBursts(dt);
        return;
      }

      if (this.mode === "crashing") {
        this.updateCrash(dt);
        this.updateStageObjects(dt);
        this.updateSpawns(dt);
        this.updateWeapons(dt, { fire: false });
        this.updateEnemies(dt);
        this.updateSouls(dt);
        this.updateBossBeams(dt);
        this.updateVolcanoShots(dt);
        this.updateCapsules(dt);
        this.updateBursts(dt);
        return;
      }

      this.runTime += dt;
      this.updateStageFlow(dt);
      this.updateStageObjects(dt);
      this.updateStageCheckpoint();
      this.updatePlayer(dt, input);
      this.updateOptions();
      this.updateSpawns(dt);
      this.updateWeapons(dt, input);
      this.updateEnemies(dt);
      this.updateSouls(dt);
      this.updateBossBeams(dt);
      this.updateVolcanoShots(dt);
      this.updateCapsules(dt);
      this.updateBursts(dt);
      this.resolveHits();
    }

    statusText(usingGamepad) {
      if (this.mode === "title") return `START STAGE ${this.selectedStageIndex + 1}`;
      if (this.mode === "gameover") return "GAME OVER";
      if (this.mode === "loopclear") return "1 LOOP CLEAR";
      if (this.mode === "crashing") return "CRITICAL HIT";
      if (this.mode === "crashExplosion") return "CRITICAL HIT";
      if (this.mode === "respawn") return "READY";
      if (this.mode === "ready") return "READY";
      if (this.lives <= 0) return "SYSTEM REBOOTING";
      if (this.flashTimer > 0) return this.flashText;
      if (this.stagePhase === "bossClear") return "BOSS DOWN";
      if (this.stagePhase === "boss") return `${STAGES[this.stageIndex].name} BOSS`;
      if (this.stagePhase === "preBoss") return `${STAGES[this.stageIndex].name} WARP ZONE`;
      if (this.stagePhase === "air") return `${STAGES[this.stageIndex].name} AIR`;
      return usingGamepad ? "A / R2 FIRE • B / L1 POWER" : "Z FIRE / X POWER";
    }

    snapshot() {
      return {
        width: this.width,
        height: this.height,
        time: this.time,
        stars: this.stars,
        player: this.player,
        options: this.options,
        playerShots: this.playerShots,
        missiles: this.missiles,
        enemies: this.enemies,
        souls: this.souls,
        bossBeams: this.bossBeams,
        volcanoShots: this.volcanoShots,
        capsules: this.capsules,
        lasers: this.lasers,
        bursts: this.bursts,
        smoke: this.smoke,
        powerCapsules: this.powerCapsules,
        powerups: GAUGE_LABELS,
        powerupAvailable: GAUGE_LABELS.map((name) => Boolean(name) && this.canActivatePowerup(name)),
        mode: this.mode,
        selectedStageIndex: this.selectedStageIndex,
        gameOverTimer: this.gameOverTimer,
        stage: STAGES[this.stageIndex],
        stageIndex: this.stageIndex,
        stagePhase: this.stagePhase,
        phaseTimer: this.phaseTimer,
        stageScroll: this.stageScroll,
        terrainAlpha: this.terrainFadeAlpha(),
        loopClearTimer: this.loopClearTimer,
        loopNumber: this.loopNumber,
        readyTimer: this.readyTimer,
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

    terrainY(x) {
      const stage = STAGES[this.stageIndex];
      if (this.stagePhase === "air") return this.height - 62;
      if (stage.terrainMode === "normal" || stage.terrainMode === "inverted") return this.stageSurfaceY(x, "bottom");

      return this.height - 68 - Math.sin(x * 0.010 + this.time * 0.9) * 34 - Math.sin(x * 0.024 + this.time * 0.32) * 18;
    }

    stageSurfaceY(screenX, side = "bottom") {
      const stage = STAGES[this.stageIndex];
      const targetSide = side;
      const base = targetSide === "bottom" ? this.height - 62 : 62;
      const sign = targetSide === "bottom" ? -1 : 1;
      let surface = base;
      const mountainSide = stage.terrainMode === "inverted" ? "top" : "bottom";
      const ceilingSide = stage.terrainMode === "inverted" ? "bottom" : "top";

      if (targetSide === mountainSide) {
        for (const mountain of stage.mountains ?? []) {
          const x = this.stageObjectX(mountain);
          const half = mountain.width / 2;
          const t = 1 - Math.abs(screenX - x) / half;
          if (t > 0) {
            surface += sign * mountain.height * Math.max(0, t);
          }
        }
      }

      if (targetSide === ceilingSide) {
        for (const peak of stage.ceiling ?? []) {
          const x = peak.x - this.stageScroll;
          const half = peak.width / 2;
          const t = 1 - Math.abs(screenX - x) / half;
          if (t > 0) {
            surface += sign * peak.height * Math.max(0, t);
          }
        }
      }

      return surface;
    }

    stageObjectX(object) {
      return object.x - this.stageScroll;
    }

    isStageTerrainActive() {
      return (
        this.mode === "playing" &&
        this.stagePhase === "main" &&
        this.terrainFadeAlpha() >= 1
      );
    }

    terrainFadeAlpha() {
      if (this.stagePhase !== "main") return 1;
      return clamp(Math.min(this.phaseTimer / 3, (MAIN_DURATION - this.phaseTimer) / 3), 0, 1);
    }

    pointHitsTerrain(x, y) {
      if (!this.isStageTerrainActive()) return false;
      if (STAGES[this.stageIndex].spaceAssault || STAGES[this.stageIndex].meteorRush) return false;
      if (this.pointHitsDiamondTerrain(x, y, 0)) return true;
      if (this.pointHitsCircleTerrain(x, y, 0)) return true;
      const stage = STAGES[this.stageIndex];
      if (stage.terrainMode === "normal" || stage.terrainMode === "inverted") {
        return y >= this.stageSurfaceY(x, "bottom") || y <= this.stageSurfaceY(x, "top");
      }
      return y >= this.terrainY(x);
    }

    pointHitsDiamondTerrain(x, y, radius = 0) {
      const stage = STAGES[this.stageIndex];
      if (stage.terrainMode !== "diamonds") return false;
      for (const diamond of stage.diamonds ?? []) {
        const dx = Math.abs(x - this.stageObjectX(diamond));
        const dy = Math.abs(y - diamond.y);
        const halfW = diamond.width / 2 + radius;
        const halfH = diamond.height / 2 + radius;
        if (dx / halfW + dy / halfH <= 1) return true;
      }
      return false;
    }

    pointHitsCircleTerrain(x, y, radius = 0) {
      const stage = STAGES[this.stageIndex];
      if (stage.terrainMode !== "diamonds") return false;
      for (const circle of stage.circles ?? []) {
        const cx = this.stageObjectX(circle);
        const hitRadius = circle.radius + radius;
        if (Math.hypot(x - cx, y - circle.y) <= hitRadius) return true;
      }
      return false;
    }

    difficulty() {
      return clamp(this.runTime / 120, 0, 1);
    }

    loopDifficultyMultiplier() {
      return 1 + Math.min(0.15 * (this.loopNumber - 1), 0.75);
    }

    updateStageFlow(dt) {
      if (this.mode !== "playing") return;

      this.phaseTimer += dt;
      if (this.stagePhase === "air") {
        this.formationTimer -= dt;
        if (this.formationsLaunched < 5 && this.formationTimer <= 0) {
          this.spawnFormation(this.formationsLaunched);
          this.formationsLaunched += 1;
          this.formationTimer = 4;
        }
        this.updateFormationSpawners(dt);

        if (this.phaseTimer >= AIR_DURATION) this.enterStagePhase("main");
        return;
      }

      if (
        this.stagePhase === "main" &&
        !STAGES[this.stageIndex].spaceAssault &&
        this.phaseTimer >= MAIN_DURATION
      ) {
        this.enterStagePhase("preBoss");
      }

      if (this.stagePhase === "preBoss") {
        if (STAGES[this.stageIndex].terrainMode) this.stageScroll += 92 * dt;
        this.warpSpawnTimer -= dt;
        if (this.warpSpawnTimer <= 0) {
          this.warpSpawnTimer = 1.1;
          this.spawnWarpEnemy();
        }
        if (this.phaseTimer >= PRE_BOSS_DURATION) {
          this.enterStagePhase("boss");
        }
      }

      if (this.stagePhase === "boss" && !this.bossSpawned) {
        this.spawnBoss();
      }

      if (this.stagePhase === "bossClear") {
        this.updateBossDefeat(dt);
      }
    }

    enterStagePhase(phase) {
      this.stagePhase = phase;
      this.phaseTimer = 0;
      this.spawnTimer = 0;
      this.bossSpawned = false;
      this.bossDefeat = null;
      if (phase === "air") {
        this.stageScroll = 0;
        this.enemySpawnCount = 0;
        this.formationTimer = 0;
        this.formationsLaunched = 0;
        this.formationGroups.clear();
        this.resetStageObjects();
        this.saveStageCheckpoint(0, "air");
      }
      if (phase === "main") {
        this.saveStageCheckpoint(0, "main");
      }
      if (phase === "preBoss") {
        this.selfDestructEnemies();
        this.warpSpawnTimer = 0.35;
        this.flash("WARNING - WARP ZONE");
      }
      if (phase === "boss") {
        this.selfDestructEnemies();
        this.capsules.length = 0;
        this.flash(`${STAGES[this.stageIndex].name} BOSS`);
      }
    }

    selfDestructEnemies() {
      for (const enemy of this.enemies) {
        this.addBurst(enemy.x, enemy.y, COLORS.amber, 0.48);
        this.addBurst(enemy.x, enemy.y, COLORS.red, 0.34);
      }
      this.enemies.length = 0;
    }

    spawnWarpEnemy() {
      const minDistance = this.width / 6;
      const x = Math.min(
        this.width - 65,
        this.player.x + minDistance + Math.random() * (this.width * 0.22),
      );
      this.enemies.push({
        type: "warpEnemy",
        x,
        y: 75 + Math.random() * (this.height - 175),
        radius: 18,
        hp: 1,
        maxHp: 1,
        state: "warp",
        warpTimer: 0.3,
        vx: 0,
        vy: 0,
        phase: Math.random() * TAU,
        scoreValue: 140,
      });
    }

    resetStageObjects() {
      const stage = STAGES[this.stageIndex];
      this.volcanoTimer = 0;
      this.sphereTimer = 0;
      this.generatorStates = (stage.generators ?? []).map((generator) => ({
        ...generator,
        id: generator.id ?? `generator-${generator.x}-${generator.side}`,
        bursts: 0,
        spawnTimer: 0,
        spawnedInBurst: 0,
        coreSpawned: false,
        coreDead: false,
      }));
      this.groundTurretStates = (stage.groundTurrets ?? []).map((turret, index) => ({
        ...turret,
        id: turret.id ?? `ground-turret-${index}-${turret.x}-${turret.side}`,
        spawned: false,
        dead: false,
      }));
      this.walkerStates = (stage.walkers ?? []).map((walker) => ({
        ...walker,
        spawned: false,
      }));
      this.jumperStates = (stage.jumpers ?? []).map((jumper) => ({
        ...jumper,
        spawned: false,
      }));
      this.laserDroneStates = (stage.laserDrones ?? []).map((drone) => ({
        ...drone,
        spawned: false,
      }));
      this.spaceAssault = stage.spaceAssault
        ? {
            waveTimer: 0.8,
            waveIndex: 0,
            smallGroupsSpawned: 0,
            mediumTimer: 4,
            mediumMachinesSpawned: 0,
            loopIndex: 0,
          }
        : null;
      this.meteorRush = stage.meteorRush
        ? {
            meteorTimer: 0.25,
            enemyTimer: 0.5,
            lateStreamY: null,
          }
        : null;
      this.bossBeams.length = 0;
      this.volcanoShots.length = 0;
    }

    updateStageCheckpoint() {
      if (this.mode !== "playing" || this.stagePhase !== "main") return;
      const quarterDuration = MAIN_DURATION / 4;
      const checkpointTime = Math.floor(this.phaseTimer / quarterDuration) * quarterDuration;
      if (checkpointTime <= 0 || checkpointTime >= MAIN_DURATION) return;
      if (
        this.stageCheckpoint?.stageIndex === this.stageIndex &&
        this.stageCheckpoint.phase === "main" &&
        this.stageCheckpoint.phaseTimer >= checkpointTime
      ) return;

      this.saveStageCheckpoint(checkpointTime, "main");
    }

    saveStageCheckpoint(phaseTimer, phase) {
      this.stageCheckpoint = {
        stageIndex: this.stageIndex,
        loopNumber: this.loopNumber,
        phase,
        phaseTimer,
        stageScroll: this.stageScroll,
        spawnTimer: this.spawnTimer,
        volcanoTimer: this.volcanoTimer,
        sphereTimer: this.sphereTimer,
        sphereSpawnCount: this.sphereSpawnCount,
        killCount: this.killCount,
        enemySpawnCount: this.enemySpawnCount,
        formationsLaunched: phase === "air" ? 0 : this.formationsLaunched,
        formationTimer: phase === "air" ? 0 : this.formationTimer,
        generatorStates: cloneState(this.generatorStates),
        groundTurretStates: cloneState(this.groundTurretStates),
        walkerStates: cloneState(this.walkerStates),
        jumperStates: cloneState(this.jumperStates),
        laserDroneStates: cloneState(this.laserDroneStates),
        spaceAssault: cloneState(this.spaceAssault),
        meteorRush: cloneState(this.meteorRush),
      };
    }

    restoreStageCheckpoint() {
      const checkpoint = this.stageCheckpoint;
      if (!checkpoint || checkpoint.stageIndex !== this.stageIndex) {
        this.enterStagePhase("air");
        return;
      }

      this.loopNumber = checkpoint.loopNumber;
      this.stagePhase = checkpoint.phase;
      this.phaseTimer = checkpoint.phaseTimer;
      this.stageScroll = checkpoint.stageScroll;
      this.spawnTimer = checkpoint.spawnTimer;
      this.volcanoTimer = checkpoint.volcanoTimer;
      this.sphereTimer = checkpoint.sphereTimer;
      this.sphereSpawnCount = checkpoint.sphereSpawnCount;
      this.killCount = checkpoint.killCount;
      this.enemySpawnCount = checkpoint.enemySpawnCount;
      this.formationsLaunched = checkpoint.formationsLaunched;
      this.formationTimer = checkpoint.formationTimer;
      this.generatorStates = cloneState(checkpoint.generatorStates);
      this.groundTurretStates = cloneState(checkpoint.groundTurretStates);
      this.walkerStates = cloneState(checkpoint.walkerStates);
      this.jumperStates = cloneState(checkpoint.jumperStates);
      this.laserDroneStates = cloneState(checkpoint.laserDroneStates);
      this.spaceAssault = cloneState(checkpoint.spaceAssault);
      this.meteorRush = cloneState(checkpoint.meteorRush);
      this.formationGroups.clear();
      this.bossSpawned = false;
      this.bossDefeat = null;
    }

    updateStageObjects(dt) {
      const stage = STAGES[this.stageIndex];
      if (
        (this.mode !== "playing" && this.mode !== "crashing") ||
        this.stagePhase !== "main" ||
        (
          !stage.terrainMode &&
          !stage.sphereSpawner &&
          !stage.jumpers &&
          !stage.laserDrones &&
          !stage.groundTurrets &&
          !stage.spaceAssault &&
          !stage.meteorRush
        )
      ) return;

      if (!stage.spaceAssault && !stage.meteorRush) this.stageScroll += 92 * dt;
      this.updateSpaceAssault(dt, stage);
      this.updateMeteorRush(dt, stage);
      this.updateVolcano(dt, stage);
      this.updateGenerators(dt);
      this.updateGroundTurretSpawns();
      this.updateWalkerSpawns();
      this.updateJumperSpawns();
      this.updateLaserDroneSpawns();
      this.updateSphereSpawner(dt, stage);
    }

    updateMeteorRush(dt, stage) {
      if (!stage.meteorRush || !this.meteorRush) return;

      const rush = this.meteorRush;
      const finalDuration = stage.meteorRush.finalDuration ?? 25;
      const isFinalRush = this.phaseTimer >= MAIN_DURATION - finalDuration;

      rush.meteorTimer -= dt;
      if (rush.meteorTimer <= 0) {
        rush.meteorTimer = stage.meteorRush.meteorInterval ?? 0.72;
        this.spawnMeteor();
      }

      if (isFinalRush && rush.lateStreamY == null) {
        rush.lateStreamY = 110 + Math.random() * (this.height - 260);
      }

      rush.enemyTimer -= dt;
      if (rush.enemyTimer > 0) return;

      rush.enemyTimer = isFinalRush
        ? (stage.meteorRush.finalEnemyInterval ?? 0.2)
        : (stage.meteorRush.enemyInterval ?? 0.5);
      this.spawnMeteorRaider(isFinalRush, rush.lateStreamY);
    }

    spawnMeteor() {
      const verticalDirection = Math.random() < 0.5 ? -1 : 1;
      const radius = 36 + Math.random() * 56;
      const hp = Math.max(2, Math.ceil(radius / 10));
      this.enemies.push({
        type: "meteor",
        x: this.width + radius + 20,
        y: 75 + Math.random() * (this.height - 175),
        vx: -185 - Math.random() * 115,
        vy: verticalDirection * (18 + Math.random() * 38),
        radius,
        hp,
        maxHp: hp,
        spin: Math.random() * TAU,
        spinSpeed: (Math.random() - 0.5) * 5,
        fireTimer: 999,
        scoreValue: 70 + Math.round(radius * 3),
      });
    }

    spawnMeteorRaider(isFinalRush, streamY) {
      this.enemies.push({
        type: "meteorRaider",
        x: this.width + 50,
        y: isFinalRush ? streamY : 85 + Math.random() * (this.height - 205),
        vx: isFinalRush ? -610 : -520,
        radius: 17,
        hp: 1,
        maxHp: 1,
        fireTimer: 0.04,
        shotInterval: isFinalRush ? 0.36 : 0.48,
        aimBehind: isFinalRush,
        phase: Math.random() * TAU,
        scoreValue: 90,
      });
    }

    updateSpaceAssault(dt, stage) {
      if (!stage.spaceAssault || !this.spaceAssault) return;

      const assault = this.spaceAssault;
      const smallGroupsPerLoop = stage.spaceAssault.smallGroupsPerLoop ?? 16;
      const mediumCountPerLoop = stage.spaceAssault.mediumCountPerLoop ?? 4;

      if (assault.smallGroupsSpawned < smallGroupsPerLoop) assault.waveTimer -= dt;
      if (assault.waveTimer <= 0 && assault.smallGroupsSpawned < smallGroupsPerLoop) {
        this.spawnSpaceFighterWave(assault.waveIndex);
        assault.waveIndex += 1;
        assault.smallGroupsSpawned += 1;
        assault.waveTimer = stage.spaceAssault.waveInterval ?? 1.65;
      }

      if (assault.mediumMachinesSpawned < mediumCountPerLoop) assault.mediumTimer -= dt;
      if (assault.mediumTimer <= 0 && assault.mediumMachinesSpawned < mediumCountPerLoop) {
        this.spawnSpaceCruiser(assault.mediumMachinesSpawned);
        assault.mediumMachinesSpawned += 1;
        assault.mediumTimer = stage.spaceAssault.mediumSpawnInterval ?? 6;
      }

      if (
        assault.smallGroupsSpawned < smallGroupsPerLoop ||
        assault.mediumMachinesSpawned < mediumCountPerLoop
      ) return;

      const encounterEnemiesRemain = this.enemies.some(
        (enemy) => enemy.type === "spaceFighter" || enemy.type === "spaceCruiser",
      );
      const encounterLasersRemain = this.bossBeams.some((beam) => beam.type === "cruiserLaser");
      if (encounterEnemiesRemain || encounterLasersRemain) return;

      assault.loopIndex += 1;
      if (assault.loopIndex >= (stage.spaceAssault.loopCount ?? 2)) {
        this.enterStagePhase("preBoss");
        return;
      }

      assault.waveTimer = 0.8;
      assault.waveIndex = 0;
      assault.smallGroupsSpawned = 0;
      assault.mediumTimer = 4;
      assault.mediumMachinesSpawned = 0;
      this.flash(`ASSAULT LOOP ${assault.loopIndex + 1}`);
    }

    spawnSpaceFighterWave(waveIndex) {
      const pattern = STAGES[this.stageIndex].spaceAssault?.wavePattern ??
        ["top", "bottom", "top", "bottom", "top", "bottom", "bottom", "top"];
      const side = pattern[waveIndex % pattern.length];
      const targetRows = [0.25, 0.5, 0.75, 0.5];
      const waveId = this.nextSpaceWaveId;
      const waveStartTime = this.time;
      const enterDuration = 1.25;
      this.nextSpaceWaveId += 1;

      for (let index = 0; index < 4; index += 1) {
        const startY = side === "top" ? -42 : this.height + 42;
        this.enemies.push({
          type: "spaceFighter",
          waveId,
          waveStartTime,
          x: this.width * (1 - (index + 1) / 8),
          y: startY,
          startY,
          targetY: this.height * targetRows[index],
          enterDuration,
          fireAt: waveStartTime + enterDuration + 0.3,
          exitAt: waveStartTime + enterDuration + 0.8,
          side,
          state: "enter",
          radius: 17,
          hp: 1,
          maxHp: 1,
          phase: index * 0.7,
          scoreValue: 100,
        });
      }
    }

    spawnSpaceCruiser(order) {
      const cruiserId = this.nextCruiserId;
      this.nextCruiserId += 1;
      this.enemies.push({
        type: "spaceCruiser",
        cruiserId,
        x: this.width + 110,
        y: this.height * (0.32 + (order % 2) * 0.36),
        targetX: this.width * 0.75,
        targetY: this.height * (0.32 + (order % 2) * 0.36),
        state: "enter",
        radius: 52,
        hp: 34,
        maxHp: 34,
        fireTimer: 0.7,
        laserCount: 0,
        moveDirection: order % 2 === 0 ? 1 : -1,
        phase: 0,
        scoreValue: 1200,
      });
    }

    updateVolcano(dt, stage) {
      const volcano = (stage.mountains ?? []).find((mountain) => mountain.kind === "volcano");
      if (!volcano) return;

      const x = this.stageObjectX(volcano);
      const stopX = volcano.lockX == null ? -Infinity : this.width * volcano.lockX;
      if (x <= stopX) return;
      if (x < -80 || x > this.width + 80) return;

      this.volcanoTimer -= dt;
      if (this.volcanoTimer > 0) return;

      this.volcanoTimer = volcano.fireInterval ?? 1 / 15;
      const side = stage.terrainMode === "inverted" ? "top" : "bottom";
      const y = this.stageSurfaceY(x, side);
      const direction = side === "bottom" ? -1 : 1;
      this.enemies.push({
        type: "volcanoRock",
        x,
        y,
        vx: -65 + Math.random() * 130,
        vy: direction * (290 + Math.random() * 120),
        ay: -direction * 320,
        radius: 7,
        hp: 1,
        maxHp: 1,
        fireTimer: 999,
        scoreValue: 20,
        spin: Math.random() * TAU,
      });
    }

    updateSphereSpawner(dt, stage) {
      if (!stage.sphereSpawner) return;

      this.sphereTimer -= dt;
      if (this.sphereTimer > 0) return;

      this.sphereTimer = stage.sphereSpawner.interval ?? 0.5;
      this.sphereSpawnCount += 1;
      const variant = this.sphereSpawnCount % 8 === 0 ? "red" : "blue";
      this.spawnSphereEnemy(this.width + 42, 42, 5, -120 - Math.random() * 80, 50 + Math.random() * 60, variant);
    }

    spawnSphereEnemy(x, y, tier, vx, vy, variant = "blue") {
      const scale = 2 ** (tier - 1);
      const hp = Math.max(1, Math.ceil(scale * 0.5));
      this.enemies.push({
        type: "sphere",
        tier,
        variant,
        x,
        y,
        vx,
        vy,
        radius: 8 * scale,
        hp,
        maxHp: hp,
        fireTimer: 999,
        scoreValue: 25 * scale,
        spin: Math.random() * TAU,
      });
    }

    updateGenerators(dt) {
      for (const generator of this.generatorStates) {
        const x = generator.x - this.stageScroll;
        const side = generator.side;
        const y = this.stageSurfaceY(x, side);
        if (!generator.coreSpawned && x > -140 && x < this.width + 140) {
          generator.coreSpawned = true;
          this.enemies.push({
            type: "generatorCore",
            generatorId: generator.id,
            x,
            y,
            side,
            radius: 30,
            halfWidth: 60,
            hp: 14,
            maxHp: 14,
            fireTimer: 999,
            phase: 0,
            scoreValue: 500,
          });
        }

        if (generator.coreDead || x < -120 || x > this.width + 120 || generator.bursts >= 2) continue;

        generator.spawnTimer -= dt;
        if (generator.spawnTimer > 0) continue;

        generator.spawnTimer = 0.17;
        this.enemies.push({
          type: "generator",
          x,
          y,
          side,
          vx: -95,
          radius: 16,
          fireTimer: 999,
          phase: Math.random() * TAU,
          scoreValue: 80,
          state: "drop",
        });

        generator.spawnedInBurst += 1;
        if (generator.spawnedInBurst >= 8) {
          generator.spawnedInBurst = 0;
          generator.bursts += 1;
          generator.spawnTimer = 1.2;
        }
      }
    }

    updateGroundTurretSpawns() {
      for (const turret of this.groundTurretStates) {
        if (turret.spawned || turret.dead) continue;
        const x = turret.x - this.stageScroll;
        if (x < -90 || x > this.width + 90) continue;

        turret.spawned = true;
        this.enemies.push({
          type: "groundTurret",
          turretId: turret.id,
          anchorX: turret.x,
          side: turret.side,
          x,
          y: this.stageSurfaceY(x, turret.side),
          radius: 21,
          hp: 6,
          maxHp: 6,
          fireTimer: 0.75 + Math.random() * 0.45,
          phase: Math.random() * TAU,
          scoreValue: 240,
        });
      }
    }

    updateWalkerSpawns() {
      for (const walker of this.walkerStates) {
        if (walker.spawned || this.phaseTimer < walker.delay) continue;

        walker.spawned = true;
        this.enemies.push({
          type: "walker",
          x: -40,
          y: this.stageSurfaceY(-40, walker.side),
          side: walker.side,
          vx: 155,
          radius: 18,
          fireTimer: 0,
          stopTimer: 0,
          walkTimer: 2.2,
          directionTimer: 0,
          walkDir: 1,
          shotsLeft: 0,
          shotAngles: [],
          state: "chase",
          phase: Math.random() * TAU,
          scoreValue: 150,
        });
      }
    }

    updateJumperSpawns() {
      for (const jumper of this.jumperStates) {
        if (jumper.spawned || this.phaseTimer < jumper.delay) continue;

        jumper.spawned = true;
        const side = jumper.side ?? "bottom";
        const fromLeft = jumper.fromLeft ?? Math.random() < 0.35;
        const x = jumper.screenX ?? (fromLeft ? -70 : this.width + 70);
        const y = this.stageSurfaceY(x, side);
        const gravityDir = side === "top" ? -1 : 1;
        this.enemies.push({
          type: "jumper",
          x,
          y,
          side,
          gravityDir,
          vx: fromLeft ? 145 : -145,
          vy: 0,
          radius: 19,
          fireTimer: 999,
          jumpIndex: 0,
          onGround: true,
          burstAtApex: false,
          phase: Math.random() * TAU,
          scoreValue: 180,
        });
      }
    }

    updateLaserDroneSpawns() {
      for (const drone of this.laserDroneStates) {
        if (drone.spawned || this.phaseTimer < drone.delay) continue;

        drone.spawned = true;
        this.enemies.push({
          type: "laserDrone",
          x: this.width + 70,
          y: drone.y,
          vx: -120,
          radius: 19,
          fireTimer: 0.35,
          burstShots: 0,
          burstPause: 0,
          phase: Math.random() * TAU,
          scoreValue: 160,
        });
      }
    }

    spawnFormation(order) {
      const groupId = this.nextFormationId;
      this.nextFormationId += 1;
      const fromTop = order % 2 === 0;
      const y = fromTop ? 92 : this.height - 160;
      this.formationGroups.set(groupId, {
        remaining: FORMATION_SIZE,
        completed: false,
        state: "in",
        x: this.width + 96,
        y,
        fromTop,
        nextIndex: 0,
        spawnTimer: 0,
      });
    }

    updateFormationSpawners(dt) {
      for (const [groupId, group] of this.formationGroups) {
        if (group.nextIndex >= FORMATION_SIZE) continue;

        group.spawnTimer -= dt;
        if (group.spawnTimer > 0) continue;

        group.spawnTimer = 0.18;
        this.spawnFormationMember(groupId, group, group.nextIndex);
        group.nextIndex += 1;
      }
    }

    spawnFormationMember(groupId, group, index) {
      this.enemies.push({
        type: "formation",
        groupId,
        formationIndex: index,
        trailGap: index * 32,
        x: group.x + index * 32,
        y: group.y,
        baseY: group.y,
        vx: -230,
        state: "in",
        radius: 17,
        fireTimer: 999,
        phase: Math.random() * TAU,
        scoreValue: 50,
        capsuleMode: "formation",
      });
    }

    spawnBoss() {
      this.bossSpawned = true;
      const baseHp = 90 + this.stageIndex * 18;
      const hp = Math.ceil(baseHp * (1 + 0.25 * (this.loopNumber - 1)));
      this.enemies.push({
        type: "boss",
        x: this.width - 190,
        y: this.height * 0.5,
        vx: 0,
        vy: 0,
        radius: 55,
        halfWidth: 78,
        halfHeight: 48,
        hp,
        maxHp: hp,
        moveTimer: 3,
        stopTimer: 0,
        laserTimer: 0,
        state: "move",
        laserFired: false,
        phase: 0,
        scoreValue: 3000,
        capsuleMode: "none",
      });
    }

    clearStage() {
      this.addBurst(this.width * 0.72, this.height * 0.5, COLORS.lime, 0.9);
      this.stageIndex += 1;
      if (this.stageIndex >= STAGES.length) {
        this.loopNumber += 1;
        this.stageIndex = 0;
      }

      this.enemies.length = 0;
      this.souls.length = 0;
      this.bossBeams.length = 0;
      this.volcanoShots.length = 0;
      this.capsules.length = 0;
      this.enterStagePhase("air");
      this.flash(
        this.stageIndex === 0 && this.loopNumber > 1
          ? `LOOP ${this.loopNumber} - STAGE 1`
          : `${STAGES[this.stageIndex].name} START`,
      );
    }

    startBossDefeat(enemy) {
      this.stagePhase = "bossClear";
      this.phaseTimer = 0;
      this.bossSpawned = false;
      this.bossDefeat = {
        x: enemy.x,
        y: enemy.y,
        timer: 0,
        burstTimer: 0,
      };
      this.enemies.length = 0;
      this.souls.length = 0;
      this.bossBeams.length = 0;
      this.volcanoShots.length = 0;
      this.flash("BOSS DOWN");
    }

    updateBossDefeat(dt) {
      if (!this.bossDefeat) return;

      this.bossDefeat.timer += dt;
      this.bossDefeat.burstTimer -= dt;
      if (this.bossDefeat.timer < 2 && this.bossDefeat.burstTimer <= 0) {
        this.bossDefeat.burstTimer = 0.14 + Math.random() * 0.08;
        const angle = Math.random() * TAU;
        const radius = 16 + Math.random() * 76;
        const x = this.bossDefeat.x + Math.cos(angle) * radius;
        const y = this.bossDefeat.y + Math.sin(angle) * radius;
        this.addBurst(x, y, Math.random() > 0.45 ? COLORS.amber : COLORS.pink, 0.55 + Math.random() * 0.4);
      }

      if (this.bossDefeat.timer >= 3) {
        this.bossDefeat = null;
        this.clearStage();
      }
    }

    enterLoopClear() {
      this.mode = "loopclear";
      this.loopClearTimer = 0;
      this.enemies.length = 0;
      this.souls.length = 0;
      this.bossBeams.length = 0;
      this.volcanoShots.length = 0;
      this.capsules.length = 0;
      this.playerShots.length = 0;
      this.missiles.length = 0;
      this.lasers.length = 0;
      this.flash("1 LOOP CLEAR");
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
      const speed = 290 + this.player.speedLevel * 52;
      const length = Math.hypot(input.x, input.y) || 1;
      this.player.moving = Math.abs(input.x) > 0.01 || Math.abs(input.y) > 0.01;
      this.player.x += (input.x / length) * speed * dt;
      this.player.y += (input.y / length) * speed * dt;
      this.player.x = clamp(this.player.x, 55, this.width * 0.62);
      this.player.y = clamp(this.player.y, 58, this.height - 86);
      this.player.cooldown = Math.max(0, this.player.cooldown - dt);
      this.player.missileCooldown = Math.max(0, this.player.missileCooldown - dt);
      this.player.invincible = Math.max(0, this.player.invincible - dt);
      if (this.player.moving) this.recordTrail(dt);
      this.resolvePlayerTerrainCollision();

      if (input.activate && !this.activateWasHeld) this.activatePowerup();
      this.activateWasHeld = input.activate;
    }

    resolvePlayerTerrainCollision() {
      if (!this.isStageTerrainActive() || this.player.invincible > 0) return;
      if (STAGES[this.stageIndex].spaceAssault || STAGES[this.stageIndex].meteorRush) return;

      const terrainSlack = 6;
      const terrainHitRadius = this.player.hitRadius;
      const stage = STAGES[this.stageIndex];
      if (
        this.pointHitsDiamondTerrain(this.player.x, this.player.y, terrainHitRadius - terrainSlack) ||
        this.pointHitsCircleTerrain(this.player.x, this.player.y, terrainHitRadius - terrainSlack)
      ) {
        this.damagePlayerFromTerrain();
        return;
      }

      if (stage.terrainMode !== "normal" && stage.terrainMode !== "inverted") {
        const bottom = this.terrainY(this.player.x) - terrainHitRadius + terrainSlack;
        if (this.player.y <= bottom) return;
        this.damagePlayerFromTerrain(bottom);
        return;
      }

      const top = this.stageSurfaceY(this.player.x, "top") + terrainHitRadius - terrainSlack;
      const bottom = this.stageSurfaceY(this.player.x, "bottom") - terrainHitRadius + terrainSlack;
      const hitTop = this.player.y < top;
      const hitBottom = this.player.y > bottom;
      if (!hitTop && !hitBottom) return;

      this.damagePlayerFromTerrain(hitTop ? top + 4 : bottom - 4);
    }

    damagePlayerFromTerrain(pushY = this.player.y) {
      if (this.player.shield > 0) {
        this.player.shield = Math.max(0, this.player.shield - 2);
        this.player.invincible = 0.35;
        this.player.y = pushY;
        this.addBurst(this.player.x, this.player.y, COLORS.blue, 0.28);
        return;
      }

      this.damagePlayer();
    }

    startGame(startStageIndex = 0) {
      this.mode = "ready";
      this.lives = 3;
      this.score = 0;
      this.runTime = 0;
      this.loopNumber = 1;
      this.stageIndex = clamp(Math.floor(startStageIndex), 0, STAGES.length - 1);
      this.stagePhase = "air";
      this.phaseTimer = 0;
      this.stageScroll = 0;
      this.formationTimer = 0;
      this.formationsLaunched = 0;
      this.formationGroups.clear();
      this.bossSpawned = false;
      this.bossDefeat = null;
      this.resetStageObjects();
      this.saveStageCheckpoint(0, "air");
      this.loopClearTimer = 0;
      this.killCount = 0;
      this.powerCapsules = 0;
      this.enemies.length = 0;
      this.souls.length = 0;
      this.bossBeams.length = 0;
      this.volcanoShots.length = 0;
      this.capsules.length = 0;
      this.playerShots.length = 0;
      this.missiles.length = 0;
      this.lasers.length = 0;
      this.options.length = 0;
      this.smoke.length = 0;
      this.gameOverTimer = 0;
      this.gameOverCanConfirm = false;
      this.respawnPowerCapsules = 0;
      this.readyTimer = 3;
      this.crashExplosionTimer = 0;
      this.startWasHeld = true;
      Object.assign(this.player, {
        x: 55,
        y: this.height * 0.5,
        cooldown: 0,
        missileCooldown: 0,
        invincible: RESPAWN_INVINCIBLE,
        speedLevel: 1,
        missile: false,
        double: false,
        laser: false,
        shield: 0,
        moving: false,
        crashing: false,
        crashVy: 0,
        crashSpin: 0,
        crashTimer: 0,
        crashStartY: 0,
        crashSmokeTimer: 0,
        angle: 0,
        trail: [],
      });
      this.flash("READY");
    }

    updateReady(dt) {
      this.readyTimer = Math.max(0, this.readyTimer - dt);
      if (this.readyTimer > 0) return;

      this.mode = "playing";
      this.player.invincible = RESPAWN_INVINCIBLE;
      this.flash("GO");
    }

    updateRespawn(dt) {
      this.respawnTimer -= dt;
      if (this.respawnTimer > 0) return;

      this.mode = "playing";
      this.player.x = 55;
      this.player.y = this.height * 0.5;
      this.player.invincible = RESPAWN_INVINCIBLE;
      this.player.trail = [];
      this.player.moving = false;
      this.player.crashing = false;
      this.player.crashVy = 0;
      this.player.crashSpin = 0;
      this.player.crashTimer = 0;
      this.player.crashStartY = 0;
      this.player.crashSmokeTimer = 0;
      this.player.angle = 0;
      this.powerCapsules = this.respawnPowerCapsules;
      this.respawnPowerCapsules = 0;
      this.flash("READY");
    }

    updateCrash(dt) {
      this.player.crashTimer += dt;
      this.player.crashSmokeTimer -= dt;
      this.player.angle = -0.08;

      if (this.player.crashSmokeTimer <= 0) {
        this.player.crashSmokeTimer = 0.1;
        this.addCrashSmoke();
      }

      const stage = STAGES[this.stageIndex];
      const spaceStage = Boolean(stage.spaceAssault || stage.meteorRush);
      const targetY = spaceStage
        ? Math.min(this.height - 105, this.player.crashStartY + this.height * 0.28)
        : this.crashSurfaceY();
      const progress = clamp(this.player.crashTimer / CRASH_DURATION, 0, 1);
      const easedProgress = progress * progress;
      this.player.y = this.player.crashStartY + (targetY - this.player.crashStartY) * easedProgress;

      if (progress < 1) return;

      this.player.y = targetY;
      this.addBurst(this.player.x, this.player.y, COLORS.cyan, 1.1);
      this.addBurst(this.player.x + 16, this.player.y - 8, COLORS.amber, 0.72);
      this.addBurst(this.player.x - 12, this.player.y + 6, COLORS.red, 0.58);
      this.player.crashing = false;

      if (this.lives <= 0) {
        this.enterGameOver();
        return;
      }

      this.enemies.length = 0;
      this.souls.length = 0;
      this.bossBeams.length = 0;
      this.volcanoShots.length = 0;
      this.capsules.length = 0;
      this.playerShots.length = 0;
      this.missiles.length = 0;
      this.lasers.length = 0;
      this.restoreStageCheckpoint();
      this.mode = "crashExplosion";
      this.crashExplosionTimer = 0.7;
    }

    updateCrashExplosion(dt) {
      this.crashExplosionTimer = Math.max(0, this.crashExplosionTimer - dt);
      this.updateBursts(dt);
      this.updateSmoke(dt);
      if (this.crashExplosionTimer > 0) return;

      this.bursts.length = 0;
      this.smoke.length = 0;
      this.player.x = 55;
      this.player.y = this.height * 0.5;
      this.player.angle = 0;
      this.player.crashing = false;
      this.player.invincible = RESPAWN_INVINCIBLE;
      this.player.trail = [];
      this.mode = "ready";
      this.readyTimer = 3;
    }

    crashSurfaceY() {
      const stage = STAGES[this.stageIndex];
      if (stage.terrainMode === "normal" || stage.terrainMode === "inverted") {
        return this.stageSurfaceY(this.player.x, "bottom") - 18;
      }
      return this.terrainY(this.player.x) - 18;
    }

    addCrashSmoke() {
      this.smoke.push({
        x: this.player.x - 18 + (Math.random() - 0.5) * 8,
        y: this.player.y + (Math.random() - 0.5) * 8,
        vx: -28 - Math.random() * 34,
        vy: -16 - Math.random() * 28,
        radius: 4 + Math.random() * 5,
        age: 0,
        life: 0.9 + Math.random() * 0.55,
      });
    }

    updateSmoke(dt) {
      for (const particle of this.smoke) {
        particle.age += dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.radius += 9 * dt;
        particle.vx *= 0.985;
        particle.vy *= 0.985;
      }
      removeWhere(this.smoke, (particle) => particle.age >= particle.life);
    }

    updateGameOver(dt, input) {
      this.gameOverTimer += dt;
      const startHeld = input.start || input.fire || input.activate;

      if (!startHeld) this.gameOverCanConfirm = true;
      if ((startHeld && this.gameOverCanConfirm) || this.gameOverTimer >= 15) {
        this.mode = "title";
        this.lives = 3;
        this.score = 0;
        this.powerCapsules = 0;
        this.respawnPowerCapsules = 0;
        this.bursts.length = 0;
        this.startWasHeld = startHeld;
      }
    }

    updateLoopClear(dt, input) {
      this.loopClearTimer += dt;
      const startHeld = input.start || input.fire || input.activate;
      if ((startHeld && !this.startWasHeld) || this.loopClearTimer >= 15) {
        this.mode = "title";
        this.stageIndex = 0;
        this.enterStagePhase("air");
        this.lives = 3;
        this.score = 0;
        this.powerCapsules = 0;
        this.bursts.length = 0;
      }
      this.startWasHeld = startHeld;
    }

    recordTrail(dt) {
      this.player.trailTimer = (this.player.trailTimer ?? 0) - dt;
      if (this.player.trailTimer <= 0) {
        this.player.trailTimer = 0.045;
        this.player.trail.unshift({ x: this.player.x, y: this.player.y });
        this.player.trail.length = Math.min(120, this.player.trail.length);
      }
    }

    updateOptions() {
      if (!this.player.moving) return;

      for (let index = 0; index < this.options.length; index += 1) {
        const sample = this.player.trail[(index + 1) * 8];
        if (sample) {
          this.options[index].x += (sample.x - this.options[index].x) * 0.26;
          this.options[index].y += (sample.y - this.options[index].y) * 0.26;
        }
      }
    }

    updateSpawns(dt) {
      if (
        (this.mode !== "playing" && this.mode !== "crashing") ||
        this.stagePhase !== "main"
      ) return;
      if (STAGES[this.stageIndex].sphereSpawner) return;
      if (STAGES[this.stageIndex].laserDrones) return;
      if (STAGES[this.stageIndex].spaceAssault) return;
      if (STAGES[this.stageIndex].meteorRush) return;

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const d = this.difficulty();
        this.spawnTimer = 1.35 - d * 0.86 + Math.random() * (0.45 - d * 0.25);
        this.enemies.push({
          x: this.width + 55,
          y: 90 + Math.random() * (this.height - 210),
          vx: -180 - d * 105 - Math.random() * 105,
          radius: 22,
          fireTimer: 1.7 - d * 0.75 + Math.random() * 1.15,
          phase: Math.random() * TAU,
        });
      }
    }

    updateWeapons(dt, input) {
      this.updateShots(dt);
      this.updateMissiles(dt);
      this.updateLasers(dt, input);

      if (this.lives <= 0 || !input.fire) return;

      const emitters = [this.player, ...this.options];
      if (!this.player.laser && this.player.cooldown <= 0) {
        this.player.cooldown = 0.13;
        for (const emitter of emitters) this.fireShotPattern(emitter);
      }

      if (this.player.missile && this.player.missileCooldown <= 0) {
        this.player.missileCooldown = 0.38;
        for (const emitter of emitters) this.dropMissile(emitter);
      }
    }

    fireShotPattern(emitter) {
      const emitterId = emitter.id ?? "player";
      const emitterShots = this.playerShots.filter((shot) => shot.emitterId === emitterId);
      const horizontalCount = emitterShots.filter((shot) => shot.shotKind === "horizontal").length;

      if (this.player.double) {
        const diagonalCount = emitterShots.filter((shot) => shot.shotKind === "diagonal").length;
        if (horizontalCount < 2) {
          this.playerShots.push({
            emitterId,
            shotKind: "horizontal",
            x: emitter.x + 25,
            y: emitter.y,
            vx: 760,
            vy: 0,
            radius: 5,
            age: 0,
          });
        }
        if (diagonalCount < 2) {
          this.playerShots.push({
            emitterId,
            shotKind: "diagonal",
            x: emitter.x + 18,
            y: emitter.y - 7,
            vx: 610,
            vy: -360,
            radius: 5,
            age: 0,
          });
        }
        return;
      }

      if (horizontalCount >= 4) return;
      this.playerShots.push({
        emitterId,
        shotKind: "horizontal",
        x: emitter.x + 25,
        y: emitter.y,
        vx: 760,
        vy: 0,
        radius: 5,
        age: 0,
      });
    }

    dropMissile(emitter) {
      const emitterId = emitter.id ?? "player";
      if (this.missiles.some((missile) => missile.emitterId === emitterId)) return;

      this.missiles.push({
        emitterId,
        x: emitter.x + 8,
        y: emitter.y + 16,
        vx: 250,
        vy: 250,
        radius: 7,
        grounded: false,
      });
    }

    updateLasers(dt, input) {
      for (const laser of this.lasers) {
        const emitter = this.findEmitter(laser.emitterId);
        if (laser.phase === "grow") {
          if (!input.fire) {
            laser.dead = true;
            continue;
          }

          if (emitter) {
            laser.x = emitter.x + 24;
            laser.y = emitter.y;
          }

          laser.length = Math.min(this.width, laser.length + LASER_GROW_SPEED * dt);
          if (laser.length >= this.width) laser.phase = "locked";
        } else {
          laser.x += 620 * dt;
        }
      }

      this.clipLasersToTerrain();
      removeWhere(this.lasers, (laser) => laser.dead || laser.x > this.width + 40);

      if (!this.player.laser || !input.fire || this.lasers.length > 0 || this.lives <= 0) return;

      for (const emitter of [this.player, ...this.options]) {
        this.lasers.push({
          emitterId: emitter.id ?? "player",
          x: emitter.x + 24,
          y: emitter.y,
          length: 20,
          radius: 10,
          phase: "grow",
        });
      }
    }

    findEmitter(id) {
      if (id === "player") return this.player;
      return this.options.find((option) => option.id === id);
    }

    updateShots(dt) {
      for (const shot of this.playerShots) {
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        shot.age += dt;
        if (this.pointHitsTerrain(shot.x, shot.y)) shot.dead = true;
      }
      removeWhere(this.playerShots, (shot) => shot.dead || shot.x > this.width + 70 || shot.y < -70);
    }

    clipLasersToTerrain() {
      if (!this.isStageTerrainActive()) return;

      for (const laser of this.lasers) {
        let clipped = laser.length;
        for (let offset = 0; offset <= laser.length; offset += 12) {
          if (this.pointHitsTerrain(laser.x + offset, laser.y)) {
            clipped = Math.max(0, offset - 8);
            break;
          }
        }
        laser.length = Math.min(laser.length, clipped);
        if (laser.length <= 0) laser.dead = true;
      }
    }

    updateMissiles(dt) {
      for (const missile of this.missiles) {
        missile.x += missile.vx * dt;
        const floor = this.terrainY(missile.x) - 8;
        if (missile.y < floor && !missile.grounded) {
          missile.y += missile.vy * dt;
        } else {
          missile.grounded = true;
          missile.y += (floor - missile.y) * 0.45;
          missile.vx = 330;
        }
      }
      removeWhere(this.missiles, (missile) => missile.x > this.width + 60);
    }

    updateEnemies(dt) {
      dt *= this.loopDifficultyMultiplier();
      const d = this.difficulty();
      for (const enemy of this.enemies) {
        this.assignEnemyCapsuleState(enemy);

        if (enemy.type === "warpEnemy") {
          this.updateWarpEnemy(enemy, dt);
          continue;
        }

        if (enemy.type === "formation") {
          this.updateFormationEnemy(enemy, dt);
          continue;
        }

        if (enemy.type === "boss") {
          this.updateBoss(enemy, dt);
          continue;
        }

        if (enemy.type === "generator") {
          this.updateGeneratorEnemy(enemy, dt);
          continue;
        }

        if (enemy.type === "generatorCore") {
          this.updateGeneratorCore(enemy);
          continue;
        }

        if (enemy.type === "groundTurret") {
          this.updateGroundTurretEnemy(enemy, dt);
          continue;
        }

        if (enemy.type === "walker") {
          this.updateWalkerEnemy(enemy, dt);
          continue;
        }

        if (enemy.type === "jumper") {
          this.updateJumperEnemy(enemy, dt);
          continue;
        }

        if (enemy.type === "laserDrone") {
          this.updateLaserDroneEnemy(enemy, dt);
          continue;
        }

        if (enemy.type === "spaceFighter") {
          this.updateSpaceFighter(enemy, dt);
          continue;
        }

        if (enemy.type === "spaceCruiser") {
          this.updateSpaceCruiser(enemy, dt);
          continue;
        }

        if (enemy.type === "meteor") {
          this.updateMeteorEnemy(enemy, dt);
          continue;
        }

        if (enemy.type === "meteorRaider") {
          this.updateMeteorRaider(enemy, dt);
          continue;
        }

        if (enemy.type === "volcanoRock") {
          this.updateVolcanoRock(enemy, dt);
          continue;
        }

        if (enemy.type === "sphere") {
          this.updateSphereEnemy(enemy, dt);
          continue;
        }

        enemy.x += enemy.vx * dt;
        enemy.y += Math.sin(this.time * 2.3 + enemy.phase) * 42 * dt;
        enemy.fireTimer -= dt;

        if (
          enemy.fireTimer <= 0 &&
          (this.mode === "playing" || this.mode === "crashing")
        ) {
          enemy.fireTimer = 2.5 - d * 1.45 + Math.random() * (1.25 - d * 0.45);
          if (Math.random() > 0.35 + d * 0.65) continue;

          const dx = this.player.x - enemy.x;
          const dy = this.player.y - enemy.y;
          const length = Math.hypot(dx, dy) || 1;
          const speed = 175 + d * 70 + Math.random() * 45;
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
      this.resolveSphereCollisions();
      removeWhere(this.enemies, (enemy) => {
        if (enemy.type === "formation") {
          return enemy.x < -120 || enemy.y < -140 || enemy.y > this.height + 140 || (enemy.state === "out" && enemy.x > this.width + 90);
        }

        return enemy.x < -120 || enemy.x > this.width + 160 || enemy.y < -140 || enemy.y > this.height + 140;
      });
    }

    updateVolcanoRock(enemy, dt) {
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.vy += enemy.ay * dt;
      enemy.spin += dt * 8;
    }

    updateMeteorEnemy(enemy, dt) {
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.spin += enemy.spinSpeed * dt;
    }

    updateMeteorRaider(enemy, dt) {
      enemy.x += enemy.vx * dt;
      enemy.fireTimer -= dt;
      if (
        enemy.fireTimer > 0 ||
        (this.mode !== "playing" && this.mode !== "crashing")
      ) return;

      enemy.fireTimer = enemy.shotInterval;
      const targetX = this.player.x - (enemy.aimBehind ? 72 : 0);
      const dx = targetX - enemy.x;
      const dy = this.player.y - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      this.souls.push({
        x: enemy.x - 16,
        y: enemy.y,
        vx: (dx / length) * 142.5,
        vy: (dy / length) * 142.5,
        radius: 9,
        spin: Math.random() * TAU,
      });
    }

    assignEnemyCapsuleState(enemy) {
      if (enemy.capsuleStateAssigned) return;
      enemy.capsuleStateAssigned = true;
      if (
        enemy.type === "formation" ||
        enemy.type === "boss" ||
        enemy.type === "meteor" ||
        enemy.type === "volcanoRock" ||
        enemy.capsuleMode === "none"
      ) return;

      this.enemySpawnCount += 1;
      enemy.carriesCapsule =
        (enemy.type === "sphere" && enemy.variant === "red" && enemy.tier <= 2) ||
        this.enemySpawnCount % 10 === 0;
    }

    updateWarpEnemy(enemy, dt) {
      enemy.phase += dt * 9;
      if (enemy.state === "warp") {
        enemy.warpTimer -= dt;
        if (enemy.warpTimer > 0) return;

        const dx = this.player.x - enemy.x;
        const dy = this.player.y - enemy.y;
        const length = Math.hypot(dx, dy) || 1;
        const speed = 650;
        enemy.vx = (dx / length) * speed;
        enemy.vy = (dy / length) * speed;
        enemy.state = "rush";
        return;
      }

      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
    }

    updateSphereEnemy(enemy, dt) {
      const gravity = STAGES[this.stageIndex].sphereSpawner?.gravity ?? 280;
      const bounce = STAGES[this.stageIndex].sphereSpawner?.bounce ?? 0.82;
      enemy.vy += gravity * dt;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.spin += enemy.vx * dt * 0.02;

      const floor = this.terrainY(enemy.x) - enemy.radius;
      if (enemy.y > floor) {
        enemy.y = floor;
        enemy.vy = -Math.abs(enemy.vy) * bounce;
        enemy.vx *= 0.98;
      }

    }

    resolveSphereCollisions() {
      const spheres = this.enemies.filter((enemy) => enemy.type === "sphere" && !enemy.dead);
      for (let i = 0; i < spheres.length; i += 1) {
        for (let j = i + 1; j < spheres.length; j += 1) {
          const a = spheres[i];
          const b = spheres[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distanceValue = Math.hypot(dx, dy) || 1;
          const minDistance = a.radius + b.radius;
          if (distanceValue >= minDistance) continue;

          const nx = dx / distanceValue;
          const ny = dy / distanceValue;
          const overlap = (minDistance - distanceValue) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const av = a.vx * nx + a.vy * ny;
          const bv = b.vx * nx + b.vy * ny;
          const impulse = bv - av;
          a.vx += impulse * nx;
          a.vy += impulse * ny;
          b.vx -= impulse * nx;
          b.vy -= impulse * ny;
        }
      }
    }

    updateGeneratorEnemy(enemy, dt) {
      if (enemy.state === "drop") {
        const direction = enemy.side === "top" ? 1 : -1;
        enemy.y += direction * 190 * dt;
        enemy.x -= 72 * dt;
        if ((direction > 0 && enemy.y >= this.player.y) || (direction < 0 && enemy.y <= this.player.y)) {
          enemy.state = "rush";
        }
        return;
      }

      const dx = this.player.x - enemy.x;
      enemy.x += Math.sign(dx || -1) * 210 * dt;
      enemy.y += (this.player.y - enemy.y) * 0.7 * dt;
    }

    updateGeneratorCore(enemy) {
      const generator = this.generatorStates.find((item) => item.id === enemy.generatorId);
      if (!generator || generator.coreDead) {
        enemy.dead = true;
        return;
      }

      enemy.x = generator.x - this.stageScroll;
      enemy.y = this.stageSurfaceY(enemy.x, generator.side);
      enemy.side = generator.side;
      if (enemy.x < -150 || enemy.x > this.width + 150) enemy.dead = true;
    }

    updateGroundTurretEnemy(enemy, dt) {
      const turret = this.groundTurretStates.find((item) => item.id === enemy.turretId);
      if (!turret || turret.dead) {
        enemy.dead = true;
        return;
      }

      enemy.x = enemy.anchorX - this.stageScroll;
      enemy.y = this.stageSurfaceY(enemy.x, enemy.side);
      enemy.fireTimer -= dt;
      if (
        enemy.fireTimer <= 0 &&
        (this.mode === "playing" || this.mode === "crashing")
      ) {
        enemy.fireTimer = 1.35;
        const muzzleY = enemy.y + (enemy.side === "top" ? 18 : -18);
        const dx = this.player.x - enemy.x;
        const dy = this.player.y - muzzleY;
        const length = Math.hypot(dx, dy) || 1;
        this.souls.push({
          x: enemy.x,
          y: muzzleY,
          vx: (dx / length) * 205,
          vy: (dy / length) * 205,
          radius: 10,
          spin: Math.random() * TAU,
        });
      }
      if (enemy.x < -120 || enemy.x > this.width + 140) enemy.dead = true;
    }

    updateWalkerEnemy(enemy, dt) {
      enemy.y += (this.stageSurfaceY(enemy.x, enemy.side) - enemy.y) * 0.55;

      if (enemy.state === "chase") {
        enemy.directionTimer -= dt;
        if (enemy.directionTimer <= 0) {
          enemy.directionTimer = 1;
          enemy.walkDir = this.player.x >= enemy.x ? 1 : -1;
        }
        enemy.vx = enemy.walkDir * 155;
        enemy.x += enemy.vx * dt;
        enemy.walkTimer -= dt;
        if (enemy.walkTimer <= 0) {
          enemy.state = "stop";
          enemy.stopTimer = 0.9;
          enemy.shotsLeft = 2;
          enemy.fireTimer = 0.12;
          enemy.shotAngles = this.walkerShotAngles(enemy);
        }
        return;
      }

      if (enemy.state === "stop") {
        enemy.x -= 92 * dt;
        enemy.stopTimer -= dt;
        enemy.fireTimer -= dt;
        if (enemy.shotsLeft > 0 && enemy.fireTimer <= 0) {
          enemy.fireTimer = 0.28;
          enemy.shotsLeft -= 1;
          this.fireWalkerSpread(enemy);
        }
        if (enemy.stopTimer <= 0) {
          enemy.state = "chase";
          enemy.walkTimer = 2.2;
          enemy.directionTimer = 0;
        }
      }
    }

    walkerShotAngles(enemy) {
      const horizontalSign = this.player.x >= enemy.x ? 1 : -1;
      const verticalSign = this.player.y >= enemy.y ? 1 : -1;
      return [30, 45].map((degrees) => {
        const rad = (degrees * Math.PI) / 180;
        return horizontalSign > 0 ? verticalSign * rad : Math.PI - verticalSign * rad;
      });
    }

    fireWalkerSpread(enemy) {
      for (const angle of enemy.shotAngles ?? this.walkerShotAngles(enemy)) {
        this.souls.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * 230,
          vy: Math.sin(angle) * 230,
          radius: 11,
          spin: Math.random() * TAU,
        });
      }
    }

    updateJumperEnemy(enemy, dt) {
      const gravity = 760;
      const bounce = 0.9;
      const surface = this.stageSurfaceY(enemy.x, enemy.side);
      const contactOffset = enemy.side === "top" ? enemy.radius : -enemy.radius;
      const contactY = surface + contactOffset;

      if (enemy.onGround) {
        const jumpHeights = [450, 450, 645];
        const jumpVelocity = jumpHeights[enemy.jumpIndex % jumpHeights.length];
        enemy.vy = -enemy.gravityDir * jumpVelocity;
        enemy.vx = this.player.x >= enemy.x ? 150 : -150;
        enemy.onGround = false;
        enemy.burstAtApex = enemy.jumpIndex % jumpHeights.length === 2;
        enemy.jumpIndex += 1;
      }

      const previousVy = enemy.vy;
      enemy.vy += enemy.gravityDir * gravity * dt;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.phase += dt * 7;

      const reachedApex = previousVy * enemy.gravityDir < 0 && enemy.vy * enemy.gravityDir >= 0;
      if (enemy.burstAtApex && reachedApex) {
        enemy.burstAtApex = false;
        this.fireJumperBurst(enemy);
      }

      const nextSurface = this.stageSurfaceY(enemy.x, enemy.side);
      const nextContactY = nextSurface + contactOffset;
      const landed =
        enemy.gravityDir > 0
          ? enemy.y >= nextContactY && enemy.vy > 0
          : enemy.y <= nextContactY && enemy.vy < 0;

      if (!landed) return;

      enemy.y = nextContactY;
      enemy.vy *= -bounce;
      enemy.vx = this.player.x >= enemy.x ? 150 : -150;
      enemy.onGround = true;
    }

    fireJumperBurst(enemy) {
      for (let index = 0; index < 16; index += 1) {
        const angle = (TAU * index) / 16;
        this.souls.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * 185,
          vy: Math.sin(angle) * 185,
          radius: 10,
          spin: Math.random() * TAU,
        });
      }
    }

    updateLaserDroneEnemy(enemy, dt) {
      enemy.x += enemy.vx * dt;
      if (enemy.burstPause > 0) {
        enemy.y += Math.sin(this.time * 3 + enemy.phase) * 14 * dt;
        enemy.burstPause -= dt;
        if (enemy.burstPause <= 0) enemy.fireTimer = 0;
        return;
      }

      if (enemy.burstShots === 0) {
        enemy.y += Math.sin(this.time * 3 + enemy.phase) * 14 * dt;
      }
      enemy.fireTimer -= dt;
      if (
        enemy.fireTimer > 0 ||
        (this.mode !== "playing" && this.mode !== "crashing")
      ) return;

      enemy.fireTimer = 0.36;
      if (this.laserDroneOverlapsReflectiveTerrain(enemy)) return;
      enemy.burstShots += 1;
      this.bossBeams.push({
        type: "enemyLaser",
        x: enemy.x - 18,
        y: enemy.y,
        length: 72,
        maxLength: 72,
        growSpeed: 0,
        vx: -360,
        vy: 0,
        radius: 6,
        age: 0,
        life: 5.5,
        hitTimer: 0,
        bounces: 4,
      });
      if (enemy.burstShots >= 4) {
        enemy.burstShots = 0;
        enemy.burstPause = 0.72;
        enemy.fireTimer = 0;
      }
    }

    laserDroneOverlapsReflectiveTerrain(enemy) {
      if (STAGES[this.stageIndex].terrainMode !== "diamonds") return false;
      const emitterX = enemy.x - 18;
      return (
        this.pointHitsDiamondTerrain(emitterX, enemy.y, enemy.radius) ||
        this.pointHitsCircleTerrain(emitterX, enemy.y, enemy.radius)
      );
    }

    updateSpaceFighter(enemy, dt) {
      const direction = enemy.side === "top" ? 1 : -1;
      if (enemy.state === "enter") {
        const progress = clamp(
          (this.time - enemy.waveStartTime) / enemy.enterDuration,
          0,
          1,
        );
        enemy.y = enemy.startY + (enemy.targetY - enemy.startY) * progress;
        if (progress >= 1) {
          enemy.y = enemy.targetY;
          enemy.state = "hold";
        }
        return;
      }

      if (enemy.state === "hold") {
        if (!enemy.fired && this.time >= enemy.fireAt) {
          enemy.fired = true;
          this.fireSpaceFighterSpread(enemy);
        }
        if (this.time >= enemy.exitAt) enemy.state = "exit";
        return;
      }

      enemy.y += direction * 420 * dt;
    }

    fireSpaceFighterSpread(enemy) {
      const aim = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      const spreadDegrees = (this.spaceAssault?.loopIndex ?? 0) >= 1 ? 15 : 20;
      const spreadAngle = (spreadDegrees * Math.PI) / 180;
      for (const offset of [-spreadAngle, 0, spreadAngle]) {
        const angle = aim + offset;
        this.souls.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * 230,
          vy: Math.sin(angle) * 230,
          radius: 9,
          spin: Math.random() * TAU,
        });
      }
    }

    updateSpaceCruiser(enemy, dt) {
      enemy.phase += dt;
      if (enemy.state === "enter") {
        enemy.x -= 145 * dt;
        if (enemy.x <= enemy.targetX) {
          enemy.x = enemy.targetX;
          enemy.state = "ready";
        }
        return;
      }

      if (enemy.state === "exit") {
        enemy.x -= 185 * dt;
        return;
      }

      if (enemy.state === "laserTravel") {
        const volleyActive = this.bossBeams.some(
          (beam) => beam.volleyId === enemy.activeVolley,
        );
        if (!volleyActive) {
          if (enemy.exitAfterVolley) {
            enemy.state = "exit";
            return;
          }
          const nextY = clamp(enemy.y + enemy.moveDirection * 115, 115, this.height - 155);
          if (nextY === enemy.y) enemy.moveDirection *= -1;
          enemy.targetY = clamp(enemy.y + enemy.moveDirection * 115, 115, this.height - 155);
          enemy.moveDirection *= -1;
          enemy.state = "reposition";
        }
        return;
      }

      if (enemy.state === "reposition") {
        const delta = enemy.targetY - enemy.y;
        enemy.y += Math.sign(delta) * 125 * dt;
        if (Math.abs(delta) <= 5) {
          enemy.y = enemy.targetY;
          enemy.state = "ready";
          enemy.fireTimer = STAGES[this.stageIndex].spaceAssault?.mediumLaserInterval ?? 1.55;
        }
        return;
      }

      enemy.fireTimer -= dt;
      if (enemy.fireTimer > 0) return;

      enemy.laserCount += 1;
      this.fireSpaceCruiserLasers(enemy);
      if (enemy.laserCount >= 6) {
        enemy.exitAfterVolley = true;
        enemy.state = "laserTravel";
        return;
      }
      enemy.state = "laserTravel";
    }

    fireSpaceCruiserLasers(enemy) {
      const offsets = [-54, -18, 18, 54];
      const volleyId = `cruiser-${enemy.cruiserId}-volley-${enemy.laserCount}`;
      enemy.activeVolley = volleyId;
      offsets.forEach((offset, index) => {
        const outer = index === 0 || index === offsets.length - 1;
        this.bossBeams.push({
          type: "cruiserLaser",
          volleyId,
          x: enemy.x - 42,
          y: enemy.y + offset,
          length: 0,
          maxLength: this.width * 0.3,
          growSpeed: this.width * 1.8,
          vx: -420,
          vy: 0,
          radius: 7,
          age: 0,
          life: Infinity,
          delay: outer ? 0.22 : 0,
          hitTimer: 0,
        });
      });
    }

    updateFormationEnemy(enemy, dt) {
      const group = this.formationGroups.get(enemy.groupId);
      if (!group) return;

      if (enemy.state === "in") {
        enemy.x -= 230 * dt;
        enemy.y = enemy.baseY + Math.sin(this.time * 6 + enemy.formationIndex * 0.4) * 4;
        if (enemy.x < 72 + enemy.formationIndex * 4) enemy.state = "turn";
        if (enemy.formationIndex === 0 && enemy.state === "turn") group.state = "turn";
        return;
      }

      if (enemy.state === "turn") {
        enemy.x += 130 * dt;
        const targetY = this.height * 0.5 + Math.sin(enemy.formationIndex * 0.7) * 14;
        enemy.y += (targetY - enemy.y) * 1.7 * dt;
        if (Math.abs(enemy.y - targetY) < 8) enemy.state = "out";
        if (enemy.formationIndex === 0 && enemy.state === "out") group.state = "out";
        return;
      }

      if (enemy.state === "out") {
        enemy.x += 260 * dt;
        return;
      }
    }

    updateBoss(enemy, dt) {
      enemy.x = this.width - 190;
      enemy.phase += dt;

      if (enemy.state === "move") {
        if (enemy.moveTimer >= 3 || enemy.vy === 0) {
          enemy.vy = this.player.y >= enemy.y ? 92 : -92;
        }

        enemy.y = clamp(enemy.y + enemy.vy * dt, 105, this.height - 145);
        if ((enemy.y <= 105 && enemy.vy < 0) || (enemy.y >= this.height - 145 && enemy.vy > 0)) enemy.vy *= -1;
        enemy.moveTimer -= dt;
        if (enemy.moveTimer <= 0) {
          enemy.state = "stop";
          enemy.vy = 0;
          enemy.stopTimer = 2;
          enemy.laserTimer = 1;
          enemy.laserFired = false;
        }
        return;
      }

      enemy.stopTimer -= dt;
      enemy.laserTimer -= dt;
      if (
        !enemy.laserFired &&
        enemy.laserTimer <= 0 &&
        (this.mode === "playing" || this.mode === "crashing")
      ) {
        enemy.laserFired = true;
        this.fireBossLasers(enemy);
      }

      if (enemy.stopTimer <= 0) {
        enemy.state = "move";
        enemy.moveTimer = 3;
        enemy.vy = this.player.y >= enemy.y ? 92 : -92;
      }
    }

    fireBossLasers(enemy) {
      const startX = enemy.x - 64;
      const offsets = [-72, -24, 24, 72];
      offsets.forEach((offset) => {
        this.bossBeams.push({
          x: startX,
          y: enemy.y + offset,
          length: 0,
          maxLength: startX + 18,
          growSpeed: this.width * 0.85,
          vx: -260,
          radius: 9,
          age: 0,
          life: 2.9,
          hitTimer: 0,
        });
      });
    }

    updateBossBeams(dt) {
      dt *= this.loopDifficultyMultiplier();
      for (const beam of this.bossBeams) {
        if (beam.delay > 0) {
          beam.delay -= dt;
          continue;
        }
        beam.age += dt;
        beam.x += beam.vx * dt;
        beam.y += (beam.vy ?? 0) * dt;
        beam.length = Math.min(beam.maxLength, beam.length + beam.growSpeed * dt);
        this.reflectEnemyBeamFromDiamond(beam);
        beam.hitTimer = Math.max(0, beam.hitTimer - dt);
      }
      removeWhere(this.bossBeams, (beam) => beam.age > beam.life || this.beamIsOffscreen(beam));
    }

    beamIsOffscreen(beam) {
      const velocityLength = Math.hypot(beam.vx, beam.vy ?? 0) || 1;
      const endX = beam.x + (beam.vx / velocityLength) * beam.length;
      const endY = beam.y + ((beam.vy ?? 0) / velocityLength) * beam.length;
      const minX = Math.min(beam.x, endX);
      const maxX = Math.max(beam.x, endX);
      const minY = Math.min(beam.y, endY);
      const maxY = Math.max(beam.y, endY);
      return maxX < -60 || minX > this.width + 100 || maxY < -100 || minY > this.height + 100;
    }

    reflectEnemyBeamFromDiamond(beam) {
      if (beam.type !== "enemyLaser" || beam.bounces <= 0) return;

      const velocityLength = Math.hypot(beam.vx, beam.vy ?? 0) || 1;
      const tipX = beam.x + (beam.vx / velocityLength) * beam.length;
      const tipY = beam.y + ((beam.vy ?? 0) / velocityLength) * beam.length;
      const hit = this.findReflectiveTerrainHit(tipX, tipY, beam.radius);
      if (!hit) return;

      beam.bounces -= 1;
      const dot = beam.vx * hit.normalX + (beam.vy ?? 0) * hit.normalY;
      beam.vx -= 2 * dot * hit.normalX;
      beam.vy = (beam.vy ?? 0) - 2 * dot * hit.normalY;
      beam.x = tipX + (beam.vx / velocityLength) * 8;
      beam.y = tipY + (beam.vy / velocityLength) * 8;
    }

    findReflectiveTerrainHit(x, y, radius = 0) {
      const stage = STAGES[this.stageIndex];
      if (stage.terrainMode !== "diamonds") return null;

      for (const circle of stage.circles ?? []) {
        const cx = this.stageObjectX(circle);
        const dx = x - cx;
        const dy = y - circle.y;
        const hitRadius = circle.radius + radius;
        if (Math.hypot(dx, dy) > hitRadius) continue;

        const length = Math.hypot(dx, dy) || 1;
        return {
          normalX: dx / length,
          normalY: dy / length,
        };
      }

      for (const diamond of stage.diamonds ?? []) {
        const cx = this.stageObjectX(diamond);
        const dx = x - cx;
        const dy = y - diamond.y;
        const halfW = diamond.width / 2 + radius;
        const halfH = diamond.height / 2 + radius;
        if (Math.abs(dx) / halfW + Math.abs(dy) / halfH > 1) continue;

        return {
          normalX: dx >= 0 ? 1 / Math.SQRT2 : -1 / Math.SQRT2,
          normalY: dy >= 0 ? 1 / Math.SQRT2 : -1 / Math.SQRT2,
        };
      }
      return null;
    }

    updateSouls(dt) {
      dt *= this.loopDifficultyMultiplier();
      for (const soul of this.souls) {
        if (!soul.sizeNormalized) {
          soul.radius *= 0.5;
          soul.sizeNormalized = true;
        }
        soul.x += soul.vx * dt;
        soul.y += soul.vy * dt;
        soul.spin += dt * 5;
      }
      removeWhere(this.souls, (soul) => soul.x < -50 || soul.y < -50 || soul.y > this.height + 50);
    }

    updateVolcanoShots(dt) {
      dt *= this.loopDifficultyMultiplier();
      for (const shot of this.volcanoShots) {
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        shot.vy += shot.ay * dt;
        shot.spin += dt * 8;
      }
      removeWhere(this.volcanoShots, (shot) => shot.x < -60 || shot.x > this.width + 60 || shot.y < -80 || shot.y > this.height + 80);
    }

    updateCapsules(dt) {
      for (const capsule of this.capsules) {
        capsule.x -= this.capsuleScrollSpeed() * dt;
        capsule.y += Math.sin(this.time * 5 + capsule.phase) * 50 * dt;
        capsule.phase += dt * 4;
      }
      removeWhere(this.capsules, (capsule) => capsule.x < -50);
    }

    capsuleScrollSpeed() {
      if (
        (this.mode === "playing" || this.mode === "crashing") &&
        this.stagePhase === "main" &&
        STAGES[this.stageIndex].terrainMode
      ) return 92;
      return 125;
    }

    updateBursts(dt) {
      for (const burst of this.bursts) burst.age += dt;
      removeWhere(this.bursts, (burst) => burst.age > burst.life);
    }

    resolveHits() {
      for (const enemy of this.enemies) {
        for (const shot of this.playerShots) {
          if (this.enemyIntersectsPoint(enemy, shot.x, shot.y, shot.radius)) this.hitEnemy(enemy, 1, shot);
        }

        for (const missile of this.missiles) {
          if (this.enemyIntersectsPoint(enemy, missile.x, missile.y, missile.radius)) this.hitEnemy(enemy, 4, missile);
        }

        for (const laser of this.lasers) {
          if (this.laserHitsEnemy(laser, enemy)) {
            this.hitEnemy(enemy, enemy.type === "boss" ? 0.18 : 1);
          }
        }

        if (!enemy.dead && this.player.shield > 0 && this.hitShield(enemy)) {
          this.player.shield = Math.max(0, this.player.shield - 3);
          this.hitEnemy(enemy, enemy.type === "boss" ? 3 : 1);
          this.addBurst(enemy.x, enemy.y, COLORS.blue);
        } else if (
          !enemy.dead &&
          this.player.invincible <= 0 &&
          distance(enemy, this.player) < enemy.radius + this.player.hitRadius
        ) {
          if (enemy.type !== "meteor") enemy.dead = true;
          this.damagePlayer();
        }
      }

      for (const soul of this.souls) {
        const blockingMeteor = this.enemies.find(
          (enemy) =>
            enemy.type === "meteor" &&
            distance(soul, enemy) < soul.radius + enemy.radius,
        );
        if (blockingMeteor) {
          soul.dead = true;
          continue;
        }

        if (this.player.shield > 0 && this.hitShield(soul)) {
          soul.dead = true;
          this.player.shield = Math.max(0, this.player.shield - 1);
          this.addBurst(soul.x, soul.y, COLORS.blue);
        } else if (
          this.player.invincible <= 0 &&
          distance(soul, this.player) < soul.radius + this.player.hitRadius
        ) {
          soul.dead = true;
          this.damagePlayer();
        }
      }

      for (const beam of this.bossBeams) {
        if (beam.hitTimer > 0 || !this.bossBeamHitsPlayer(beam)) continue;

        beam.hitTimer = 0.35;
        if (this.player.shield > 0) {
          this.player.shield = Math.max(0, this.player.shield - 4);
          this.addBurst(this.player.x, this.player.y, COLORS.blue);
        } else if (this.player.invincible <= 0) {
          this.damagePlayer();
        }
      }

      for (const shot of this.volcanoShots) {
        if (this.player.shield > 0 && this.hitShield(shot)) {
          shot.dead = true;
          this.player.shield = Math.max(0, this.player.shield - 1);
          this.addBurst(shot.x, shot.y, COLORS.amber);
        } else if (
          this.player.invincible <= 0 &&
          distance(shot, this.player) < shot.radius + this.player.hitRadius
        ) {
          shot.dead = true;
          this.damagePlayer();
        }
      }

      for (const capsule of this.capsules) {
        if (distance(capsule, this.player) < capsule.radius + this.player.radius) {
          capsule.dead = true;
          this.powerCapsules = (this.powerCapsules % CAPSULE_CYCLE_MAX) + 1;
          const name = POWERUPS[this.powerCapsules - 1];
          this.flash(name ? `${name} READY` : "CAPSULE READY");
        }
      }

      removeWhere(this.enemies, (enemy) => enemy.dead);
      removeWhere(this.playerShots, (shot) => shot.dead);
      removeWhere(this.missiles, (missile) => missile.dead);
      removeWhere(this.souls, (soul) => soul.dead);
      removeWhere(this.bossBeams, (beam) => beam.dead);
      removeWhere(this.volcanoShots, (shot) => shot.dead);
      removeWhere(this.capsules, (capsule) => capsule.dead);
    }

    hitShield(target) {
      const shield = { x: this.player.x + 35, y: this.player.y, radius: 29 };
      return distance(target, shield) < target.radius + shield.radius;
    }

    bossBeamHitsPlayer(beam) {
      if (beam.delay > 0) return false;
      const velocityLength = Math.hypot(beam.vx, beam.vy ?? 0) || 1;
      const ux = beam.vx / velocityLength;
      const uy = (beam.vy ?? 0) / velocityLength;
      const px = this.player.x - beam.x;
      const py = this.player.y - beam.y;
      const along = clamp(px * ux + py * uy, 0, beam.length);
      const nearestX = beam.x + ux * along;
      const nearestY = beam.y + uy * along;
      const dx = this.player.x - nearestX;
      const dy = this.player.y - nearestY;
      return Math.hypot(dx, dy) < this.player.hitRadius + beam.radius;
    }

    enemyIntersectsPoint(enemy, x, y, radius = 0) {
      if (enemy.type === "boss") {
        const halfWidth = (enemy.halfWidth ?? 78) + radius;
        const halfHeight = (enemy.halfHeight ?? 48) + radius;
        const dx = (x - enemy.x) / halfWidth;
        const dy = (y - enemy.y) / halfHeight;
        return dx * dx + dy * dy <= 1;
      }

      if (enemy.type === "generatorCore") {
        const halfWidth = enemy.halfWidth ?? 60;
        return Math.abs(x - enemy.x) < halfWidth + radius && Math.abs(y - enemy.y) < 24 + radius;
      }

      return distance(enemy, { x, y }) < enemy.radius + radius;
    }

    laserHitsEnemy(laser, enemy) {
      if (enemy.type === "boss") {
        const left = enemy.x - (enemy.halfWidth ?? 78);
        const right = enemy.x + (enemy.halfWidth ?? 78);
        return (
          right > laser.x &&
          left < laser.x + laser.length &&
          Math.abs(enemy.y - laser.y) < (enemy.halfHeight ?? 48) + laser.radius
        );
      }

      if (enemy.type === "generatorCore") {
        const left = enemy.x - (enemy.halfWidth ?? 60);
        const right = enemy.x + (enemy.halfWidth ?? 60);
        const overlapsX = right > laser.x && left < laser.x + laser.length;
        return overlapsX && Math.abs(enemy.y - laser.y) < 24 + laser.radius;
      }

      return enemy.x > laser.x && enemy.x < laser.x + laser.length && Math.abs(enemy.y - laser.y) < enemy.radius + laser.radius;
    }

    hitEnemy(enemy, damage, projectile) {
      if (enemy.dead) return;
      if (projectile) projectile.dead = true;
      if (enemy.type === "meteor") return;

      if (
        enemy.type !== "boss" &&
        enemy.type !== "sphere" &&
        enemy.type !== "volcanoRock" &&
        enemy.type !== "generatorCore" &&
        enemy.type !== "groundTurret" &&
        enemy.type !== "spaceCruiser" &&
        enemy.type !== "meteor"
      ) {
        this.killEnemy(enemy);
        return;
      }

      enemy.hp -= damage;
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }

    killEnemy(enemy, projectile) {
      if (enemy.dead) return;

      enemy.dead = true;
      if (projectile) projectile.dead = true;
      this.score += enemy.scoreValue ?? 100;
      this.addBurst(enemy.x, enemy.y, COLORS.pink);
      if (enemy.carriesCapsule) this.dropCapsule(enemy.x, enemy.y);
      if (this.loopNumber >= 2 && enemy.type !== "boss" && enemy.type !== "volcanoRock") {
        this.fireRevengeBullet(enemy);
      }

      if (enemy.type === "formation") {
        const group = this.formationGroups.get(enemy.groupId);
        if (group && !group.completed) {
          group.remaining -= 1;
          if (group.remaining <= 0) {
            group.completed = true;
            this.dropCapsule(enemy.x, enemy.y);
          }
        }
        return;
      }

      if (enemy.type === "boss") {
        this.startBossDefeat(enemy);
        return;
      }

      if (enemy.type === "generatorCore") {
        const generator = this.generatorStates.find((item) => item.id === enemy.generatorId);
        if (generator) generator.coreDead = true;
        return;
      }

      if (enemy.type === "groundTurret") {
        const turret = this.groundTurretStates.find((item) => item.id === enemy.turretId);
        if (turret) turret.dead = true;
        this.killCount += 1;
        return;
      }

      if (enemy.type === "sphere") {
        this.splitSphere(enemy);
        return;
      }

      if (enemy.type === "volcanoRock") return;

      this.killCount += 1;
    }

    fireRevengeBullet(enemy) {
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      const speed = 205;
      this.souls.push({
        x: enemy.x,
        y: enemy.y,
        vx: (dx / length) * speed,
        vy: (dy / length) * speed,
        radius: 4.5,
        spin: Math.random() * TAU,
        revenge: true,
        sizeNormalized: true,
      });
    }

    splitSphere(enemy) {
      if (enemy.tier <= 2) return;

      const nextTier = enemy.tier - 1;
      for (let index = 0; index < 4; index += 1) {
        const angle = (TAU * index) / 4 + Math.random() * 0.35;
        const push = 95 + Math.random() * 55;
        this.spawnSphereEnemy(
          enemy.x + Math.cos(angle) * enemy.radius * 0.25,
          enemy.y + Math.sin(angle) * enemy.radius * 0.25,
          nextTier,
          enemy.vx * 0.75 + Math.cos(angle) * push,
          enemy.vy * 0.75 + Math.sin(angle) * push,
          enemy.variant
        );
      }
    }

    dropCapsule(x, y) {
      this.capsules.push({
        x,
        y,
        radius: 14,
        phase: Math.random() * TAU,
      });
    }

    activatePowerup() {
      if (this.powerCapsules <= 0) return;

      const name = POWERUPS[this.powerCapsules - 1];
      if (!name) {
        this.flash("SELECT POWER");
        return;
      }

      if (!this.canActivatePowerup(name)) {
        this.flash(`${name} MAX`);
        return;
      }

      if (name === "SPEED") this.player.speedLevel = Math.min(6, this.player.speedLevel + 1);
      if (name === "MISSILE") this.player.missile = true;
      if (name === "DOUBLE") {
        this.player.double = true;
        this.player.laser = false;
        this.lasers.length = 0;
        this.playerShots.length = 0;
      }
      if (name === "LASER") {
        this.player.laser = true;
        this.player.double = false;
        this.playerShots.length = 0;
      }
      if (name === "OPTION" && this.options.length < 4) {
        this.options.push({ id: `option-${this.options.length + 1}`, x: this.player.x - 38, y: this.player.y });
      }
      if (name === "SHIELD") this.player.shield = 15;

      this.flash(`${name} ON`);
      this.powerCapsules = 0;
    }

    canActivatePowerup(name) {
      if (name === "SPEED") return this.player.speedLevel < 6;
      if (name === "MISSILE") return !this.player.missile;
      if (name === "DOUBLE") return !this.player.double;
      if (name === "LASER") return !this.player.laser;
      if (name === "OPTION") return this.options.length < 4;
      if (name === "SHIELD") return this.player.shield < 15;
      return false;
    }

    damagePlayer() {
      const carriedCapsule = this.powerCapsules > 0;
      this.lives -= 1;
      this.clearPowerups();
      this.respawnPowerCapsules = carriedCapsule && this.lives > 0 ? 1 : 0;
      this.playerShots.length = 0;
      this.missiles.length = 0;
      this.lasers.length = 0;
      this.mode = "crashing";
      this.player.invincible = 999;
      this.player.trail = [];
      this.player.moving = false;
      this.player.crashing = true;
      this.player.crashVy = 0;
      this.player.crashSpin = 0;
      this.player.crashTimer = 0;
      this.player.crashStartY = this.player.y;
      this.player.crashSmokeTimer = 0;
      this.player.angle = -0.08;
      this.flash("CRITICAL HIT");
    }

    enterGameOver() {
      this.mode = "gameover";
      this.gameOverTimer = 0;
      this.gameOverCanConfirm = false;
      this.respawnPowerCapsules = 0;
      this.clearPowerups();
      this.enemies.length = 0;
      this.souls.length = 0;
      this.bossBeams.length = 0;
      this.volcanoShots.length = 0;
      this.capsules.length = 0;
      this.playerShots.length = 0;
      this.missiles.length = 0;
      this.lasers.length = 0;
      this.flash("GAME OVER");
    }

    clearPowerups() {
      this.powerCapsules = 0;
      this.options.length = 0;
      Object.assign(this.player, {
        speedLevel: 1,
        missile: false,
        double: false,
        laser: false,
        shield: 0,
        cooldown: 0,
        missileCooldown: 0,
      });
    }

    flash(text) {
      this.flashText = text;
      this.flashTimer = 1.0;
    }

    addBurst(x, y, color, life = 0.42) {
      this.bursts.push({ x, y, color, age: 0, life });
    }
  }

  class Renderer {
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
      });
      this.drawTerrain(state);
      for (const particle of state.smoke) this.drawSmoke(particle);

      if (state.mode === "title") {
        this.drawTitle(state);
        this.drawScanlines(state);
        return;
      }

      if (state.mode === "gameover") {
        this.drawGameOver(state);
        this.drawScanlines(state);
        return;
      }

      if (state.mode === "loopclear") {
        this.drawLoopClear(state);
        this.drawScanlines(state);
        return;
      }

      this.withGlow(COLORS.cyan, 10, () => {
        for (const option of state.options) this.drawOption(option, state.time);
        if (state.mode !== "respawn" && state.mode !== "crashExplosion") {
          this.drawPlayer(state.player, state.time);
        }
        for (const shot of state.playerShots) this.drawPlayerShot(shot);
        for (const laser of state.lasers) this.drawLaser(laser, state.time);
      });

      this.withGlow(COLORS.amber, 10, () => {
        for (const missile of state.missiles) this.drawMissile(missile);
        for (const capsule of state.capsules) this.drawCapsule(capsule, state.time);
        for (const shot of state.volcanoShots) this.drawVolcanoShot(shot);
      });

      this.withGlow(COLORS.pink, 12, () => {
        for (const enemy of state.enemies) this.drawEnemy(enemy, state.time);
      });

      this.withGlow(COLORS.lime, 14, () => {
        for (const soul of state.souls) this.drawSoul(soul);
      });

      this.withGlow(COLORS.red, 18, () => {
        for (const beam of state.bossBeams) this.drawBossBeam(beam, state.time);
      });

      if (state.player.shield > 0) this.drawShield(state.player);
      for (const burst of state.bursts) this.drawBurst(burst);
      if (state.mode === "ready") this.drawReady(state);
      if (state.mode === "playing") this.drawPowerGauge(state);
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
      for (let y = 80; y < height - 80; y += 80) {
        const wave = Math.sin(time * 0.9 + y * 0.02) * 12;
        ctx.moveTo(0, y);
        ctx.lineTo(width + wave, y + wave * 0.18);
      }
      ctx.stroke();
    }

    drawTerrain(state) {
      const { width, height, time, mode, stagePhase, stage, stageScroll } = state;
      const ctx = this.ctx;
      if ((mode === "playing" || mode === "ready") && stagePhase === "air") return;
      if (stage?.spaceAssault || stage?.meteorRush) return;
      if (stage?.terrainMode) {
        this.drawStageTerrain(state);
        return;
      }

      const terrainTime = mode === "playing" && stagePhase === "boss" ? 0 : time;
      const points = [];
      for (let x = 0; x <= width + 16; x += 16) {
        points.push({
          x,
          y: height - 68 - Math.sin(x * 0.010 + terrainTime * 0.9) * 34 - Math.sin(x * 0.024 + terrainTime * 0.32) * 18,
        });
      }

      ctx.fillStyle = "rgba(2, 3, 10, 0.9)";
      ctx.beginPath();
      ctx.moveTo(0, height + 20);
      for (const point of points) ctx.lineTo(point.x, point.y);
      ctx.lineTo(width + 16, height + 20);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(185, 255, 120, 0.34)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }

    drawStageTerrain({ width, height, time, stage, stageScroll, terrainAlpha = 1 }) {
      const ctx = this.ctx;
      if (terrainAlpha <= 0) return;
      if (stage.terrainMode === "diamonds") {
        this.drawDiamondTerrain({ width, height, time, stage, stageScroll, terrainAlpha });
        return;
      }

      const inverted = stage.terrainMode === "inverted";
      ctx.save();
      ctx.globalAlpha *= terrainAlpha;
      ctx.fillStyle = "rgba(2, 3, 10, 0.94)";
      ctx.fillRect(0, height - 62, width, 62);
      ctx.fillRect(0, 0, width, 62);
      ctx.strokeStyle = "rgba(185, 255, 120, 0.46)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, height - 62);
      ctx.lineTo(width, height - 62);
      ctx.moveTo(0, 62);
      ctx.lineTo(width, 62);
      ctx.stroke();

      const drawMountain = (mountain, side) => {
        const x = this.stageObjectX(width, stageScroll, mountain);
        const baseY = side === "bottom" ? height - 62 : 62;
        const peakY = baseY + (side === "bottom" ? -mountain.height : mountain.height);
        const half = mountain.width / 2;
        if (x + half < -80 || x - half > width + 80) return;

        ctx.fillStyle = "rgba(2, 3, 10, 0.94)";
        ctx.beginPath();
        ctx.moveTo(x - half, baseY);
        ctx.lineTo(x, peakY);
        ctx.lineTo(x + half, baseY);
        ctx.lineTo(x + half, side === "bottom" ? height + 20 : -20);
        ctx.lineTo(x - half, side === "bottom" ? height + 20 : -20);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x - half, baseY);
        ctx.lineTo(x, peakY);
        ctx.lineTo(x + half, baseY);
        ctx.stroke();

        if (mountain.kind === "volcano") {
          ctx.strokeStyle = COLORS.amber;
          ctx.beginPath();
          ctx.moveTo(x - 24, peakY + (side === "bottom" ? 18 : -18));
          ctx.lineTo(x, peakY);
          ctx.lineTo(x + 24, peakY + (side === "bottom" ? 18 : -18));
          ctx.stroke();
          ctx.strokeStyle = "rgba(185, 255, 120, 0.46)";
        }
      };

      for (const mountain of stage.mountains ?? []) drawMountain(mountain, inverted ? "top" : "bottom");
      for (const peak of stage.ceiling ?? []) drawMountain(peak, inverted ? "bottom" : "top");

      for (const generator of stage.generators ?? []) {
        const x = generator.x - stageScroll;
        if (x < -50 || x > width + 50) continue;
        const side = inverted
          ? (generator.side === "bottom" ? "top" : "bottom")
          : generator.side;
        const y = side === "bottom" ? height - 74 : 74;
        ctx.strokeStyle = COLORS.pink;
        ctx.beginPath();
        ctx.rect(x - 56, y - 14, 112, 28);
        ctx.moveTo(x - 66, y);
        ctx.lineTo(x + 66, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawDiamondTerrain({ width, height, time, stage, stageScroll, terrainAlpha = 1 }) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha *= terrainAlpha;

      const points = [];
      for (let x = 0; x <= width + 16; x += 16) {
        points.push({
          x,
          y: height - 68 - Math.sin(x * 0.010 + time * 0.9) * 34 - Math.sin(x * 0.024 + time * 0.32) * 18,
        });
      }

      ctx.fillStyle = "rgba(2, 3, 10, 0.9)";
      ctx.beginPath();
      ctx.moveTo(0, height + 20);
      for (const point of points) ctx.lineTo(point.x, point.y);
      ctx.lineTo(width + 16, height + 20);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(185, 255, 120, 0.34)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();

      for (const diamond of stage.diamonds ?? []) {
        const x = diamond.x - stageScroll;
        const halfW = diamond.width / 2;
        const halfH = diamond.height / 2;
        if (x + halfW < -80 || x - halfW > width + 80) continue;

        ctx.fillStyle = "rgba(2, 3, 10, 0.93)";
        ctx.beginPath();
        ctx.moveTo(x, diamond.y - halfH);
        ctx.lineTo(x + halfW, diamond.y);
        ctx.lineTo(x, diamond.y + halfH);
        ctx.lineTo(x - halfW, diamond.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(117, 247, 255, 0.58)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = "rgba(185, 255, 120, 0.35)";
        ctx.beginPath();
        ctx.moveTo(x - halfW * 0.45, diamond.y);
        ctx.lineTo(x, diamond.y - halfH * 0.55);
        ctx.lineTo(x + halfW * 0.45, diamond.y);
        ctx.lineTo(x, diamond.y + halfH * 0.55);
        ctx.closePath();
        ctx.stroke();
      }

      for (const circle of stage.circles ?? []) {
        const x = circle.x - stageScroll;
        if (x + circle.radius < -80 || x - circle.radius > width + 80) continue;

        ctx.fillStyle = "rgba(2, 3, 10, 0.93)";
        ctx.beginPath();
        ctx.arc(x, circle.y, circle.radius, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = "rgba(117, 247, 255, 0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, circle.y, circle.radius, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = "rgba(185, 255, 120, 0.32)";
        ctx.beginPath();
        ctx.arc(x, circle.y, circle.radius * 0.58, 0, TAU);
        ctx.moveTo(x - circle.radius, circle.y);
        ctx.lineTo(x + circle.radius, circle.y);
        ctx.moveTo(x, circle.y - circle.radius);
        ctx.lineTo(x, circle.y + circle.radius);
        ctx.stroke();
      }

      ctx.restore();
    }

    stageObjectX(width, stageScroll, object) {
      return object.x - stageScroll;
    }

    drawTitle({ width, height, time, selectedStageIndex }) {
      const ctx = this.ctx;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.strokeStyle = COLORS.cyan;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 22;
      ctx.lineWidth = 2;
      ctx.font = "700 86px Segoe UI, sans-serif";
      ctx.strokeText("VECTORIUS", width / 2, height * 0.38);

      ctx.fillStyle = COLORS.lime;
      ctx.shadowColor = COLORS.lime;
      ctx.shadowBlur = 10;
      ctx.font = "700 18px Segoe UI, sans-serif";
      ctx.fillText("COPYRIGHT 2026 CSHARPVTUBER", width / 2, height * 0.50);

      ctx.globalAlpha = 0.55 + Math.sin(time * 5) * 0.35;
      ctx.fillStyle = COLORS.amber;
      ctx.shadowColor = COLORS.amber;
      ctx.shadowBlur = 14;
      ctx.font = "700 24px Segoe UI, sans-serif";
      ctx.fillText("PRESS TRIGGER TO START", width / 2, height * 0.61);

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = COLORS.cyan;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 10;
      ctx.font = "700 20px Segoe UI, sans-serif";
      ctx.fillText(`START STAGE ${selectedStageIndex + 1}`, width / 2, height * 0.69);

      ctx.restore();
    }

    drawGameOver({ width, height, time, gameOverTimer }) {
      const ctx = this.ctx;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = COLORS.red;
      ctx.shadowColor = COLORS.red;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 2;
      ctx.font = "700 72px Segoe UI, sans-serif";
      ctx.strokeText("GAME OVER", width / 2, height * 0.44);

      ctx.fillStyle = COLORS.amber;
      ctx.shadowColor = COLORS.amber;
      ctx.shadowBlur = 10;
      ctx.font = "700 20px Segoe UI, sans-serif";
      ctx.globalAlpha = 0.6 + Math.sin(time * 5) * 0.3;
      ctx.fillText("PRESS TRIGGER TO RETURN", width / 2, height * 0.56);

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = COLORS.cyan;
      ctx.shadowColor = COLORS.cyan;
      ctx.font = "700 16px Segoe UI, sans-serif";
      ctx.fillText(`AUTO RETURN ${Math.max(0, Math.ceil(15 - gameOverTimer))}`, width / 2, height * 0.63);
      ctx.restore();
    }

    drawLoopClear({ width, height, time }) {
      const ctx = this.ctx;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = COLORS.lime;
      ctx.shadowColor = COLORS.lime;
      ctx.shadowBlur = 24;
      ctx.lineWidth = 2;
      ctx.font = "700 68px Segoe UI, sans-serif";
      ctx.strokeText("1 LOOP CLEAR", width / 2, height * 0.45);
      ctx.globalAlpha = 0.65 + Math.sin(time * 5) * 0.3;
      ctx.fillStyle = COLORS.cyan;
      ctx.shadowColor = COLORS.cyan;
      ctx.font = "700 20px Segoe UI, sans-serif";
      ctx.fillText("PRESS TRIGGER TO TITLE", width / 2, height * 0.58);
      ctx.restore();
    }

    drawStars(stars, time) {
      const ctx = this.ctx;
      for (const star of stars) {
        const pulse = 0.6 + Math.sin(time * 4 + star.phase) * 0.35;
        ctx.strokeStyle = star.layer === 3 ? COLORS.blue : "rgba(185, 255, 120, 0.75)";
        ctx.lineWidth = star.layer;
        ctx.beginPath();
        ctx.moveTo(star.x - star.layer * 5 * pulse, star.y);
        ctx.lineTo(star.x + star.layer * 2, star.y);
        ctx.stroke();
      }
    }

    drawPlayer(player, time) {
      const ctx = this.ctx;
      const flicker = !player.crashing && player.invincible > 0 && Math.floor(time * 18) % 2 === 0;
      if (flicker) return;

      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle || 0);
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(28, 0);
      ctx.lineTo(-22, -20);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-22, 20);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = COLORS.lime;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, -8);
      ctx.lineTo(-42 - Math.sin(time * 30) * 8, 0);
      ctx.lineTo(-12, 8);
      ctx.stroke();
      ctx.restore();
    }

    drawOption(option, time) {
      const ctx = this.ctx;
      ctx.strokeStyle = COLORS.blue;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(option.x, option.y, 12, 8, time * 3, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(option.x - 18, option.y);
      ctx.lineTo(option.x + 18, option.y);
      ctx.stroke();
    }

    drawShield(player) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = COLORS.blue;
      ctx.shadowColor = COLORS.blue;
      ctx.shadowBlur = 18;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.55 + player.shield / 34;
      ctx.beginPath();
      ctx.arc(player.x + 35, player.y, 29, -Math.PI * 0.58, Math.PI * 0.58);
      ctx.stroke();
      ctx.restore();
    }

    drawPlayerShot(shot) {
      const ctx = this.ctx;
      const speed = Math.hypot(shot.vx, shot.vy) || 1;
      const ux = shot.vx / speed;
      const uy = shot.vy / speed;
      ctx.strokeStyle = COLORS.lime;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(shot.x - ux * 18, shot.y - uy * 18);
      ctx.lineTo(shot.x + ux * 16, shot.y + uy * 16);
      ctx.stroke();
    }

    drawMissile(missile) {
      const ctx = this.ctx;
      const angle = missile.grounded ? 0 : Math.atan2(missile.vy, missile.vx);
      ctx.save();
      ctx.translate(missile.x, missile.y);
      ctx.rotate(angle);
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, -5);
      ctx.lineTo(12, 0);
      ctx.lineTo(-10, 5);
      ctx.stroke();
      ctx.restore();
    }

    drawReady({ width, height, readyTimer }) {
      if (Math.floor(readyTimer / 0.5) % 2 !== 0) return;

      const ctx = this.ctx;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = COLORS.cyan;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 2;
      ctx.font = "700 64px Segoe UI, sans-serif";
      ctx.strokeText("READY", width / 2, height / 2);
      ctx.restore();
    }

    drawSmoke(particle) {
      const ctx = this.ctx;
      const progress = particle.age / particle.life;
      ctx.save();
      ctx.globalAlpha = (1 - progress) * 0.58;
      ctx.fillStyle = "rgba(125, 138, 150, 0.62)";
      ctx.strokeStyle = "rgba(185, 198, 210, 0.48)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawLaser(laser, time) {
      const ctx = this.ctx;
      const pulse = 8 + Math.sin(time * 28) * 2;
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = pulse;
      ctx.beginPath();
      ctx.moveTo(laser.x, laser.y);
      ctx.lineTo(laser.x + laser.length, laser.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(laser.x, laser.y);
      ctx.lineTo(laser.x + laser.length, laser.y);
      ctx.stroke();
    }

    drawBossBeam(beam, time) {
      if (beam.delay > 0) return;
      const ctx = this.ctx;
      const pulse = 7 + Math.sin(time * 42 + beam.y * 0.05) * 2;
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = pulse;
      const velocityLength = Math.hypot(beam.vx, beam.vy ?? 0) || 1;
      const endX = beam.x + (beam.vx / velocityLength) * beam.length;
      const endY = beam.y + ((beam.vy ?? 0) / velocityLength) * beam.length;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    drawEnemy(enemy, time) {
      if (enemy.type === "boss") {
        this.drawBossEnemy(enemy, time);
        return;
      }

      if (enemy.type === "warpEnemy") {
        this.drawWarpEnemy(enemy, time);
        return;
      }

      if (enemy.type === "meteor") {
        this.drawMeteorEnemy(enemy);
        return;
      }

      if (enemy.type === "meteorRaider") {
        this.drawMeteorRaider(enemy, time);
        return;
      }

      if (enemy.type === "spaceFighter") {
        this.drawSpaceFighter(enemy, time);
        return;
      }

      if (enemy.type === "spaceCruiser") {
        this.drawSpaceCruiser(enemy, time);
        return;
      }

      if (enemy.type === "generatorCore") {
        this.drawGeneratorCore(enemy);
        return;
      }

      if (enemy.type === "groundTurret") {
        this.drawGroundTurret(enemy, time);
        return;
      }

      if (enemy.type === "sphere") {
        this.drawSphereEnemy(enemy);
        return;
      }

      if (enemy.type === "volcanoRock") {
        this.drawVolcanoShot(enemy);
        return;
      }

      if (enemy.type === "walker") {
        this.drawWalkerEnemy(enemy, time);
        return;
      }

      if (enemy.type === "jumper") {
        this.drawJumperEnemy(enemy, time);
        return;
      }

      const ctx = this.ctx;
      const wobble = Math.sin(time * 5 + enemy.phase) * 4;
      const scale = enemy.type === "boss" ? 2.75 : 1;
      ctx.strokeStyle = this.enemyBaseColor(enemy);
      ctx.lineWidth = enemy.type === "boss" ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 24 * scale, enemy.y);
      ctx.lineTo(enemy.x, enemy.y - (24 + wobble) * scale);
      ctx.lineTo(enemy.x + 26 * scale, enemy.y);
      ctx.lineTo(enemy.x, enemy.y + (24 + wobble) * scale);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = enemy.type === "boss" ? 4 : 2;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 8 * scale, 0, TAU);
      ctx.stroke();

      if (enemy.type === "boss") {
        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        ctx.strokeStyle = COLORS.lime;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(enemy.x - 58, enemy.y + 88);
        ctx.lineTo(enemy.x - 58 + 116 * ratio, enemy.y + 88);
        ctx.stroke();
      }
    }

    drawBossEnemy(enemy, time) {
      const ctx = this.ctx;
      const halfWidth = enemy.halfWidth ?? 78;
      const halfHeight = enemy.halfHeight ?? 48;
      const pulse = Math.sin(time * 5) * 3;
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(enemy.x - halfWidth, enemy.y);
      ctx.lineTo(enemy.x - halfWidth * 0.5, enemy.y - halfHeight - pulse);
      ctx.lineTo(enemy.x + halfWidth * 0.5, enemy.y - halfHeight - pulse);
      ctx.lineTo(enemy.x + halfWidth, enemy.y);
      ctx.lineTo(enemy.x + halfWidth * 0.5, enemy.y + halfHeight + pulse);
      ctx.lineTo(enemy.x - halfWidth * 0.5, enemy.y + halfHeight + pulse);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 12, 0, TAU);
      ctx.stroke();

      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.strokeStyle = COLORS.lime;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x - halfWidth, enemy.y + halfHeight + 24);
      ctx.lineTo(enemy.x - halfWidth + halfWidth * 2 * ratio, enemy.y + halfHeight + 24);
      ctx.stroke();
    }

    drawWarpEnemy(enemy, time) {
      const ctx = this.ctx;
      const color = this.enemyBaseColor(enemy);
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.phase);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      if (enemy.state === "warp") {
        const progress = 1 - enemy.warpTimer / 0.3;
        ctx.globalAlpha = 0.35 + progress * 0.65;
        ctx.beginPath();
        ctx.arc(0, 0, 30 - progress * 10, 0, TAU);
        ctx.moveTo(-34, 0);
        ctx.lineTo(34, 0);
        ctx.moveTo(0, -34);
        ctx.lineTo(0, 34);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-14, -15);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-14, 15);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    enemyBaseColor(enemy) {
      if (enemy.type === "formation") return COLORS.pink;
      return enemy.carriesCapsule ? COLORS.red : COLORS.cyan;
    }

    drawMeteorEnemy(enemy) {
      const ctx = this.ctx;
      const radius = enemy.radius;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.spin);
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let index = 0; index < 9; index += 1) {
        const angle = (TAU * index) / 9;
        const edge = radius * (0.78 + (index % 3) * 0.1);
        const x = Math.cos(angle) * edge;
        const y = Math.sin(angle) * edge;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-radius * 0.18, -radius * 0.12, radius * 0.22, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    drawMeteorRaider(enemy, time) {
      const ctx = this.ctx;
      ctx.strokeStyle = this.enemyBaseColor(enemy);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 23, enemy.y);
      ctx.lineTo(enemy.x + 17, enemy.y - 14);
      ctx.lineTo(enemy.x + 8, enemy.y);
      ctx.lineTo(enemy.x + 17, enemy.y + 14);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(enemy.x + 14, enemy.y - 7);
      ctx.lineTo(enemy.x + 28 + Math.sin(time * 30 + enemy.phase) * 5, enemy.y);
      ctx.lineTo(enemy.x + 14, enemy.y + 7);
      ctx.stroke();
    }

    drawSpaceFighter(enemy, time) {
      const ctx = this.ctx;
      const direction = enemy.side === "top" ? 1 : -1;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(direction > 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.strokeStyle = this.enemyBaseColor(enemy);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-14, -14);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-14, 14);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(-22 - Math.sin(time * 24 + enemy.phase) * 4, 0);
      ctx.lineTo(-10, 8);
      ctx.stroke();
      ctx.restore();
    }

    drawSpaceCruiser(enemy, time) {
      const ctx = this.ctx;
      const pulse = Math.sin(time * 5) * 4;
      ctx.strokeStyle = this.enemyBaseColor(enemy);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 52, enemy.y);
      ctx.lineTo(enemy.x - 18, enemy.y - 58 - pulse);
      ctx.lineTo(enemy.x + 44, enemy.y - 34);
      ctx.lineTo(enemy.x + 64, enemy.y);
      ctx.lineTo(enemy.x + 44, enemy.y + 34);
      ctx.lineTo(enemy.x - 18, enemy.y + 58 + pulse);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 3;
      for (const offset of [-54, -18, 18, 54]) {
        ctx.beginPath();
        ctx.arc(enemy.x - 38, enemy.y + offset, 6, 0, TAU);
        ctx.stroke();
      }

      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.strokeStyle = COLORS.lime;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 54, enemy.y + 74);
      ctx.lineTo(enemy.x - 54 + 108 * ratio, enemy.y + 74);
      ctx.stroke();
    }

    drawGeneratorCore(enemy) {
      const ctx = this.ctx;
      const halfWidth = enemy.halfWidth ?? 60;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.strokeStyle = this.enemyBaseColor(enemy);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(enemy.x - halfWidth, enemy.y - 18, halfWidth * 2, 36);
      ctx.moveTo(enemy.x - halfWidth - 10, enemy.y);
      ctx.lineTo(enemy.x + halfWidth + 10, enemy.y);
      ctx.stroke();
      ctx.strokeStyle = COLORS.lime;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(enemy.x - halfWidth, enemy.y + 26);
      ctx.lineTo(enemy.x - halfWidth + halfWidth * 2 * ratio, enemy.y + 26);
      ctx.stroke();
    }

    drawGroundTurret(enemy, time) {
      const ctx = this.ctx;
      const direction = enemy.side === "top" ? 1 : -1;
      const bodyY = enemy.y + direction * 17;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.strokeStyle = this.enemyBaseColor(enemy);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 22, enemy.y);
      ctx.lineTo(enemy.x - 16, bodyY);
      ctx.lineTo(enemy.x + 16, bodyY);
      ctx.lineTo(enemy.x + 22, enemy.y);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x, bodyY);
      ctx.lineTo(enemy.x - 18, bodyY + direction * 24);
      ctx.stroke();
      ctx.strokeStyle = COLORS.lime;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 18, bodyY + direction * 34);
      ctx.lineTo(enemy.x - 18 + 36 * ratio, bodyY + direction * 34);
      ctx.stroke();
    }

    drawSphereEnemy(enemy) {
      const ctx = this.ctx;
      const primary = this.enemyBaseColor(enemy);
      const secondary = enemy.carriesCapsule ? COLORS.amber : COLORS.blue;
      ctx.strokeStyle = primary;
      ctx.lineWidth = Math.max(2, Math.min(6, enemy.radius / 9));
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(enemy.x - enemy.radius * 0.55, enemy.y);
      ctx.lineTo(enemy.x + enemy.radius * 0.55, enemy.y);
      ctx.moveTo(enemy.x, enemy.y - enemy.radius * 0.55);
      ctx.lineTo(enemy.x, enemy.y + enemy.radius * 0.55);
      ctx.stroke();
    }

    drawWalkerEnemy(enemy, time) {
      const ctx = this.ctx;
      const dir = enemy.side === "top" ? -1 : 1;
      const step = Math.sin(time * 16 + enemy.phase);
      const otherStep = Math.sin(time * 16 + enemy.phase + Math.PI);
      const bob = Math.abs(step) * 4;
      const bodyY = enemy.y - dir * (25 + bob);
      const footY = enemy.y;

      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 20, bodyY);
      ctx.lineTo(enemy.x + 20, bodyY);
      ctx.lineTo(enemy.x + 12, bodyY - dir * 20);
      ctx.lineTo(enemy.x - 12, bodyY - dir * 20);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = this.enemyBaseColor(enemy);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 8, bodyY);
      ctx.lineTo(enemy.x - 8 + step * 14, bodyY + dir * 16);
      ctx.lineTo(enemy.x - 8 + step * 26, footY);
      ctx.moveTo(enemy.x + 8, bodyY);
      ctx.lineTo(enemy.x + 8 + otherStep * 14, bodyY + dir * 16);
      ctx.lineTo(enemy.x + 8 + otherStep * 26, footY);
      ctx.moveTo(enemy.x - 8 + step * 26 - 8, footY);
      ctx.lineTo(enemy.x - 8 + step * 26 + 8, footY);
      ctx.moveTo(enemy.x + 8 + otherStep * 26 - 8, footY);
      ctx.lineTo(enemy.x + 8 + otherStep * 26 + 8, footY);
      ctx.stroke();

      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x + 12, bodyY - dir * 8, 4, 0, TAU);
      ctx.stroke();
    }

    drawJumperEnemy(enemy, time) {
      const ctx = this.ctx;
      const dir = enemy.side === "top" ? -1 : 1;
      const pulse = Math.sin(time * 12 + enemy.phase) * 3;
      const bodyY = enemy.y - dir * 18;

      ctx.strokeStyle = this.enemyBaseColor(enemy);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 22, bodyY);
      ctx.lineTo(enemy.x, bodyY - dir * (24 + pulse));
      ctx.lineTo(enemy.x + 22, bodyY);
      ctx.lineTo(enemy.x + 10, bodyY + dir * 18);
      ctx.lineTo(enemy.x - 10, bodyY + dir * 18);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 10, bodyY + dir * 18);
      ctx.lineTo(enemy.x - 22, enemy.y);
      ctx.moveTo(enemy.x + 10, bodyY + dir * 18);
      ctx.lineTo(enemy.x + 22, enemy.y);
      ctx.stroke();

      ctx.strokeStyle = COLORS.lime;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x, bodyY - dir * 4, 6, 0, TAU);
      ctx.stroke();
    }

    drawSoul(soul) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(soul.x, soul.y);
      ctx.rotate(soul.spin);
      ctx.strokeStyle = COLORS.amber;
      ctx.shadowColor = COLORS.amber;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-soul.radius, -soul.radius, soul.radius * 2, soul.radius * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawVolcanoShot(shot) {
      const ctx = this.ctx;
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius, 0, TAU);
      ctx.moveTo(shot.x - 10, shot.y);
      ctx.lineTo(shot.x + 10, shot.y);
      ctx.moveTo(shot.x, shot.y - 10);
      ctx.lineTo(shot.x, shot.y + 10);
      ctx.stroke();
    }

    drawCapsule(capsule, time) {
      const ctx = this.ctx;
      ctx.strokeStyle = COLORS.amber;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(capsule.x, capsule.y, 16, 10, Math.sin(time * 4) * 0.6, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = COLORS.lime;
      ctx.beginPath();
      ctx.moveTo(capsule.x - 8, capsule.y);
      ctx.lineTo(capsule.x + 8, capsule.y);
      ctx.moveTo(capsule.x, capsule.y - 8);
      ctx.lineTo(capsule.x, capsule.y + 8);
      ctx.stroke();
    }

    drawPowerGauge(state) {
      const ctx = this.ctx;
      const width = 840;
      const height = 34;
      const x = (state.width - width) / 2;
      const y = state.height - 48;
      const gap = 6;
      const cell = (width - gap * 5) / 6;

      ctx.save();
      ctx.font = "700 14px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let index = 0; index < state.powerups.length; index += 1) {
        const active = state.powerCapsules === index + 1;
        const available = state.powerupAvailable[index];
        const cx = x + index * (cell + gap);
        ctx.shadowColor = active ? COLORS.lime : "rgba(0, 0, 0, 0)";
        ctx.shadowBlur = active ? 12 : 0;
        ctx.fillStyle = active ? "rgba(185, 255, 120, 0.22)" : "rgba(2, 3, 10, 0.72)";
        ctx.strokeStyle = active ? COLORS.lime : "rgba(117, 247, 255, 0.48)";
        ctx.lineWidth = active ? 3 : 1;
        ctx.fillRect(cx, y, cell, height);
        ctx.strokeRect(cx, y, cell, height);

        if (!available) continue;
        ctx.fillStyle = active ? COLORS.lime : "rgba(117, 247, 255, 0.55)";
        ctx.fillText(state.powerups[index], cx + cell / 2, y + height / 2);
      }
      ctx.restore();
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
        const angle = (TAU * i) / 10;
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function removeWhere(list, predicate) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (predicate(list[index])) list.splice(index, 1);
    }
  }

  function cloneState(value) {
    if (value == null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(cloneState);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneState(item)]),
    );
  }

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
})();

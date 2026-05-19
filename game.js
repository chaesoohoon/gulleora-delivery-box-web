"use strict";

(() => {
  const canvas = document.getElementById("game");
  const gl = canvas.getContext("webgl", {
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });

  const ui = {
    menu: document.getElementById("menu"),
    result: document.getElementById("result"),
    startButton: document.getElementById("startButton"),
    retryButton: document.getElementById("retryButton"),
    timeText: document.getElementById("timeText"),
    damageBar: document.getElementById("damageBar"),
    boostBar: document.getElementById("boostBar"),
    stateText: document.getElementById("stateText"),
    stageText: document.getElementById("stageText"),
    resultKicker: document.getElementById("resultKicker"),
    resultTitle: document.getElementById("resultTitle"),
    stars: document.getElementById("stars"),
    finalTime: document.getElementById("finalTime"),
    finalDamage: document.getElementById("finalDamage"),
    finalBonus: document.getElementById("finalBonus"),
  };

  if (!gl) {
    ui.menu.querySelector(".tagline").textContent =
      "이 브라우저에서는 WebGL을 사용할 수 없습니다.";
    ui.startButton.disabled = true;
    return;
  }

  const palette = {
    box: [0.78, 0.56, 0.32],
    boxDark: [0.57, 0.38, 0.22],
    tape: [0.12, 0.52, 0.82],
    tapeGold: [0.95, 0.74, 0.28],
    road: [0.62, 0.66, 0.61],
    roadAlt: [0.72, 0.64, 0.5],
    curb: [0.91, 0.83, 0.66],
    grass: [0.48, 0.69, 0.43],
    sky: [0.62, 0.82, 0.86],
    ink: [0.11, 0.14, 0.18],
    white: [0.98, 0.94, 0.82],
    red: [0.87, 0.32, 0.28],
    blue: [0.26, 0.48, 0.78],
    green: [0.25, 0.64, 0.45],
    amber: [0.9, 0.62, 0.24],
    puddle: [0.25, 0.58, 0.82],
    purple: [0.58, 0.38, 0.7],
  };

  const itemTemplates = [
    { id: "tape-a", type: "tape", x: -1.9, z: 20.5 },
    { id: "wrap-a", type: "wrap", x: 2.35, z: 38 },
    { id: "balloon-a", type: "balloon", x: -2.55, z: 59 },
    { id: "magnet-a", type: "magnet", x: 2.45, z: 83 },
    { id: "sticker-a", type: "sticker", x: -4.35, z: 101 },
    { id: "tape-b", type: "tape", x: 3.2, z: 125 },
    { id: "wrap-b", type: "wrap", x: -2.1, z: 145 },
  ];

  const staticObstacles = [
    { id: "crate-1", x: 2.1, z: 25, size: [1.3, 1.25, 1.3], color: palette.boxDark, damage: 5 },
    { id: "crate-2", x: -2.25, z: 29.5, size: [1.2, 1.1, 1.6], color: [0.65, 0.42, 0.23], damage: 5 },
    { id: "cone-1", x: 1.75, z: 47.5, size: [0.75, 1.1, 0.75], color: palette.amber, damage: 3 },
    { id: "stack-1", x: -2.05, z: 76, size: [1.5, 1.6, 2.0], color: [0.76, 0.48, 0.28], damage: 6 },
    { id: "stall-box", x: 2.05, z: 89, size: [2.1, 0.55, 1.4], color: [0.35, 0.54, 0.42], damage: 4 },
    { id: "rail-1", x: -2.7, z: 136, size: [0.6, 1.8, 0.6], color: [0.7, 0.75, 0.68], damage: 7 },
    { id: "rail-2", x: 2.7, z: 136, size: [0.6, 1.8, 0.6], color: [0.7, 0.75, 0.68], damage: 7 },
  ];

  const puddles = [
    { x: 2.35, z: 112, sx: 2.4, sz: 3.3 },
    { x: -2.4, z: 121, sx: 2.1, sz: 2.2 },
    { x: 1.1, z: 148, sx: 3.1, sz: 2.0 },
  ];

  const controls = {
    forward: false,
    back: false,
    left: false,
    right: false,
    brake: false,
  };

  let jumpQueued = false;
  let mode = "menu";
  let lastTime = 0;
  let elapsed = 0;
  let hitCooldown = 0;
  let audioContext = null;

  const player = {
    pos: { x: 0, y: 0.65, z: 4 },
    vel: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0 },
    onGround: false,
    damage: 0,
    boost: 35,
    boostTime: 0,
    shieldTime: 0,
    balloonTime: 0,
    magnetTime: 0,
    wetTime: 0,
    time: 0,
    limit: 92,
    bonuses: 0,
    bestShortcut: false,
  };

  let items = [];

  const camera = {
    eye: { x: 0, y: 7, z: -8 },
    target: { x: 0, y: 2, z: 8 },
    shake: 0,
  };

  const scenic = buildScenicObjects();
  const program = createProgram();
  const meshes = {
    cube: createMesh(createBoxGeometry()),
    cylinder: createMesh(createCylinderGeometry(18)),
    sphere: createMesh(createSphereGeometry(14, 7)),
  };

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(program.handle);

  resetGame();
  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(loop);

  ui.startButton.addEventListener("click", () => startGame());
  ui.retryButton.addEventListener("click", () => startGame());

  window.addEventListener("keydown", (event) => {
    const control = keyToControl(event.key);
    if (!control) {
      if (event.key === "Enter" && mode !== "playing") startGame();
      return;
    }

    event.preventDefault();
    ensureAudio();

    if (control === "jump") {
      if (!event.repeat) jumpQueued = true;
      return;
    }

    if (control === "boost") {
      if (!event.repeat) triggerBoost();
      return;
    }

    controls[control] = true;
  });

  window.addEventListener("keyup", (event) => {
    const control = keyToControl(event.key);
    if (control && controls[control] !== undefined) controls[control] = false;
  });

  document.querySelectorAll("[data-control]").forEach((button) => {
    const control = button.dataset.control;

    const press = (event) => {
      event.preventDefault();
      ensureAudio();
      button.classList.add("is-down");

      if (control === "jump") jumpQueued = true;
      else if (control === "boost") triggerBoost();
      else controls[control] = true;
    };

    const release = (event) => {
      event.preventDefault();
      button.classList.remove("is-down");
      if (controls[control] !== undefined) controls[control] = false;
    };

    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
  });

  function keyToControl(key) {
    const normalized = key.toLowerCase();
    if (normalized === "w" || normalized === "arrowup") return "forward";
    if (normalized === "s" || normalized === "arrowdown") return "back";
    if (normalized === "a" || normalized === "arrowleft") return "left";
    if (normalized === "d" || normalized === "arrowright") return "right";
    if (normalized === " " || normalized === "spacebar") return "jump";
    if (normalized === "shift") return "brake";
    if (normalized === "e" || normalized === "control" || normalized === "ctrl") return "boost";
    return null;
  }

  function resetGame() {
    player.pos.x = 0;
    player.pos.z = 4;
    player.pos.y = terrainHeight(4) + 0.65;
    player.vel.x = 0;
    player.vel.y = 0;
    player.vel.z = 0;
    player.rot.x = 0;
    player.rot.y = 0;
    player.rot.z = 0;
    player.onGround = false;
    player.damage = 0;
    player.boost = 35;
    player.boostTime = 0;
    player.shieldTime = 0;
    player.balloonTime = 0;
    player.magnetTime = 0;
    player.wetTime = 0;
    player.time = 0;
    player.bonuses = 0;
    player.bestShortcut = false;
    hitCooldown = 0;
    elapsed = 0;
    items = itemTemplates.map((item) => ({ ...item, taken: false }));
    updateHud();
  }

  function startGame() {
    ensureAudio();
    resetGame();
    mode = "playing";
    ui.menu.classList.add("hidden");
    ui.result.classList.add("hidden");
    canvas.focus();
    tone(430, 0.08, "triangle", 0.045);
    setTimeout(() => tone(620, 0.08, "triangle", 0.04), 80);
  }

  function endGame(success) {
    if (mode !== "playing") return;
    mode = success ? "clear" : "fail";

    const timeUsed = Math.min(player.time, player.limit);
    const stars = success ? calculateStars(timeUsed) : 0;
    const best = Number(localStorage.getItem("delivery-box-best") || 0);
    if (success && (!best || timeUsed < best)) {
      localStorage.setItem("delivery-box-best", String(timeUsed));
    }

    ui.resultKicker.textContent = success ? "배송 완료" : "배송 실패";
    ui.resultTitle.textContent = success ? "목적지 도착" : player.damage >= 100 ? "상자가 망가졌습니다" : "시간 초과";
    ui.stars.textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    ui.finalTime.textContent = `${timeUsed.toFixed(1)}초`;
    ui.finalDamage.textContent = `${Math.round(player.damage)}%`;
    ui.finalBonus.textContent = `${player.bonuses}개`;
    ui.result.classList.remove("hidden");

    tone(success ? 720 : 180, 0.14, success ? "triangle" : "sawtooth", 0.06);
    if (success) setTimeout(() => tone(920, 0.16, "triangle", 0.055), 130);
  }

  function calculateStars(timeUsed) {
    let stars = 1;
    if (timeUsed < 66 || player.bonuses >= 5) stars += 1;
    if (player.damage < 38 && player.bonuses >= 3) stars += 1;
    return Math.min(3, stars);
  }

  function loop(now) {
    const seconds = now * 0.001;
    const dt = Math.min(0.033, seconds - lastTime || 0.016);
    lastTime = seconds;

    if (mode === "playing") update(dt);
    else updateAttract(dt);

    render();
    requestAnimationFrame(loop);
  }

  function updateAttract(dt) {
    elapsed += dt;
    player.rot.y += dt * 0.45;
    player.rot.x += dt * 0.22;
    updateCamera(dt, true);
  }

  function update(dt) {
    elapsed += dt;
    player.time += dt;
    hitCooldown = Math.max(0, hitCooldown - dt);
    player.boostTime = Math.max(0, player.boostTime - dt);
    player.shieldTime = Math.max(0, player.shieldTime - dt);
    player.balloonTime = Math.max(0, player.balloonTime - dt);
    player.magnetTime = Math.max(0, player.magnetTime - dt);
    player.wetTime = Math.max(0, player.wetTime - dt);

    const input = getInputVector();
    const damagedWobble = player.damage > 58 ? Math.sin(elapsed * 9.5) * 0.32 : 0;
    const slippery = player.wetTime > 0;
    const steerPower = slippery ? 12.5 : 18.5;

    if (input.length > 0) {
      player.vel.x += (input.x + damagedWobble) * steerPower * dt;
      player.vel.z += input.z * steerPower * dt;
    } else if (player.damage > 72) {
      player.vel.x += damagedWobble * 4.2 * dt;
    }

    const slope = terrainSlope(player.pos.z);
    player.vel.z += -9.4 * slope * dt;

    if (player.magnetTime > 0) {
      const goal = { x: 0, z: 158 };
      const dx = goal.x - player.pos.x;
      const dz = goal.z - player.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      player.vel.x += (dx / len) * 2.2 * dt;
      player.vel.z += (dz / len) * 2.2 * dt;
    }

    if (controls.brake && player.onGround) {
      player.vel.x *= Math.exp(-11 * dt);
      player.vel.z *= Math.exp(-11 * dt);
    }

    if (player.boostTime > 0) {
      const boostDir = input.length > 0 ? input : forwardFromVelocity();
      player.vel.x += boostDir.x * 32 * dt;
      player.vel.z += boostDir.z * 32 * dt;
    }

    const friction = player.onGround ? (slippery ? 0.42 : 1.5) : 0.08;
    player.vel.x *= Math.exp(-friction * dt);
    player.vel.z *= Math.exp(-friction * dt);

    const maxSpeed = player.boostTime > 0 ? 19 : 13;
    const flatSpeed = Math.hypot(player.vel.x, player.vel.z);
    if (flatSpeed > maxSpeed) {
      const scale = maxSpeed / flatSpeed;
      player.vel.x *= scale;
      player.vel.z *= scale;
    }

    if (jumpQueued && player.onGround) {
      const jumpPower = player.balloonTime > 0 ? 9.8 : 7.0;
      player.vel.y = jumpPower;
      player.onGround = false;
      tone(player.balloonTime > 0 ? 640 : 520, 0.06, "triangle", 0.035);
    }
    jumpQueued = false;

    player.vel.y -= 14.5 * dt;
    player.pos.x += player.vel.x * dt;
    player.pos.y += player.vel.y * dt;
    player.pos.z += player.vel.z * dt;

    resolveGround(dt);
    resolveBounds();
    resolveObstacles();
    collectItems();
    updateRollingRotation(dt);

    player.boost = clamp(player.boost + dt * (7.2 + flatSpeed * 0.55), 0, 100);

    if (isInPuddle(player.pos.x, player.pos.z) && player.onGround) {
      player.wetTime = Math.max(player.wetTime, 3.5);
    }

    if (player.pos.z > 99 && player.pos.z < 116 && player.pos.x < -4.2) {
      player.bestShortcut = true;
    }

    if (player.pos.z > 154.5 && Math.abs(player.pos.x) < 2.6) {
      endGame(true);
    } else if (player.time >= player.limit || player.damage >= 100) {
      endGame(false);
    }

    updateCamera(dt, false);
    updateHud();
  }

  function getInputVector() {
    let x = 0;
    let z = 0;
    if (controls.left) x -= 1;
    if (controls.right) x += 1;
    if (controls.forward) z += 1;
    if (controls.back) z -= 1;

    const length = Math.hypot(x, z);
    if (!length) return { x: 0, z: 0, length: 0 };
    return { x: x / length, z: z / length, length };
  }

  function forwardFromVelocity() {
    const speed = Math.hypot(player.vel.x, player.vel.z);
    if (speed > 0.6) return { x: player.vel.x / speed, z: player.vel.z / speed, length: 1 };
    return { x: 0, z: 1, length: 1 };
  }

  function triggerBoost() {
    if (mode !== "playing" || player.boost < 100 || player.boostTime > 0) return;
    player.boost = 0;
    player.boostTime = 0.9;
    camera.shake = Math.max(camera.shake, 0.18);
    tone(180, 0.05, "sawtooth", 0.03);
    setTimeout(() => tone(360, 0.1, "sawtooth", 0.035), 45);
  }

  function resolveGround() {
    const ground = terrainHeight(player.pos.z);
    const half = 0.65;
    const floorY = ground + half;

    if (player.pos.y <= floorY) {
      const impact = Math.abs(player.vel.y);
      player.pos.y = floorY;
      if (player.vel.y < -8) {
        player.vel.y = -player.vel.y * 0.18;
        applyDamage((impact - 7) * 1.8);
        camera.shake = Math.max(camera.shake, 0.16);
        tone(150 + impact * 18, 0.06, "square", 0.035);
      } else {
        player.vel.y = 0;
      }
      player.onGround = true;
    } else {
      player.onGround = false;
    }
  }

  function resolveBounds() {
    const halfWidth = trackHalfWidth(player.pos.z);
    const limit = halfWidth - 0.65;

    if (player.pos.x < -limit) {
      player.pos.x = -limit;
      player.vel.x = Math.abs(player.vel.x) * 0.35;
      applyDamage(3.5);
    }

    if (player.pos.x > limit) {
      player.pos.x = limit;
      player.vel.x = -Math.abs(player.vel.x) * 0.35;
      applyDamage(3.5);
    }
  }

  function resolveObstacles() {
    const all = getObstacleInstances();
    const playerBox = { x: player.pos.x, y: player.pos.y, z: player.pos.z, sx: 1.28, sy: 1.28, sz: 1.28 };

    for (const obstacle of all) {
      if (obstacle.noCollide) continue;
      const overlap = aabbOverlap(playerBox, obstacle);
      if (!overlap.hit) continue;

      if (overlap.x < overlap.z) {
        const sign = player.pos.x < obstacle.x ? -1 : 1;
        player.pos.x += sign * overlap.x;
        player.vel.x = -player.vel.x * 0.35 + (obstacle.vx || 0) * 0.55;
      } else {
        const sign = player.pos.z < obstacle.z ? -1 : 1;
        player.pos.z += sign * overlap.z;
        player.vel.z = -player.vel.z * 0.35 + (obstacle.vz || 0) * 0.55;
      }

      const relativeSpeed = Math.hypot(player.vel.x - (obstacle.vx || 0), player.vel.z - (obstacle.vz || 0));
      if (hitCooldown <= 0) {
        applyDamage(Math.max(2.5, relativeSpeed * (obstacle.damage || 4)));
        hitCooldown = 0.2;
        camera.shake = Math.max(camera.shake, 0.12 + Math.min(0.25, relativeSpeed * 0.025));
        tone(95 + relativeSpeed * 22, 0.05, "square", 0.035);
      }
    }
  }

  function aabbOverlap(a, b) {
    const ox = (a.sx + b.sx) * 0.5 - Math.abs(a.x - b.x);
    const oy = (a.sy + b.sy) * 0.5 - Math.abs(a.y - b.y);
    const oz = (a.sz + b.sz) * 0.5 - Math.abs(a.z - b.z);
    return { hit: ox > 0 && oy > 0 && oz > 0, x: ox, y: oy, z: oz };
  }

  function collectItems() {
    for (const item of items) {
      if (item.taken) continue;
      const dy = player.pos.y - (terrainHeight(item.z) + 1.05);
      const distance = Math.hypot(player.pos.x - item.x, player.pos.z - item.z);
      if (distance > 1.2 || Math.abs(dy) > 1.6) continue;

      item.taken = true;
      player.bonuses += 1;
      if (item.type === "tape") player.boost = clamp(player.boost + 55, 0, 100);
      if (item.type === "wrap") player.shieldTime = Math.max(player.shieldTime, 7.5);
      if (item.type === "balloon") player.balloonTime = Math.max(player.balloonTime, 7);
      if (item.type === "magnet") player.magnetTime = Math.max(player.magnetTime, 8);
      if (item.type === "sticker") player.bestShortcut = true;

      camera.shake = Math.max(camera.shake, 0.08);
      tone(760, 0.05, "triangle", 0.035);
      setTimeout(() => tone(980, 0.08, "triangle", 0.035), 55);
    }
  }

  function applyDamage(amount) {
    if (player.shieldTime > 0) amount *= 0.35;
    player.damage = clamp(player.damage + amount, 0, 100);
  }

  function updateRollingRotation(dt) {
    if (!player.onGround) {
      player.rot.x += player.vel.z * dt * 0.45;
      player.rot.z -= player.vel.x * dt * 0.45;
      return;
    }

    const radius = 0.65;
    player.rot.x += (player.vel.z / radius) * dt;
    player.rot.z -= (player.vel.x / radius) * dt;
    player.rot.y += Math.sin(elapsed * 7) * (player.damage / 100) * dt * 0.7;
  }

  function updateCamera(dt, attract) {
    const desiredTarget = attract
      ? { x: 0, y: 2.2, z: 18 + Math.sin(elapsed * 0.35) * 3 }
      : { x: player.pos.x * 0.45, y: player.pos.y + 1.2, z: player.pos.z + 5.6 };
    const desiredEye = attract
      ? { x: Math.sin(elapsed * 0.3) * 9, y: 7.3, z: -10 + Math.cos(elapsed * 0.3) * 4 }
      : { x: player.pos.x * 0.7, y: player.pos.y + 6.4, z: player.pos.z - 10.8 };

    const shake = camera.shake;
    camera.shake = Math.max(0, camera.shake - dt * 1.8);
    desiredEye.x += (Math.random() - 0.5) * shake;
    desiredEye.y += (Math.random() - 0.5) * shake * 0.6;

    const smooth = 1 - Math.exp(-(attract ? 1.8 : 6.5) * dt);
    lerpVec(camera.eye, desiredEye, smooth);
    lerpVec(camera.target, desiredTarget, smooth);
  }

  function updateHud() {
    const remaining = Math.max(0, player.limit - player.time);
    ui.timeText.textContent = Math.ceil(remaining);
    ui.damageBar.style.width = `${player.damage}%`;
    ui.boostBar.style.width = `${player.boost}%`;
    ui.stateText.textContent = currentStateText();
    ui.stageText.textContent = stageName(player.pos.z);
  }

  function currentStateText() {
    const states = [];
    if (player.damage > 58) states.push("찌그러짐");
    if (player.wetTime > 0) states.push("젖음");
    if (player.shieldTime > 0) states.push("완충");
    if (player.balloonTime > 0) states.push("가벼움");
    if (player.magnetTime > 0) states.push("자석");
    if (player.boostTime > 0) states.push("돌진");
    if (states.length === 0) return player.damage > 20 ? "살짝 구겨짐" : "멀쩡함";
    return states.join(" · ");
  }

  function stageName(z) {
    if (z < 35) return "편의점 앞 배달";
    if (z < 66) return "계단 골목 배달";
    if (z < 96) return "시장 골목 배달";
    if (z < 125) return "아파트 언덕 배달";
    return "지하주차장 배달";
  }

  function render() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(palette.sky[0], palette.sky[1], palette.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height;
    const projection = mat4Perspective((58 * Math.PI) / 180, aspect, 0.1, 420);
    const view = mat4LookAt(camera.eye, camera.target, { x: 0, y: 1, z: 0 });
    program.projectionView = mat4Multiply(projection, view);

    drawWorld();
    drawItems();
    drawGoal();
    drawPlayer();
  }

  function drawWorld() {
    drawBox({ x: 0, y: -0.22, z: 82 }, { x: 62, y: 0.3, z: 184 }, palette.grass);

    drawRoadSegment(0, 18, 6.7, terrainHeight(0), terrainHeight(18), palette.road);
    drawRoadSegment(18, 42, 6.2, terrainHeight(18), terrainHeight(42), palette.roadAlt);
    drawStairs();
    drawRoadSegment(64, 92, 5.8, terrainHeight(64), terrainHeight(92), palette.road);
    drawRoadSegment(92, 122, 7.4, terrainHeight(92), terrainHeight(122), [0.56, 0.63, 0.58]);
    drawRoadSegment(122, 166, 7.9, terrainHeight(122), terrainHeight(166), [0.5, 0.53, 0.55]);

    drawCurbs();
    drawCenterMarks();
    drawPuddles();
    drawScenic();
    drawObstacles();
  }

  function drawRoadSegment(z0, z1, width, h0, h1, color) {
    const length = z1 - z0;
    const z = (z0 + z1) * 0.5;
    const y = (h0 + h1) * 0.5 - 0.08;
    const angle = Math.atan2(h1 - h0, length);
    drawBox({ x: 0, y, z }, { x: width, y: 0.24, z: length }, color, { x: -angle, y: 0, z: 0 });
  }

  function drawStairs() {
    for (let i = 0; i < 10; i += 1) {
      const z0 = 42 + i * 2.2;
      const z = z0 + 1.1;
      const h = 3.12 + i * 0.28;
      drawBox({ x: 0, y: h - 0.08, z }, { x: 6.0, y: 0.26, z: 2.06 }, i % 2 ? [0.66, 0.61, 0.55] : [0.74, 0.68, 0.58]);
      drawBox({ x: 0, y: h + 0.08, z: z0 + 0.08 }, { x: 6.0, y: 0.36, z: 0.18 }, [0.48, 0.44, 0.4]);
    }
  }

  function drawCurbs() {
    const segments = [
      [0, 18, 3.65],
      [18, 42, 3.4],
      [42, 64, 3.35],
      [64, 92, 3.1],
      [92, 122, 4.0],
      [122, 166, 4.25],
    ];

    for (const [z0, z1, x] of segments) {
      const h0 = terrainHeight(z0);
      const h1 = terrainHeight(z1);
      const len = z1 - z0;
      const z = (z0 + z1) * 0.5;
      const y = (h0 + h1) * 0.5 + 0.05;
      const angle = Math.atan2(h1 - h0, len);
      drawBox({ x, y, z }, { x: 0.26, y: 0.36, z: len }, palette.curb, { x: -angle, y: 0, z: 0 });
      drawBox({ x: -x, y, z }, { x: 0.26, y: 0.36, z: len }, palette.curb, { x: -angle, y: 0, z: 0 });
    }
  }

  function drawCenterMarks() {
    for (let z = 8; z < 154; z += 8) {
      const h = terrainHeight(z);
      drawBox({ x: 0, y: h + 0.04, z }, { x: 0.12, y: 0.04, z: 2.4 }, [0.95, 0.9, 0.62]);
    }
  }

  function drawPuddles() {
    for (const puddle of puddles) {
      drawBox(
        { x: puddle.x, y: terrainHeight(puddle.z) + 0.045, z: puddle.z },
        { x: puddle.sx, y: 0.035, z: puddle.sz },
        palette.puddle,
        { x: 0, y: Math.sin(elapsed + puddle.z) * 0.08, z: 0 },
      );
    }
  }

  function drawScenic() {
    for (const obj of scenic) {
      const y = terrainHeight(obj.z) + obj.size[1] * 0.5 - 0.05;
      drawBox({ x: obj.x, y, z: obj.z }, { x: obj.size[0], y: obj.size[1], z: obj.size[2] }, obj.color);

      if (obj.sign) {
        const signX = obj.x > 0 ? obj.x - obj.size[0] * 0.51 : obj.x + obj.size[0] * 0.51;
        drawBox({ x: signX, y: y + obj.size[1] * 0.18, z: obj.z }, { x: 0.12, y: 0.55, z: 1.7 }, obj.sign);
      }
    }

    for (let z = 68; z <= 96; z += 7) {
      const h = terrainHeight(z);
      drawBox({ x: -5.2, y: h + 0.85, z }, { x: 1.6, y: 1.7, z: 2.1 }, [0.66, 0.42, 0.3]);
      drawBox({ x: -5.2, y: h + 1.85, z }, { x: 2.0, y: 0.25, z: 2.45 }, [0.88, 0.42, 0.32]);
      drawBox({ x: 5.2, y: h + 0.85, z: z + 2.8 }, { x: 1.6, y: 1.7, z: 2.1 }, [0.36, 0.56, 0.46]);
      drawBox({ x: 5.2, y: h + 1.85, z: z + 2.8 }, { x: 2.0, y: 0.25, z: 2.45 }, [0.95, 0.72, 0.34]);
    }
  }

  function drawObstacles() {
    for (const obstacle of getObstacleInstances()) {
      if (obstacle.mesh === "sphere") {
        drawSphere({ x: obstacle.x, y: obstacle.y, z: obstacle.z }, { x: obstacle.sx, y: obstacle.sy, z: obstacle.sz }, obstacle.color);
      } else if (obstacle.mesh === "cylinder") {
        drawCylinder({ x: obstacle.x, y: obstacle.y, z: obstacle.z }, { x: obstacle.sx, y: obstacle.sy, z: obstacle.sz }, obstacle.color, obstacle.rot || { x: 0, y: 0, z: 0 });
      } else {
        drawBox(
          { x: obstacle.x, y: obstacle.y, z: obstacle.z },
          { x: obstacle.sx, y: obstacle.sy, z: obstacle.sz },
          obstacle.color,
          obstacle.rot || { x: 0, y: 0, z: 0 },
        );
      }
    }
  }

  function drawItems() {
    for (const item of items) {
      if (item.taken) continue;

      const y = terrainHeight(item.z) + 1.1 + Math.sin(elapsed * 3 + item.z) * 0.12;
      const spin = { x: 0, y: elapsed * 2.4, z: 0 };

      if (item.type === "tape") {
        drawCylinder({ x: item.x, y, z: item.z }, { x: 0.9, y: 0.28, z: 0.9 }, palette.tape, { x: Math.PI * 0.5, y: elapsed, z: 0 });
        drawCylinder({ x: item.x, y, z: item.z }, { x: 0.45, y: 0.32, z: 0.45 }, palette.white, { x: Math.PI * 0.5, y: elapsed, z: 0 });
      } else if (item.type === "wrap") {
        drawBox({ x: item.x, y, z: item.z }, { x: 0.9, y: 0.9, z: 0.9 }, [0.72, 0.92, 0.9], spin);
        drawBox({ x: item.x, y, z: item.z }, { x: 1.0, y: 0.12, z: 1.0 }, palette.white, spin);
      } else if (item.type === "balloon") {
        drawSphere({ x: item.x, y: y + 0.2, z: item.z }, { x: 0.75, y: 0.95, z: 0.75 }, [0.9, 0.32, 0.45]);
        drawBox({ x: item.x, y: y - 0.55, z: item.z }, { x: 0.05, y: 0.72, z: 0.05 }, palette.ink);
      } else if (item.type === "magnet") {
        drawBox({ x: item.x - 0.22, y, z: item.z }, { x: 0.22, y: 0.95, z: 0.22 }, palette.red, spin);
        drawBox({ x: item.x + 0.22, y, z: item.z }, { x: 0.22, y: 0.95, z: 0.22 }, palette.blue, spin);
        drawBox({ x: item.x, y: y + 0.42, z: item.z }, { x: 0.68, y: 0.22, z: 0.22 }, palette.ink, spin);
      } else {
        drawBox({ x: item.x, y, z: item.z }, { x: 1.0, y: 0.08, z: 0.72 }, palette.amber, { x: -0.3, y: elapsed * 2, z: 0.2 });
        drawBox({ x: item.x, y: y + 0.08, z: item.z }, { x: 0.72, y: 0.07, z: 0.46 }, palette.green, { x: -0.3, y: elapsed * 2, z: 0.2 });
      }
    }
  }

  function drawGoal() {
    const z = 158;
    const h = terrainHeight(z);
    const pulse = 1 + Math.sin(elapsed * 4) * 0.04;
    drawBox({ x: 0, y: h + 0.06, z }, { x: 5.2, y: 0.08, z: 3.2 }, [0.38, 0.66, 0.45]);
    drawBox({ x: -2.7, y: h + 1.6, z }, { x: 0.35, y: 3.2, z: 0.35 }, palette.green);
    drawBox({ x: 2.7, y: h + 1.6, z }, { x: 0.35, y: 3.2, z: 0.35 }, palette.green);
    drawBox({ x: 0, y: h + 3.1, z }, { x: 5.7 * pulse, y: 0.35, z: 0.35 }, palette.amber);
    drawBox({ x: 0, y: h + 2.55, z: z - 0.22 }, { x: 2.4, y: 0.72, z: 0.1 }, palette.white);
  }

  function drawPlayer() {
    const dent = player.damage / 100;
    const bodyScale = {
      x: 1.28 + dent * 0.18,
      y: 1.28 - dent * 0.2,
      z: 1.28 + dent * 0.12,
    };
    const tint = player.wetTime > 0 ? [0.58, 0.52, 0.43] : player.damage > 58 ? [0.68, 0.46, 0.27] : palette.box;
    const base = modelMatrix(player.pos, player.rot, bodyScale);

    drawMesh(meshes.cube, base, tint);

    drawChildBox(base, { x: -0.22, y: 0.18, z: 0.515 }, { x: 0.16, y: 0.16, z: 0.035 }, palette.ink);
    drawChildBox(base, { x: 0.22, y: 0.18, z: 0.515 }, { x: 0.16, y: 0.16, z: 0.035 }, palette.ink);
    drawChildBox(base, { x: 0, y: -0.08, z: 0.52 }, { x: 0.36, y: 0.07, z: 0.035 }, palette.red);
    drawChildBox(base, { x: 0, y: 0, z: 0.535 }, { x: 0.15, y: 1.03, z: 0.04 }, player.boostTime > 0 ? palette.tapeGold : palette.tape);
    drawChildBox(base, { x: 0, y: 0, z: 0.54 }, { x: 1.03, y: 0.14, z: 0.04 }, player.boostTime > 0 ? palette.tapeGold : palette.tape);

    if (player.shieldTime > 0) {
      const guard = modelMatrix(player.pos, { x: 0, y: elapsed * 1.4, z: 0 }, { x: 1, y: 1, z: 1 });
      drawChildBox(guard, { x: 0, y: 0.86, z: 0 }, { x: 1.92, y: 0.06, z: 0.06 }, [0.58, 0.87, 0.84]);
      drawChildBox(guard, { x: 0, y: -0.86, z: 0 }, { x: 1.92, y: 0.06, z: 0.06 }, [0.58, 0.87, 0.84]);
      drawChildBox(guard, { x: -0.96, y: 0, z: 0 }, { x: 0.06, y: 1.72, z: 0.06 }, [0.58, 0.87, 0.84]);
      drawChildBox(guard, { x: 0.96, y: 0, z: 0 }, { x: 0.06, y: 1.72, z: 0.06 }, [0.58, 0.87, 0.84]);
    }

    if (player.balloonTime > 0) {
      drawSphere({ x: player.pos.x, y: player.pos.y + 1.7, z: player.pos.z }, { x: 0.7, y: 0.92, z: 0.7 }, [0.92, 0.36, 0.45]);
      drawBox({ x: player.pos.x, y: player.pos.y + 1.05, z: player.pos.z }, { x: 0.04, y: 0.8, z: 0.04 }, palette.ink);
    }

    const shadowY = terrainHeight(player.pos.z) + 0.025;
    drawBox({ x: player.pos.x, y: shadowY, z: player.pos.z }, { x: 1.52, y: 0.025, z: 1.52 }, [0.18, 0.21, 0.19]);
  }

  function getObstacleInstances() {
    const instances = [];

    for (const obstacle of staticObstacles) {
      const h = terrainHeight(obstacle.z);
      instances.push({
        id: obstacle.id,
        x: obstacle.x,
        y: h + obstacle.size[1] * 0.5,
        z: obstacle.z,
        sx: obstacle.size[0],
        sy: obstacle.size[1],
        sz: obstacle.size[2],
        color: obstacle.color,
        damage: obstacle.damage,
      });
    }

    const footX = Math.sin(elapsed * 1.75) * 4.35;
    instances.push({
      id: "shoe",
      x: footX,
      y: terrainHeight(34.5) + 0.26,
      z: 34.5,
      sx: 1.15,
      sy: 0.5,
      sz: 2.15,
      vx: Math.cos(elapsed * 1.75) * 7.6,
      color: [0.17, 0.17, 0.18],
      damage: 4,
    });

    const ballX = Math.sin(elapsed * 1.35 + 1.4) * 2.9;
    instances.push({
      id: "ball",
      x: ballX,
      y: terrainHeight(58) + 0.58,
      z: 58,
      sx: 1.15,
      sy: 1.15,
      sz: 1.15,
      vx: Math.cos(elapsed * 1.35 + 1.4) * 3.9,
      color: [0.93, 0.5, 0.28],
      mesh: "sphere",
      damage: 3.2,
    });

    const cartX = Math.sin(elapsed * 1.12 + 2) * 4.1;
    instances.push({
      id: "cart",
      x: cartX,
      y: terrainHeight(82) + 0.72,
      z: 82,
      sx: 1.35,
      sy: 1.25,
      sz: 2.25,
      vx: Math.cos(elapsed * 1.12 + 2) * 4.6,
      color: [0.42, 0.57, 0.62],
      damage: 5.5,
    });

    const open = (Math.sin(elapsed * 1.35) + 1) * 0.5;
    const doorGap = 0.58 + open * 2.1;
    const doorWidth = Math.max(0.35, 2.85 - open * 1.2);
    instances.push({
      id: "door-left",
      x: -doorGap,
      y: terrainHeight(68.5) + 1.15,
      z: 68.5,
      sx: doorWidth,
      sy: 2.3,
      sz: 0.24,
      color: [0.38, 0.68, 0.74],
      damage: 3,
    });
    instances.push({
      id: "door-right",
      x: doorGap,
      y: terrainHeight(68.5) + 1.15,
      z: 68.5,
      sx: doorWidth,
      sy: 2.3,
      sz: 0.24,
      color: [0.38, 0.68, 0.74],
      damage: 3,
    });

    const bikePhase = (elapsed * 0.19) % 1;
    const bikeX = 6.8 - bikePhase * 13.6;
    instances.push({
      id: "bike",
      x: bikeX,
      y: terrainHeight(130.5) + 0.62,
      z: 130.5,
      sx: 2.4,
      sy: 1.08,
      sz: 0.9,
      vx: -13.6 * 0.19,
      color: [0.83, 0.22, 0.24],
      damage: 8,
    });

    const barrierOpen = (Math.sin(elapsed * 1.7) + 1) * 0.5;
    const barrierAngle = barrierOpen * 1.12;
    const isOpenEnough = barrierOpen > 0.66;
    instances.push({
      id: "barrier",
      x: 0,
      y: terrainHeight(144.5) + 1.35 + Math.sin(barrierAngle) * 1.25,
      z: 144.5,
      sx: 6.4,
      sy: 0.22,
      sz: 0.26,
      color: [0.95, 0.82, 0.38],
      rot: { x: 0, y: 0, z: -barrierAngle },
      noCollide: isOpenEnough,
      damage: 4,
    });

    return instances;
  }

  function terrainHeight(z) {
    if (z < 18) return 0;
    if (z < 42) return (z - 18) * 0.13;
    if (z < 64) {
      const step = clamp(Math.floor((z - 42) / 2.2), 0, 9);
      return 3.12 + step * 0.28;
    }
    if (z < 92) return 5.92;
    if (z < 122) return 5.92 - (z - 92) * 0.095;
    return 3.07;
  }

  function terrainSlope(z) {
    const dz = 0.35;
    return (terrainHeight(z + dz) - terrainHeight(z - dz)) / (dz * 2);
  }

  function trackHalfWidth(z) {
    if (z < 42) return 3.2;
    if (z < 64) return 3.05;
    if (z < 92) return 2.9;
    if (z < 122) return 3.7;
    return 3.95;
  }

  function isInPuddle(x, z) {
    return puddles.some((puddle) => Math.abs(x - puddle.x) < puddle.sx * 0.5 && Math.abs(z - puddle.z) < puddle.sz * 0.5);
  }

  function buildScenicObjects() {
    const colors = [
      [0.85, 0.64, 0.46],
      [0.64, 0.72, 0.74],
      [0.74, 0.55, 0.6],
      [0.66, 0.73, 0.52],
      [0.78, 0.69, 0.48],
    ];
    const signs = [palette.red, palette.blue, palette.green, palette.amber];
    const objects = [];

    for (let z = -4; z < 170; z += 8.5) {
      for (const side of [-1, 1]) {
        const r = random01(z * 13.7 + side * 5.3);
        const width = 2.8 + random01(z + side * 21) * 1.8;
        const height = 2.8 + random01(z * 2.1 + side) * 3.5;
        const depth = 3.0 + random01(z * 0.7 - side) * 2.1;
        const road = trackHalfWidth(Math.max(0, z));
        objects.push({
          x: side * (road + 3.0 + r * 1.1),
          z,
          size: [width, height, depth],
          color: colors[Math.floor(random01(z * 1.3 + side * 9) * colors.length)],
          sign: random01(z + side * 40) > 0.55 ? signs[Math.floor(random01(z * 4.7) * signs.length)] : null,
        });
      }
    }

    return objects;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(window.innerWidth * dpr));
    const height = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function createProgram() {
    const vertex = `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      uniform mat4 uMVP;
      varying vec3 vColor;

      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
        vColor = aColor;
      }
    `;

    const fragment = `
      precision mediump float;
      uniform vec3 uTint;
      varying vec3 vColor;

      void main() {
        gl_FragColor = vec4(vColor * uTint, 1.0);
      }
    `;

    const handle = gl.createProgram();
    gl.attachShader(handle, compileShader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(handle, compileShader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(handle);

    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(handle) || "WebGL program link failed");
    }

    return {
      handle,
      attributes: {
        position: gl.getAttribLocation(handle, "aPosition"),
        color: gl.getAttribLocation(handle, "aColor"),
      },
      uniforms: {
        mvp: gl.getUniformLocation(handle, "uMVP"),
        tint: gl.getUniformLocation(handle, "uTint"),
      },
      projectionView: mat4Identity(),
    };
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader compile failed");
    }
    return shader;
  }

  function createMesh(geometry) {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.positions), gl.STATIC_DRAW);

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.colors), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.indices), gl.STATIC_DRAW);

    return {
      positionBuffer,
      colorBuffer,
      indexBuffer,
      indexCount: geometry.indices.length,
    };
  }

  function createBoxGeometry() {
    const positions = [];
    const colors = [];
    const indices = [];
    const faces = [
      { points: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], shade: 1.0 },
      { points: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]], shade: 0.72 },
      { points: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]], shade: 1.12 },
      { points: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]], shade: 0.58 },
      { points: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]], shade: 0.88 },
      { points: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]], shade: 0.8 },
    ];

    for (const face of faces) {
      const start = positions.length / 3;
      for (const point of face.points) {
        positions.push(point[0], point[1], point[2]);
        colors.push(face.shade, face.shade, face.shade);
      }
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }

    return { positions, colors, indices };
  }

  function createCylinderGeometry(segments) {
    const positions = [];
    const colors = [];
    const indices = [];

    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const x0 = Math.cos(a0) * 0.5;
      const z0 = Math.sin(a0) * 0.5;
      const x1 = Math.cos(a1) * 0.5;
      const z1 = Math.sin(a1) * 0.5;
      const shade = 0.75 + (Math.cos(a0) + 1) * 0.13;
      const start = positions.length / 3;

      positions.push(x0, -0.5, z0, x1, -0.5, z1, x1, 0.5, z1, x0, 0.5, z0);
      for (let j = 0; j < 4; j += 1) colors.push(shade, shade, shade);
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);

      const top = positions.length / 3;
      positions.push(0, 0.5, 0, x0, 0.5, z0, x1, 0.5, z1);
      colors.push(1.08, 1.08, 1.08, 1.08, 1.08, 1.08, 1.08, 1.08, 1.08);
      indices.push(top, top + 1, top + 2);

      const bottom = positions.length / 3;
      positions.push(0, -0.5, 0, x1, -0.5, z1, x0, -0.5, z0);
      colors.push(0.58, 0.58, 0.58, 0.58, 0.58, 0.58, 0.58, 0.58, 0.58);
      indices.push(bottom, bottom + 1, bottom + 2);
    }

    return { positions, colors, indices };
  }

  function createSphereGeometry(segments, rings) {
    const positions = [];
    const colors = [];
    const indices = [];

    for (let y = 0; y <= rings; y += 1) {
      const v = y / rings;
      const theta = v * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let x = 0; x <= segments; x += 1) {
        const u = x / segments;
        const phi = u * Math.PI * 2;
        const px = Math.cos(phi) * sinTheta * 0.5;
        const py = cosTheta * 0.5;
        const pz = Math.sin(phi) * sinTheta * 0.5;
        const shade = 0.68 + (py + 0.5) * 0.44;
        positions.push(px, py, pz);
        colors.push(shade, shade, shade);
      }
    }

    for (let y = 0; y < rings; y += 1) {
      for (let x = 0; x < segments; x += 1) {
        const a = y * (segments + 1) + x;
        const b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }

    return { positions, colors, indices };
  }

  function drawBox(pos, size, tint, rot = { x: 0, y: 0, z: 0 }) {
    drawMesh(meshes.cube, modelMatrix(pos, rot, { x: size.x ?? size[0], y: size.y ?? size[1], z: size.z ?? size[2] }), tint);
  }

  function drawSphere(pos, size, tint, rot = { x: 0, y: 0, z: 0 }) {
    drawMesh(meshes.sphere, modelMatrix(pos, rot, { x: size.x ?? size[0], y: size.y ?? size[1], z: size.z ?? size[2] }), tint);
  }

  function drawCylinder(pos, size, tint, rot = { x: 0, y: 0, z: 0 }) {
    drawMesh(meshes.cylinder, modelMatrix(pos, rot, { x: size.x ?? size[0], y: size.y ?? size[1], z: size.z ?? size[2] }), tint);
  }

  function drawChildBox(parent, pos, size, tint, rot = { x: 0, y: 0, z: 0 }) {
    const local = modelMatrix(pos, rot, size);
    drawMesh(meshes.cube, mat4Multiply(parent, local), tint);
  }

  function drawMesh(mesh, model, tint) {
    const mvp = mat4Multiply(program.projectionView, model);
    gl.uniformMatrix4fv(program.uniforms.mvp, false, new Float32Array(mvp));
    gl.uniform3f(program.uniforms.tint, tint[0], tint[1], tint[2]);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.enableVertexAttribArray(program.attributes.position);
    gl.vertexAttribPointer(program.attributes.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
    gl.enableVertexAttribArray(program.attributes.color);
    gl.vertexAttribPointer(program.attributes.color, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  function modelMatrix(pos, rot, scale) {
    let m = mat4Translation(pos.x, pos.y, pos.z);
    m = mat4Multiply(m, mat4RotationY(rot.y || 0));
    m = mat4Multiply(m, mat4RotationX(rot.x || 0));
    m = mat4Multiply(m, mat4RotationZ(rot.z || 0));
    m = mat4Multiply(m, mat4Scale(scale.x, scale.y, scale.z));
    return m;
  }

  function mat4Identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function mat4Multiply(a, b) {
    const out = new Array(16);
    for (let col = 0; col < 4; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[col * 4 + row] =
          a[0 * 4 + row] * b[col * 4 + 0] +
          a[1 * 4 + row] * b[col * 4 + 1] +
          a[2 * 4 + row] * b[col * 4 + 2] +
          a[3 * 4 + row] * b[col * 4 + 3];
      }
    }
    return out;
  }

  function mat4Translation(x, y, z) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  }

  function mat4Scale(x, y, z) {
    return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  }

  function mat4RotationX(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  }

  function mat4RotationY(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  }

  function mat4RotationZ(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function mat4Perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }

  function mat4LookAt(eye, center, up) {
    const z = normalize3({ x: eye.x - center.x, y: eye.y - center.y, z: eye.z - center.z });
    const x = normalize3(cross3(up, z));
    const y = cross3(z, x);

    return [
      x.x,
      y.x,
      z.x,
      0,
      x.y,
      y.y,
      z.y,
      0,
      x.z,
      y.z,
      z.z,
      0,
      -dot3(x, eye),
      -dot3(y, eye),
      -dot3(z, eye),
      1,
    ];
  }

  function normalize3(v) {
    const length = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / length, y: v.y / length, z: v.z / length };
  }

  function cross3(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function lerpVec(current, target, alpha) {
    current.x += (target.x - current.x) * alpha;
    current.y += (target.y - current.y) * alpha;
    current.z += (target.z - current.z) * alpha;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function random01(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function ensureAudio() {
    if (audioContext) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioContext = new AudioCtor();
  }

  function tone(frequency, duration, wave, volume) {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = wave;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + duration);
  }
})();

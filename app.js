// PixelSand — 60 FPS Cellular Automata Physics Engine
// High Performance TypedArray Grid Architecture

const WIDTH = 240;
const HEIGHT = 180;
const TOTAL_CELLS = WIDTH * HEIGHT;

// Element Types
const TYPE_EMPTY = 0;
const TYPE_SAND = 1;
const TYPE_WATER = 2;
const TYPE_FIRE = 3;
const TYPE_WOOD = 4;
const TYPE_GUNPOWDER = 5;
const TYPE_ACID = 6;
const TYPE_STONE = 7;
const TYPE_OIL = 8;
const TYPE_LAVA = 9;
const TYPE_PLANT = 10;

const ELEMENTS = [
  { id: TYPE_SAND,      name: "Sand",      color: "#f59e0b", rgba: [245, 158, 11, 255] },
  { id: TYPE_WATER,     name: "Water",     color: "#06b6d4", rgba: [6, 182, 212, 230] },
  { id: TYPE_FIRE,      name: "Fire",      color: "#ef4444", rgba: [239, 68, 68, 255] },
  { id: TYPE_WOOD,      name: "Wood",      color: "#854d0e", rgba: [133, 77, 14, 255] },
  { id: TYPE_GUNPOWDER, name: "Gunpowder", color: "#64748b", rgba: [100, 116, 139, 255] },
  { id: TYPE_ACID,      name: "Acid",      color: "#22c55e", rgba: [34, 197, 94, 240] },
  { id: TYPE_STONE,     name: "Stone",     color: "#94a3b8", rgba: [148, 163, 184, 255] },
  { id: TYPE_OIL,       name: "Oil",       color: "#78350f", rgba: [120, 53, 15, 235] },
  { id: TYPE_LAVA,      name: "Lava",      color: "#f97316", rgba: [249, 115, 22, 255] },
  { id: TYPE_PLANT,     name: "Plant",     color: "#15803d", rgba: [21, 128, 61, 255] },
  { id: -1,             name: "Eraser",    color: "#ffffff", rgba: [0, 0, 0, 0] }
];

// Grid Buffers
const grid = new Uint8Array(TOTAL_CELLS);
const heat = new Uint8Array(TOTAL_CELLS);
const life = new Uint8Array(TOTAL_CELLS); // Particle age / duration
const updated = new Uint8Array(TOTAL_CELLS);

// Engine State
let activeElement = TYPE_SAND;
let brushRadius = 6;
let gravityMode = "down"; // down, zero, up
let isPaused = false;
let showThermal = false;
let isMouseDown = false;
let mouseX = 0, mouseY = 0;

// Canvas & Rendering
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const imgData = ctx.createImageData(WIDTH, HEIGHT);
const buf32 = new Uint32Array(imgData.data.buffer);

// Color Lookup Table (32-bit ABGR for canvas little-endian)
const colorLut = new Uint32Array(16);
ELEMENTS.forEach(e => {
  if (e.id >= 0) {
    const [r, g, b, a] = e.rgba;
    colorLut[e.id] = (a << 24) | (b << 16) | (g << 8) | r;
  }
});

// Performance tracking
let frameCount = 0;
let lastFpsTime = performance.now();

// ==========================================
// Cellular Automata Simulation Step
// ==========================================
function step() {
  updated.fill(0);
  let particleCount = 0;

  const yStart = gravityMode === "up" ? 0 : HEIGHT - 1;
  const yEnd = gravityMode === "up" ? HEIGHT : -1;
  const yStep = gravityMode === "up" ? 1 : -1;

  for (let y = yStart; y !== yEnd; y += yStep) {
    // Randomize left/right scan direction per row to prevent falling bias
    const startX = Math.random() < 0.5 ? 0 : WIDTH - 1;
    const endX = startX === 0 ? WIDTH : -1;
    const xStep = startX === 0 ? 1 : -1;

    for (let x = startX; x !== endX; x += xStep) {
      const idx = y * WIDTH + x;
      const type = grid[idx];

      if (type === TYPE_EMPTY) continue;
      particleCount++;

      if (updated[idx]) continue;

      // Update particle by type
      switch (type) {
        case TYPE_SAND:
        case TYPE_GUNPOWDER:
          updateGranular(x, y, idx, type);
          break;
        case TYPE_WATER:
        case TYPE_OIL:
        case TYPE_ACID:
          updateLiquid(x, y, idx, type);
          break;
        case TYPE_FIRE:
          updateFire(x, y, idx);
          break;
        case TYPE_LAVA:
          updateLava(x, y, idx);
          break;
        case TYPE_PLANT:
          updatePlant(x, y, idx);
          break;
      }
    }
  }

  document.getElementById('valParticles').textContent = particleCount.toLocaleString();
}

function updateGranular(x, y, idx, type) {
  const dirY = gravityMode === "zero" ? 0 : (gravityMode === "up" ? -1 : 1);
  if (dirY === 0) return;

  const ny = y + dirY;
  if (ny < 0 || ny >= HEIGHT) return;

  const belowIdx = ny * WIDTH + x;
  const belowType = grid[belowIdx];

  // Fall straight down through empty or liquids (dense sand sinks in liquids)
  if (belowType === TYPE_EMPTY || belowType === TYPE_WATER || belowType === TYPE_OIL) {
    swap(idx, belowIdx);
    return;
  }

  // Tumble diagonally
  const leftX = x - 1;
  const rightX = x + 1;
  const canLeft = leftX >= 0 && (grid[ny * WIDTH + leftX] === TYPE_EMPTY || grid[ny * WIDTH + leftX] === TYPE_WATER);
  const canRight = rightX < WIDTH && (grid[ny * WIDTH + rightX] === TYPE_EMPTY || grid[ny * WIDTH + rightX] === TYPE_WATER);

  if (canLeft && canRight) {
    const pickX = Math.random() < 0.5 ? leftX : rightX;
    swap(idx, ny * WIDTH + pickX);
  } else if (canLeft) {
    swap(idx, ny * WIDTH + leftX);
  } else if (canRight) {
    swap(idx, ny * WIDTH + rightX);
  }
}

function updateLiquid(x, y, idx, type) {
  const dirY = gravityMode === "zero" ? 0 : (gravityMode === "up" ? -1 : 1);
  const ny = y + dirY;

  // Fall down
  if (dirY !== 0 && ny >= 0 && ny < HEIGHT) {
    const belowIdx = ny * WIDTH + x;
    const belowType = grid[belowIdx];

    // Oil floats on water: if oil is below water, swap them!
    if (type === TYPE_WATER && belowType === TYPE_OIL) {
      swap(idx, belowIdx);
      return;
    }

    if (belowType === TYPE_EMPTY) {
      swap(idx, belowIdx);
      return;
    }

    // Acid chemistry: acid dissolves wood, stone, sand with sizzle
    if (type === TYPE_ACID && belowType !== TYPE_EMPTY && belowType !== TYPE_ACID && belowType !== TYPE_WATER) {
      grid[belowIdx] = TYPE_EMPTY;
      if (Math.random() < 0.3) grid[idx] = TYPE_EMPTY; // acid consumed
      return;
    }
  }

  // Diagonal flow
  const leftX = x - 1;
  const rightX = x + 1;
  const canDiagLeft = ny >= 0 && ny < HEIGHT && leftX >= 0 && grid[ny * WIDTH + leftX] === TYPE_EMPTY;
  const canDiagRight = ny >= 0 && ny < HEIGHT && rightX < WIDTH && grid[ny * WIDTH + rightX] === TYPE_EMPTY;

  if (canDiagLeft && canDiagRight) {
    const pickX = Math.random() < 0.5 ? leftX : rightX;
    swap(idx, ny * WIDTH + pickX);
    return;
  } else if (canDiagLeft) {
    swap(idx, ny * WIDTH + leftX);
    return;
  } else if (canDiagRight) {
    swap(idx, ny * WIDTH + rightX);
    return;
  }

  // Horizontal spread
  const canLeft = leftX >= 0 && grid[y * WIDTH + leftX] === TYPE_EMPTY;
  const canRight = rightX < WIDTH && grid[y * WIDTH + rightX] === TYPE_EMPTY;

  if (canLeft && canRight) {
    const pickX = Math.random() < 0.5 ? leftX : rightX;
    swap(idx, y * WIDTH + pickX);
  } else if (canLeft) {
    swap(idx, y * WIDTH + leftX);
  } else if (canRight) {
    swap(idx, y * WIDTH + rightX);
  }
}

function updateFire(x, y, idx) {
  life[idx] = (life[idx] || 0) + 1;
  if (life[idx] > 20 || Math.random() < 0.12) {
    grid[idx] = TYPE_EMPTY;
    life[idx] = 0;
    return;
  }

  // Rise upward
  const upY = y - 1;
  if (upY >= 0) {
    const pickX = x + (Math.random() < 0.5 ? (Math.random() < 0.5 ? 1 : -1) : 0);
    if (pickX >= 0 && pickX < WIDTH) {
      const targetIdx = upY * WIDTH + pickX;
      if (grid[targetIdx] === TYPE_EMPTY) {
        swap(idx, targetIdx);
      }
    }
  }

  // Ignite neighbors
  checkCombustion(x, y);
}

function checkCombustion(x, y) {
  const neighbors = [
    { x: x + 1, y: y }, { x: x - 1, y: y },
    { x: x, y: y + 1 }, { x: x, y: y - 1 },
    { x: x + 1, y: y + 1 }, { x: x - 1, y: y - 1 }
  ];

  neighbors.forEach(n => {
    if (n.x >= 0 && n.x < WIDTH && n.y >= 0 && n.y < HEIGHT) {
      const nIdx = n.y * WIDTH + n.x;
      const nType = grid[nIdx];

      if (nType === TYPE_WOOD || nType === TYPE_OIL || nType === TYPE_PLANT) {
        grid[nIdx] = TYPE_FIRE;
        life[nIdx] = 0;
      } else if (nType === TYPE_GUNPOWDER) {
        triggerExplosion(n.x, n.y);
      } else if (nType === TYPE_WATER) {
        // Water extinguishes fire
        grid[y * WIDTH + x] = TYPE_EMPTY;
      }
    }
  });
}

function triggerExplosion(centerX, centerY) {
  const radius = 12;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const ex = centerX + dx;
        const ey = centerY + dy;
        if (ex >= 0 && ex < WIDTH && ey >= 0 && ey < HEIGHT) {
          const eIdx = ey * WIDTH + ex;
          if (Math.random() < 0.6) {
            grid[eIdx] = TYPE_FIRE;
            life[eIdx] = 0;
          } else {
            grid[eIdx] = TYPE_EMPTY;
          }
        }
      }
    }
  }
}

function updateLava(x, y, idx) {
  // Melts stone or burns flammables
  const belowY = y + 1;
  if (belowY < HEIGHT) {
    const belowIdx = belowY * WIDTH + x;
    const belowType = grid[belowIdx];

    if (belowType === TYPE_WATER) {
      grid[idx] = TYPE_STONE; // Lava quenches into stone
      grid[belowIdx] = TYPE_EMPTY;
      return;
    }
    if (belowType === TYPE_EMPTY) {
      swap(idx, belowIdx);
      return;
    }
  }

  // Ignite neighbors
  checkCombustion(x, y);
}

function updatePlant(x, y, idx) {
  // If watered, sprout upward
  const neighbors = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];
  for (const n of neighbors) {
    if (n.x >= 0 && n.x < WIDTH && n.y >= 0 && n.y < HEIGHT) {
      const nIdx = n.y * WIDTH + n.x;
      if (grid[nIdx] === TYPE_WATER) {
        grid[nIdx] = TYPE_EMPTY; // Consumes water
        // Grow into empty cell above
        if (y > 0 && grid[(y - 1) * WIDTH + x] === TYPE_EMPTY) {
          grid[(y - 1) * WIDTH + x] = TYPE_PLANT;
        }
        break;
      }
    }
  }
}

function swap(i1, i2) {
  const temp = grid[i1];
  grid[i1] = grid[i2];
  grid[i2] = temp;
  updated[i1] = 1;
  updated[i2] = 1;
}

// ==========================================
// 60 FPS Render Pipeline
// ==========================================
function render() {
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const type = grid[i];
    if (showThermal) {
      // Thermal heat view
      if (type === TYPE_FIRE || type === TYPE_LAVA) {
        buf32[i] = 0xff0000ff; // Red
      } else if (type === TYPE_EMPTY) {
        buf32[i] = 0xff100b05; // Dark
      } else {
        buf32[i] = 0xff00ffff; // Cyan/Cool
      }
    } else {
      buf32[i] = type === TYPE_EMPTY ? 0xff000000 : colorLut[type];
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // FPS calculation
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    document.getElementById('valFps').textContent = frameCount;
    frameCount = 0;
    lastFpsTime = now;
  }
}

function gameLoop() {
  if (isMouseDown) {
    paint(mouseX, mouseY);
  }
  if (!isPaused) {
    step();
  }
  render();
  requestAnimationFrame(gameLoop);
}

// ==========================================
// Brush & Mouse Painting
// ==========================================
function paint(cx, cy) {
  const r = brushRadius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        const px = cx + dx;
        const py = cy + dy;
        if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) {
          const idx = py * WIDTH + px;
          if (activeElement === -1) {
            grid[idx] = TYPE_EMPTY;
          } else {
            // Apply slight random sparsity for realistic powder pouring
            if (activeElement === TYPE_SAND || activeElement === TYPE_GUNPOWDER) {
              if (Math.random() < 0.75) grid[idx] = activeElement;
            } else {
              grid[idx] = activeElement;
            }
          }
        }
      }
    }
  }
}

function setupMouseEvents() {
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    return {
      x: Math.floor((e.clientX - rect.left) * scaleX),
      y: Math.floor((e.clientY - rect.top) * scaleY)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    isMouseDown = true;
    const pos = getCanvasCoords(e);
    mouseX = pos.x;
    mouseY = pos.y;
  });

  window.addEventListener('mouseup', () => { isMouseDown = false; });

  canvas.addEventListener('mousemove', (e) => {
    const pos = getCanvasCoords(e);
    mouseX = pos.x;
    mouseY = pos.y;
  });

  // Touch support for iPad / mobile
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isMouseDown = true;
    const touch = e.touches[0];
    const pos = getCanvasCoords(touch);
    mouseX = pos.x;
    mouseY = pos.y;
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getCanvasCoords(touch);
    mouseX = pos.x;
    mouseY = pos.y;
  });

  canvas.addEventListener('touchend', () => { isMouseDown = false; });
}

// ==========================================
// UI & Control Handlers
// ==========================================
function setupPalette() {
  const container = document.getElementById('elementGrid');
  container.innerHTML = '';

  ELEMENTS.forEach(elem => {
    const btn = document.createElement('button');
    btn.className = `elem-btn ${elem.id === activeElement ? 'active' : ''}`;
    btn.style.setProperty('--elem-color', elem.color);
    btn.innerHTML = `
      <span class="elem-swatch"></span>
      <span>${elem.name}</span>
    `;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.elem-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeElement = elem.id;
    });

    container.appendChild(btn);
  });
}

function updateBrushSize(val) {
  brushRadius = parseInt(val);
  document.getElementById('valBrushSize').textContent = brushRadius;
}

function setGravity(mode) {
  gravityMode = mode;
  document.querySelectorAll('.grav-btn').forEach(b => b.classList.remove('active'));
  if (mode === 'down') document.getElementById('gravDown').classList.add('active');
  if (mode === 'zero') document.getElementById('gravZero').classList.add('active');
  if (mode === 'up') document.getElementById('gravUp').classList.add('active');
}

function toggleThermal() {
  showThermal = !showThermal;
  const btn = document.getElementById('btnThermal');
  btn.classList.toggle('active', showThermal);
  btn.textContent = showThermal ? "🔥 HEATMAP: ON" : "🔥 HEATMAP: OFF";
}

function togglePause() {
  isPaused = !isPaused;
  const btn = document.getElementById('btnPause');
  btn.textContent = isPaused ? "▶ RESUME" : "⏸ PAUSE";
}

function stepSimulation() {
  step();
  render();
}

function clearGrid() {
  grid.fill(TYPE_EMPTY);
  life.fill(0);
  heat.fill(0);
}

function exportSnapshot() {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = WIDTH * 4;
  exportCanvas.height = HEIGHT * 4;
  const expCtx = exportCanvas.getContext('2d');
  expCtx.imageSmoothingEnabled = false;
  expCtx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);

  const a = document.createElement('a');
  a.href = exportCanvas.toDataURL('image/png');
  a.download = `PixelSand_Snapshot_${Date.now()}.png`;
  a.click();
}

// Pre-fill a starter landscape
function initStarterScene() {
  // Bedrock floor
  for (let x = 0; x < WIDTH; x++) {
    for (let y = HEIGHT - 10; y < HEIGHT; y++) {
      grid[y * WIDTH + x] = TYPE_STONE;
    }
  }

  // Wooden cup
  for (let y = HEIGHT - 50; y < HEIGHT - 10; y++) {
    grid[y * WIDTH + 40] = TYPE_WOOD;
    grid[y * WIDTH + 90] = TYPE_WOOD;
  }
  for (let x = 40; x <= 90; x++) {
    grid[(HEIGHT - 10) * WIDTH + x] = TYPE_WOOD;
  }

  // Water pool in cup
  for (let y = HEIGHT - 30; y < HEIGHT - 10; y++) {
    for (let x = 42; x < 88; x++) {
      grid[y * WIDTH + x] = TYPE_WATER;
    }
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  setupPalette();
  setupMouseEvents();
  initStarterScene();
  requestAnimationFrame(gameLoop);
});

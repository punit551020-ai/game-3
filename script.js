(() => {
  "use strict";

  const SIZE = 10;
  const SAVE_KEY = "hacker-ankit-game-3-save-v1";
  const BLOCK_COLORS = [
    "var(--block-red)",
    "var(--block-blue)",
    "var(--block-yellow)",
    "var(--block-purple)",
    "var(--block-orange)",
    "var(--block-cyan)",
    "var(--block-pink)"
  ];
  const SHAPES = [
    [[0,0]], [[0,0],[1,0]], [[0,0],[0,1]], [[0,0],[1,0],[2,0]], [[0,0],[0,1],[0,2]],
    [[0,0],[1,0],[0,1]], [[0,0],[1,0],[1,1]], [[0,0],[0,1],[1,1]], [[1,0],[0,1],[1,1]],
    [[0,0],[1,0],[2,0],[3,0]], [[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[0,1],[1,1]],
    [[0,0],[1,0],[2,0],[0,1]], [[0,0],[1,0],[2,0],[2,1]], [[0,0],[0,1],[1,1],[2,1]], [[2,0],[0,1],[1,1],[2,1]],
    [[0,0],[0,1],[0,2],[1,2]], [[1,0],[1,1],[0,2],[1,2]], [[0,0],[1,0],[1,1],[2,1]],
    [[1,0],[2,0],[0,1],[1,1]], [[0,0],[1,0],[2,0],[1,1]], [[1,0],[0,1],[1,1],[2,1],[1,2]],
    [[0,0],[1,0],[2,0],[0,1],[2,1]], [[0,0],[0,1],[1,1],[1,2],[2,2]],
    [[2,0],[1,1],[2,1],[0,2],[1,2]], [[0,0],[1,0],[2,0],[1,1],[1,2]],
    [[0,0],[0,1],[0,2],[1,0],[2,0]], [[0,0],[1,0],[2,0],[2,1],[2,2]],
    [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]], [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]
  ];

  // ---- Safe DOM helper ----
  const $ = (sel) => document.querySelector(sel);

  const boardEl = $("#board");
  const piecesEl = $("#pieces");
  const scoreEl = $("#score");
  const bestEl = $("#best");
  const levelEl = $("#level");
  const levelChip = $("#level-chip");
  const levelProgress = $("#level-progress");
  const linesEl = $("#lines");
  const comboEl = $("#combo");
  const hintEl = $("#game-hint");
  const overlay = $("#overlay");
  const networkEl = $("#network");
  const installButton = $("#install-button");
  const installGuide = $("#install-guide");
  const installGuideTitle = $("#install-guide-title");
  const installGuideSteps = $("#install-guide-steps");
  const toast = $("#toast");

  let board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  let pieces = [];
  let score = 0;
  let best = Number(localStorage.getItem(SAVE_KEY) || 0);
  let clearedLines = 0;
  let combo = 0;
  let selected = -1;
  let hoverCell = null;
  let pointerStart = null;
  let dragSlot = -1;
  let dragging = false;
  let skipClick = false;
  let installPrompt = null;
  let installFallbackTimer = 0;
  let toastTimer;

  const cloneShape = shape => shape.map(([x, y]) => [x, y]);
  const maxX = shape => Math.max(...shape.map(([x]) => x));
  const maxY = shape => Math.max(...shape.map(([, y]) => y));
  const currentLevel = () => Math.max(Math.floor(score / 100), Math.floor(clearedLines / 4)) + 1;
  const normalize = shape => {
    const minX = Math.min(...shape.map(([x]) => x));
    const minY = Math.min(...shape.map(([, y]) => y));
    return shape.map(([x, y]) => [x - minX, y - minY]);
  };

  function randomConnectedShape(size) {
    const shape = [[0, 0]];
    const occupied = new Set(["0,0"]);
    while (shape.length < size) {
      const frontier = new Map();
      for (const [x, y] of shape) {
        for (const [nextX, nextY] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const key = `${nextX},${nextY}`;
          if (!occupied.has(key)) frontier.set(key, [nextX, nextY]);
        }
      }
      const options = Array.from(frontier.values());
      if (!options.length) break; // safety guard
      const next = options[Math.floor(Math.random() * options.length)];
      shape.push(next);
      occupied.add(`${next[0]},${next[1]}`);
    }
    return normalize(shape);
  }

  function randomShape() {
    const level = currentLevel();
    const unlockedCount = Math.min(SHAPES.length, 13 + (level - 1) * 2);
    const minimumCatalogSize = Math.min(6, 1 + Math.floor((level - 1) / 4));
    const catalog = SHAPES.slice(0, unlockedCount).filter(shape => shape.length >= minimumCatalogSize);
    const generatedChance = Math.min(0.18 + Math.max(0, level - 5) * 0.055, 0.86);

    if (level >= 5 && Math.random() < generatedChance) {
      const minimumGeneratedSize = Math.min(10, Math.max(minimumCatalogSize, 4 + Math.floor((level - 5) / 4)));
      const maximumGeneratedSize = Math.min(10, minimumGeneratedSize + Math.floor((level - 1) / 6));
      const generatedSize = minimumGeneratedSize + Math.floor(Math.random() * (maximumGeneratedSize - minimumGeneratedSize + 1));
      return randomConnectedShape(generatedSize);
    }

    if (!catalog.length) return randomConnectedShape(Math.max(1, minimumCatalogSize));
    const shape = cloneShape(catalog[Math.floor(Math.random() * catalog.length)]);
    return normalize(shape);
  }

  function fits(shape, row, col) {
    return shape.every(([x, y]) => {
      const r = row + y, c = col + x;
      return r >= 0 && r < SIZE && c >= 0 && c < SIZE && !board[r][c];
    });
  }

  function canFitAnywhere(shape) {
    for (let r = 0; r <= SIZE - 1 - maxY(shape); r++) {
      for (let c = 0; c <= SIZE - 1 - maxX(shape); c++) {
        if (fits(shape, r, c)) return true;
      }
    }
    return false;
  }

  function setHint(text, state = "") {
    if (!hintEl) return;
    hintEl.textContent = text;
    hintEl.dataset.state = state;
  }

  function updateStats() {
    if (scoreEl) scoreEl.textContent = score.toLocaleString();
    if (bestEl) bestEl.textContent = best.toLocaleString();
    const level = currentLevel();
    if (levelEl) levelEl.textContent = String(level);
    if (levelChip) levelChip.textContent = `LVL ${level}`;
    const scoreProgress = Math.max(0, Math.min(1, (score - (level - 1) * 100) / 100));
    const lineProgress = Math.max(0, Math.min(1, (clearedLines - (level - 1) * 4) / 4));
    const progress = Math.max(scoreProgress, lineProgress);
    if (levelProgress) levelProgress.style.width = `${Math.round(progress * 100)}%`;
    if (linesEl) {
      linesEl.innerHTML = Array.from({ length: 4 }, (_, i) =>
        `<span class="line-token${i < Math.floor(progress * 4) ? " done" : ""}"></span>`).join("");
    }
    if (comboEl) comboEl.textContent = combo > 1 ? `×${combo}` : "—";
  }

  function renderBoard() {
    if (!boardEl) return;
    const previews = new Map();
    if (selected >= 0 && pieces[selected] && hoverCell) {
      const [row, col] = hoverCell;
      const shape = pieces[selected].shape;
      const valid = fits(shape, row, col);
      shape.forEach(([x, y]) => {
        const r = row + y, c = col + x;
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) previews.set(`${r},${c}`, valid ? "preview-good" : "preview-bad");
      });
    }
    boardEl.replaceChildren();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}${board[r][c] ? ", filled" : ""}`);
        cell.dataset.testid = `board-cell-${r}-${c}`;
        if (board[r][c]) {
          cell.classList.add("filled");
          cell.style.setProperty("--block-color", board[r][c]);
        }
        const preview = previews.get(`${r},${c}`);
        if (preview) {
          cell.classList.add(preview);
          if (preview === "preview-good") {
            cell.style.setProperty("--block-color", pieces[selected].color);
          }
        }
        boardEl.append(cell);
      }
    }
  }

  function renderPieces() {
    if (!piecesEl) return;
    piecesEl.replaceChildren();
    pieces.forEach((piece, index) => {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "piece-slot";
      slot.dataset.slot = String(index);
      slot.dataset.testid = `piece-slot-${index}`;
      slot.setAttribute("aria-label", `Select piece ${index + 1}, ${piece.shape.length} blocks`);
      if (index === selected) slot.classList.add("selected");
      if (!piece.available) slot.classList.add("used");
      const shapeEl = document.createElement("span");
      shapeEl.className = "piece-shape";
      shapeEl.style.gridTemplateColumns = `repeat(${maxX(piece.shape) + 1}, 1fr)`;
      const coords = new Set(piece.shape.map(([x, y]) => `${x},${y}`));
      for (let y = 0; y <= maxY(piece.shape); y++) {
        for (let x = 0; x <= maxX(piece.shape); x++) {
          const block = document.createElement("span");
          block.className = `piece-cell${coords.has(`${x},${y}`) ? "" : " empty"}`;
          if (coords.has(`${x},${y}`)) block.style.setProperty("--block-color", piece.color);
          shapeEl.append(block);
        }
      }
      slot.append(shapeEl);
      const caption = document.createElement("span");
      caption.className = "piece-caption";
      caption.textContent = piece.shape.length === 1 ? "single" : `${piece.shape.length} blocks`;
      slot.append(caption);
      piecesEl.append(slot);
    });
  }

  function refresh() {
    renderBoard();
    renderPieces();
    updateStats();
  }

  function refill() {
    const colors = [...BLOCK_COLORS];
    for (let index = colors.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [colors[index], colors[swapIndex]] = [colors[swapIndex], colors[index]];
    }
    pieces = Array.from({ length: 3 }, (_, index) => ({
      shape: randomShape(),
      color: colors[index],
      available: true
    }));
    selected = -1;
    hoverCell = null;
    renderPieces();
    setHint("Choose a shape, then place it on the grid.");
    checkGameOver();
  }

  function selectPiece(index) {
    if (!pieces[index] || !pieces[index].available) return;
    selected = selected === index ? -1 : index;
    hoverCell = null;
    renderPieces();
    renderBoard();
    setHint(selected >= 0 ? "Now tap a starting cell on the grid." : "Choose a shape, then place it on the grid.");
  }

  function place(index, row, col) {
    if (index < 0 || !pieces[index] || !pieces[index].available) return false;
    const shape = pieces[index].shape;
    if (!fits(shape, row, col)) {
      setHint("That shape overlaps or sits outside the grid.", "error");
      return false;
    }
    shape.forEach(([x, y]) => { board[row + y][col + x] = pieces[index].color; });
    pieces[index].available = false;
    selected = -1;
    hoverCell = null;
    score += shape.length;
    const fullRows = board.map(line => line.every(Boolean));
    const fullCols = Array.from({ length: SIZE }, (_, c) => board.every(line => line[c]));
    const count = fullRows.filter(Boolean).length + fullCols.filter(Boolean).length;
    if (count) {
      combo += 1;
      clearedLines += count;
      score += count * 10 * combo + Math.max(0, count - 1) * 5;
      board = board.map((line, r) => line.map((value, c) => fullRows[r] || fullCols[c] ? null : value));
      setHint(`${count} line${count > 1 ? "s" : ""} cleared${combo > 1 ? ` · combo ×${combo}` : ""}.`, "success");
      if (boardEl) {
        boardEl.classList.remove("flash");
        void boardEl.offsetWidth;
        boardEl.classList.add("flash");
      }
    } else {
      combo = 0;
      setHint("Nice placement. Find your next opening.");
    }
    if (score > best) {
      best = score;
      localStorage.setItem(SAVE_KEY, String(best));
    }
    refresh();
    if (pieces.every(piece => !piece.available)) {
      window.setTimeout(refill, 180);
    } else {
      checkGameOver();
    }
    return true;
  }

  function checkGameOver() {
    if (pieces.length && !pieces.some(piece => piece.available && canFitAnywhere(piece.shape))) {
      const endScore = $("#end-score");
      const endBest = $("#end-best");
      if (endScore) endScore.textContent = score.toLocaleString();
      if (endBest) endBest.textContent = best.toLocaleString();
      openOverlay("game-over");
      setHint("No available shape can fit. Start a fresh run.", "error");
    }
  }

  function newGame() {
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    score = 0;
    clearedLines = 0;
    combo = 0;
    selected = -1;
    hoverCell = null;
    closeOverlay();
    refill();
    refresh();
  }

  function openOverlay(mode) {
    if (!overlay) return;
    overlay.hidden = false;
    overlay.dataset.mode = mode;
    const rules = $("#rules-content"); if (rules) rules.hidden = mode !== "rules";
    const over = $("#over-content");  if (over)  over.hidden  = mode !== "game-over";
    const restartIn = $("#restart-in-dialog"); if (restartIn) restartIn.hidden = mode !== "game-over";
    const closeDlg = $("#close-dialog");      if (closeDlg)  closeDlg.hidden  = mode !== "rules";
    const title = $("#dialog-title");
    if (title) title.textContent = mode === "rules" ? "How to play" : "Grid locked";
  }
  function closeOverlay() { if (overlay) overlay.hidden = true; }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3100);
  }

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest(".cell");
    return cell ? [Number(cell.dataset.row), Number(cell.dataset.col)] : null;
  }

  if (boardEl) {
    boardEl.addEventListener("click", event => {
      if (skipClick) { skipClick = false; return; }
      const cell = event.target.closest(".cell");
      if (!cell) return;
      if (selected < 0) {
        setHint("Pick one of the three shapes first.");
        return;
      }
      place(selected, Number(cell.dataset.row), Number(cell.dataset.col));
    });
    boardEl.addEventListener("pointermove", event => {
      if (selected < 0 && !dragging) return;
      const next = cellFromPoint(event.clientX, event.clientY);
      if (next && (!hoverCell || next[0] !== hoverCell[0] || next[1] !== hoverCell[1])) {
        hoverCell = next;
        renderBoard();
      }
    });
    boardEl.addEventListener("pointerleave", () => {
      if (!dragging && hoverCell) { hoverCell = null; renderBoard(); }
    });
  }

  if (piecesEl) {
    piecesEl.addEventListener("click", event => {
      const slot = event.target.closest(".piece-slot");
      if (!slot) return;
      if (skipClick) { skipClick = false; return; }
      selectPiece(Number(slot.dataset.slot));
    });
    piecesEl.addEventListener("pointerdown", event => {
      const slot = event.target.closest(".piece-slot");
      if (!slot || event.button !== 0 || !pieces[Number(slot.dataset.slot)]?.available) return;
      dragSlot = Number(slot.dataset.slot);
      pointerStart = [event.clientX, event.clientY];
      dragging = false;
    });
  }

  document.addEventListener("pointermove", event => {
    if (dragSlot < 0 || !pointerStart) return;
    if (!dragging && Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 7) {
      dragging = true;
      selected = dragSlot;
      renderPieces();
      setHint("Release over the grid to place the shape.");
    }
    if (dragging) {
      hoverCell = cellFromPoint(event.clientX, event.clientY);
      renderBoard();
    }
  });
  document.addEventListener("pointerup", event => {
    if (dragSlot < 0) return;
    if (dragging) {
      const cell = cellFromPoint(event.clientX, event.clientY);
      skipClick = true;
      if (cell) place(dragSlot, cell[0], cell[1]);
      else { selected = -1; hoverCell = null; refresh(); }
      setTimeout(() => { skipClick = false; }, 0);
    }
    dragSlot = -1;
    pointerStart = null;
    dragging = false;
  });

  // ---- Safe button wiring ----
  const bind = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };
  bind("#restart-button", newGame);
  bind("#restart-in-dialog", newGame);
  bind("#help-button", () => openOverlay("rules"));
  bind("#help-shortcut", () => openOverlay("rules"));
  bind("#close-dialog", closeOverlay);
  bind("#dismiss-install-guide", () => { if (installGuide) installGuide.hidden = true; });

  if (overlay) {
    overlay.addEventListener("click", event => {
      if (event.target === overlay && overlay.dataset.mode === "rules") closeOverlay();
    });
  }
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay && !overlay.hidden && overlay.dataset.mode === "rules") closeOverlay();
  });

  function updateNetwork() {
    if (!networkEl) return;
    const online = navigator.onLine;
    networkEl.classList.toggle("offline", !online);
    const label = networkEl.querySelector(".network-label");
    if (label) label.textContent = online ? "ONLINE" : "OFFLINE · READY";
  }
  window.addEventListener("online", updateNetwork);
  window.addEventListener("offline", updateNetwork);
  updateNetwork();

  // ---- Install / PWA ----
  function isAppInstalled() {
    return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);
  }

  function isIOSDevice() {
    const userAgent = navigator.userAgent || "";
    const platform = navigator.platform || "";
    return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function getInstallInstructions() {
    const userAgent = navigator.userAgent || "";
    if (isIOSDevice()) {
      return {
        title: "Add to Home Screen on iPhone or iPad",
        steps: [
          "Tap the Share button in your browser toolbar.",
          "Scroll the share sheet and tap Add to Home Screen.",
          "Tap Add to confirm. If the option is missing, open this page in Safari."
        ]
      };
    }
    if (/Android/i.test(userAgent)) {
      return {
        title: "Install on Android",
        steps: [
          "Open your browser menu (⋮) in the top corner.",
          "Tap Install app or Add to Home screen.",
          "Confirm Install or Add to finish."
        ]
      };
    }
    if (/Edg\//i.test(userAgent)) {
      return {
        title: "Install in Microsoft Edge",
        steps: [
          "Select the Install icon at the right of the address bar, or open Settings and more (⋯) > Apps.",
          "Choose Install this site as an app and confirm.",
          "Launch the game from your apps list or desktop."
        ]
      };
    }
    if (/Safari/i.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|FxiOS|OPR)/i.test(userAgent)) {
      return {
        title: "Add this game to your Mac Dock",
        steps: [
          "In Safari, open the File menu.",
          "Choose Add to Dock and confirm.",
          "Launch the game from your Dock."
        ]
      };
    }
    if (/(Chrome|Chromium)/i.test(userAgent)) {
      return {
        title: "Install in Chrome",
        steps: [
          "Select the Install icon at the right of the address
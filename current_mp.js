/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// ██████████████  MULTIPLAYER SYSTEM (PeerJS WebRTC)  ██████████████
// ═══════════════════════════════════════════════════════════════════

let isMultiplayerMode = false;
let peer = null;
let conn = null;
let myPlayerSlot = null; // 'host' or 'client'
let opponentCar = null;
let syncInterval = null;
let opponentAlive = true;
let currentRoomCode = null;

// DOM references
const mpRoomModal = document.getElementById('mp-room-modal');
const mpRoomInput = document.getElementById('mp-room-input');
const mpJoinBtn = document.getElementById('mp-join-btn');
const mpCancelBtn = document.getElementById('mp-cancel-btn');
const mpWaitingMsg = document.getElementById('mp-waiting-msg');
const mpNotFound = document.getElementById('mp-notfound-popup');
const mpNotFoundClose = document.getElementById('mp-notfound-close');
const oppHud = document.getElementById('opponent-hud');
const oppScoreEl = document.getElementById('opp-score-display');
const oppSpeedEl = document.getElementById('opp-speed-display');
const mpStatusBadge = document.getElementById('mp-status-badge');
const multiplayerBtn = document.getElementById('multiplayerBtn');

multiplayerBtn.addEventListener('click', () => {
  initAudio();
  mpRoomInput.value = '';
  mpWaitingMsg.classList.add('hidden');
  mpJoinBtn.disabled = false;
  mpJoinBtn.textContent = 'JOIN ROOM 🚀';
  screenOverlay.classList.add('hidden');
  mpRoomModal.classList.remove('hidden');
  setTimeout(() => mpRoomInput.focus(), 100);
});

mpRoomInput.addEventListener('input', () => {
  mpRoomInput.value = mpRoomInput.value.replace(/\D/g, '').slice(0, 5);
});

mpRoomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') mpJoinBtn.click();
});

mpCancelBtn.addEventListener('click', () => {
  abortRoomConnection();
  mpRoomModal.classList.add('hidden');
  screenOverlay.classList.remove('hidden');
  mainMenuModal.classList.remove('hidden');
});

mpNotFoundClose.addEventListener('click', () => {
  mpNotFound.classList.add('hidden');
});

mpJoinBtn.addEventListener('click', () => {
  const code = mpRoomInput.value.trim();
  if (code.length !== 5) {
    mpRoomInput.style.borderColor = '#ff0055';
    mpRoomInput.style.boxShadow = '0 0 20px rgba(255,0,85,0.4)';
    setTimeout(() => {
      mpRoomInput.style.borderColor = '';
      mpRoomInput.style.boxShadow = '';
    }, 1000);
    return;
  }

  mpJoinBtn.disabled = true;
  mpJoinBtn.textContent = 'Connecting...';
  enterRoom(code);
});

function enterRoom(code) {
  currentRoomCode = code;
  const roomPeerId = 'cyber-racer-room-' + code;

  // Generate a random peer ID for ourselves
  peer = new Peer();

  peer.on('open', (id) => {
    // Try connecting to the room ID assuming it exists
    conn = peer.connect(roomPeerId, { reliable: false });

    conn.on('open', () => {
      myPlayerSlot = 'client';
      setupConnection(conn);
      startMultiplayerGame();
    });

    conn.on('error', () => {
      fallbackToHost(roomPeerId);
    });

    // If connection doesn't open in 2s, assume host doesn't exist
    setTimeout(() => {
      if (myPlayerSlot === null) {
        fallbackToHost(roomPeerId);
      }
    }, 2000);
  });

  peer.on('error', (err) => {
    console.warn('Peer error:', err);
    if (err.type === 'unavailable-id') {
      // Ignored
    } else {
      showRoomNotFound();
      abortRoomConnection();
    }
  });
}

let fallbackTriggered = false;
function fallbackToHost(roomPeerId) {
  if (fallbackTriggered) return;
  fallbackTriggered = true;

  peer.destroy();

  // Re-initialize with the specific room ID
  peer = new Peer(roomPeerId);

  peer.on('open', (id) => {
    myPlayerSlot = 'host';
    mpWaitingMsg.classList.remove('hidden');
    mpWaitingMsg.textContent = '🔗 Room created! Waiting for opponent...';
  });

  peer.on('connection', (incomingConn) => {
    conn = incomingConn;
    setupConnection(conn);
    startMultiplayerGame();
  });

  peer.on('error', (err) => {
    console.error('Host peer error:', err);
    showRoomNotFound();
    abortRoomConnection();
  });
}

function setupConnection(connection) {
  connection.on('data', (data) => {
    if (!isMultiplayerMode) return;

    if (data.type === 'sync') {
      opponentAlive = data.alive;
      oppScoreEl.textContent = data.score || 0;
      oppSpeedEl.textContent = data.speed || 0;

      if (opponentCar && isGameRunning) {
        opponentCar.position.x = THREE.MathUtils.lerp(opponentCar.position.x, data.x || 0, 0.2);
        opponentCar.position.z = THREE.MathUtils.lerp(opponentCar.position.z, -6, 0.05);
      }

      if (!data.alive && isGameRunning) {
        handleOpponentDisconnect();
      }
    } else if (data.type === 'disconnect') {
      handleOpponentDisconnect();
    }
  });

  connection.on('close', () => {
    handleOpponentDisconnect();
  });
}

function showRoomNotFound() {
  mpWaitingMsg.classList.add('hidden');
  mpNotFound.classList.remove('hidden');
  setTimeout(() => {
    if (!mpNotFound.classList.contains('hidden')) {
      mpNotFound.classList.add('hidden');
    }
  }, 4000);
  mpJoinBtn.disabled = false;
  mpJoinBtn.textContent = 'JOIN ROOM 🚀';
}

function abortRoomConnection() {
  fallbackTriggered = false;
  if (conn) {
    conn.close();
    conn = null;
  }
  if (peer) {
    peer.destroy();
    peer = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  currentRoomCode = null;
  myPlayerSlot = null;
}

// ── START MULTIPLAYER GAME ──────────────────────────────────────────
function startMultiplayerGame() {
  isMultiplayerMode = true;

  mpRoomModal.classList.add('hidden');
  screenOverlay.classList.remove('hidden');
  mainMenuModal.classList.remove('hidden');

  oppHud.classList.remove('hidden');
  mpStatusBadge.classList.remove('hidden');

  startGame();
  spawnOpponentCar();
  startWebRTCSync();
}

function spawnOpponentCar() {
  if (opponentCar) {
    scene.remove(opponentCar);
    opponentCar = null;
  }
  opponentCar = createRealisticCar(0x0055ff, false);
  const oppGlow = new THREE.PointLight(0x0055ff, 4, 12);
  oppGlow.position.set(0, 0.2, 0);
  opponentCar.add(oppGlow);
  opponentCar.position.set(-5, 0, -8);
  scene.add(opponentCar);
}

function startWebRTCSync() {
  if (syncInterval) clearInterval(syncInterval);
  // Sync positional data over P2P at 20Hz
  syncInterval = setInterval(() => {
    if (!isGameRunning || !conn || !conn.open || !playerCar) return;

    conn.send({
      type: 'sync',
      x: Math.round(playerCar.position.x * 100) / 100,
      score: Math.floor(score),
      speed: Math.floor(currentSpeed * 220),
      alive: true,
    });
  }, 50);
}

function handleOpponentDisconnect() {
  if (!isMultiplayerMode || !opponentAlive) return;
  opponentAlive = false;

  const badge = document.createElement('div');
  badge.style.cssText = `
                position:absolute; top:50%; left:50%;
                transform:translate(-50%,-50%);
                background:rgba(10,5,15,0.95);
                border:2px solid #ff0055;
                border-radius:14px;
                padding:24px 40px;
                text-align:center;
                z-index:55;
                color:#ff0055;
                font-size:20px;
                font-weight:900;
                letter-spacing:2px;
                text-transform:uppercase;
                box-shadow:0 0 30px rgba(255,0,85,0.4);
                animation: signalAlertPop 0.3s ease-out;
            `;
  badge.innerHTML =
    '🏆 OPPONENT DISCONNECTED<br><span style="font-size:13px;color:#88a0c0;font-weight:400">You win by default!</span>';
  document.body.appendChild(badge);
  setTimeout(() => {
    if (badge.parentNode) badge.parentNode.removeChild(badge);
  }, 4000);
}

function cleanupMultiplayer() {
  if (!isMultiplayerMode) return;
  isMultiplayerMode = false;

  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  if (conn && conn.open) {
    conn.send({ type: 'disconnect', alive: false });
    setTimeout(() => {
      conn.close();
    }, 100);
  }

  if (peer) {
    setTimeout(() => {
      peer.destroy();
      peer = null;
    }, 200);
  }

  if (opponentCar) {
    scene.remove(opponentCar);
    opponentCar = null;
  }

  oppHud.classList.add('hidden');
  mpStatusBadge.classList.add('hidden');

  currentRoomCode = null;
  myPlayerSlot = null;
  fallbackTriggered = false;
}

const _origGameOver = gameOver;
window.gameOver = function () {
  cleanupMultiplayer();
  _origGameOver();
};

const _origQuit = quitToMainMenu;
window.quitToMainMenu = function () {
  cleanupMultiplayer();
  _origQuit();
};

quitGameBtn.removeEventListener('click', quitToMainMenu);
quitGameBtn.addEventListener('click', () => {
  window.quitToMainMenu();
});

const _origUpdate = update;
window.update = function () {
  _origUpdate();
  if (isMultiplayerMode && opponentCar && isGameRunning) {
    opponentCar.rotation.z = THREE.MathUtils.lerp(opponentCar.rotation.z, 0, 0.1);
  }
};

cancelAnimationFrame(animFrameId);
function mpGameLoop() {
  animFrameId = requestAnimationFrame(mpGameLoop);
  if (isGameRunning && !isPaused) {
    window.update();
    renderer.render(scene, camera);
  } else if (!isGameRunning && playerCar) {
    playerCar.rotation.y += 0.015;
    renderer.render(scene, camera);
  }
}
animFrameId = requestAnimationFrame(mpGameLoop);

# CYBER RACER 3D — REAL-TIME MULTIPLAYER OPEN-WORLD RACING

A browser-based 3D highway racing game powered by Three.js and a real-time server-authoritative multiplayer backend using Node.js, Express, and Socket.IO.

---

## ⚡ Multiplayer Highlights

- **Server-Authoritative Physics & Synchronization**: Real-time 25 Hz simulation loop running on Node.js. Player vehicles, speed, steering angles, and boosts are broadcast and reconciled using snapshot interpolation and client-side dead reckoning.
- **Deterministic Procedural World**: Every room is initialized with an authoritative world seed (Mulberry32 PRNG), guaranteeing that highway segments, track geometry, and roadside features match identically across all players.
- **Authoritative Shared NPC Traffic**: Traffic vehicles (Cars, Mahindra Thar, Tata Trucks, School Buses, Police Cruisers, Ambulances, and Motorcycles) are simulated authoritatively on the server. Features intelligent lane management, horn yielding, and anti-roadblock avoidance.
- **Synchronized Traffic Light Gantries**: Overhead 3D signal gantries placed along the highway change phases (Green → Yellow → Red) with synchronized countdown timers.
- **Synchronized Weather & Day/Night Cycle**: Authoritative time of day and dynamic weather states (Morning Clear, Night Neon, Heavy Rain & Storm, Golden Sunset Fog) are synchronized across all connected pilots.
- **Room Management & 5-Digit PINs**: Quick room creation, PIN sharing, live pilot lobby with vehicle previews and status indicators, automated rematch cycles, and graceful disconnect cleanup.
- **Diagnostics HUD**: Live network diagnostics displaying latency (ping in ms), server tick rate, active players, NPC traffic count, weather mode, signal countdowns, and room seed.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
To run in production mode (compiles TypeScript and launches server on port 3001):
```bash
npm start
```
Or for development with automatic reload:
```bash
npm run dev
```

The game web client and multiplayer server will be accessible at:
```
http://localhost:3001
```

---

## 🎮 How to Play Multiplayer

### Option A: Testing on One Computer (Two Browser Windows)
1. Open `http://localhost:3001` in your primary browser window.
2. In the main menu, click **⚡ MULTIPLAYER BATTLE**.
3. Click **CREATE ROOM**. You will see a unique **5-Digit Room Code** (e.g., `44108`) with a **COPY** button.
4. Open a second browser window (or Incognito window) to `http://localhost:3001`.
5. Click **⚡ MULTIPLAYER BATTLE**, switch to the **JOIN ROOM** tab, and enter the 5-digit PIN.
6. Both pilots will appear in the room lobby. The host can click **START RACE 🏁** (or the race will launch automatically).
7. A synchronized `3-2-1-GO!` countdown initiates on both screens and racing begins!

### Option B: Playing Across Separate Devices on the Same Wi-Fi / Local Network
1. Find your host computer's Local IP address:
   - On Windows: Run `ipconfig` in PowerShell/CMD and look for `IPv4 Address` (e.g., `192.168.1.45`).
   - On Mac/Linux: Run `ifconfig` or `ip a`.
2. Ensure port `3001` is open in your local firewall.
3. From any smartphone, tablet, or secondary laptop on the same Wi-Fi, open:
   ```
   http://192.168.1.45:3001
   ```
4. If the device loads the client from another origin or CDN, click the **⚙️ SERVER CONFIG** button inside the Multiplayer modal and input:
   ```
   http://192.168.1.45:3001
   ```
5. Create a room on Device 1, enter the PIN on Device 2, and enjoy seamless real-time multiplayer!

---

## 🧪 Automated Testing

Two automated test suites verify backend authority, network events, and client synchronization:

1. **Full Integration Test Suite (28 tests)**:
   ```bash
   npx tsx src/tests/multiplayer-integration.test.ts
   ```
2. **Two-Player End-to-End Test Suite**:
   ```bash
   npx tsx src/tests/two-player-e2e.test.ts
   ```

Both suites test:
- Room creation and unique 5-digit PIN assignment.
- Multi-client joining and seat allocation (Host = Slot 0, Client = Slot 1).
- Seed matching and deterministic road generation.
- Authoritative NPC traffic broadcasting and speed control.
- Traffic light synchronization.
- Real-time vehicle position and boost updates.
- Collision and crash detection with immediate winner determination.
- Synchronized rematch request and acceptance flow.
- Graceful client disconnects without duplicate ghost vehicles.

---

## 📁 Project Architecture

```
├── src/
│   ├── index.ts                     # Express & Socket.IO server entry point
│   ├── server/
│   │   ├── types.ts                 # Authoritative state and protocol types
│   │   ├── seed-rng.ts              # Mulberry32 deterministic PRNG
│   │   ├── entity-manager.ts        # Authoritative NPC AI & traffic signals
│   │   ├── world-simulation.ts      # 25 Hz authoritative simulation loop
│   │   ├── room-manager.ts          # Room creation, joining, and lifecycle
│   │   └── network-protocol.ts      # Socket.IO client/server event handlers
│   └── tests/
│       ├── multiplayer-integration.test.ts
│       └── two-player-e2e.test.ts
├── index.html                       # Three.js 3D client, shaders, UI & audio
├── package.json
└── README.md
```

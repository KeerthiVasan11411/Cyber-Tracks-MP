import { io as ClientSocket, Socket } from 'socket.io-client';
import { startServer } from '../index.js';

async function runMultiplayerTestSuite() {
  console.log('====================================================');
  console.log('   CYBER RACER 3D — MULTIPLAYER INTEGRATION TESTS    ');
  console.log('====================================================\n');

  const TEST_PORT = 3088;
  const serverInstance = await startServer(TEST_PORT);
  const SERVER_URL = `http://localhost:${TEST_PORT}`;

  function createClient(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = ClientSocket(SERVER_URL, {
        transports: ['websocket'],
        forceNew: true,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  }

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${testName}`);
    } else {
      console.error(`[FAIL] ${testName}: ${details || 'Assertion failed'}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  try {
    // ── TEST 1: SERVER CONNECTION & LATENCY ──
    const clientA = await createClient();
    const clientB = await createClient();
    assert(clientA.connected && clientB.connected, 'Test 1: Both clients connected to Socket.IO server');

    // ── TEST 2: ROOM CREATION (HOST) ──
    const roomCreatedPromise = new Promise<any>((resolve) => {
      clientA.on('room:created', (data) => resolve(data));
    });

    clientA.emit('room:create', {
      pilotName: 'NEO-RACER',
      vehicleType: 'car',
      vehicleColor: 0x00f0ff,
      roomCode: '77701',
    });

    const initA = await roomCreatedPromise;
    assert(initA.roomCode === '77701', 'Test 2A: Room created with expected code');
    assert(typeof initA.worldConfig.seed === 'number' && initA.worldConfig.seed > 0, 'Test 2B: Authoritative world seed generated');
    assert(initA.localPlayerSlot === 0, 'Test 2C: Host assigned slot 0');
    assert(initA.players.length === 1, 'Test 2D: Initial player list contains host');

    // ── TEST 3: JOIN ROOM (CLIENT B) ──
    const roomJoinedPromise = new Promise<any>((resolve) => {
      clientB.on('room:joined', (data) => resolve(data));
    });

    const playerJoinedPromise = new Promise<any>((resolve) => {
      clientA.on('room:player-joined', (data) => resolve(data));
    });

    clientB.emit('room:join', {
      roomCode: '77701',
      pilotName: 'GHOST-02',
      vehicleType: 'bike',
      vehicleColor: 0xff0055,
    });

    const initB = await roomJoinedPromise;
    const playerBJoinedA = await playerJoinedPromise;

    assert(initB.roomCode === '77701', 'Test 3A: Client B joined room 77701');
    assert(initB.worldConfig.seed === initA.worldConfig.seed, 'Test 3B: World seed identical across both players');
    assert(initB.localPlayerSlot === 1, 'Test 3C: Client B assigned slot 1');
    assert(initB.players.length === 2, 'Test 3D: Client B sees both players in initial state');
    assert(playerBJoinedA.playerId === clientB.id, 'Test 3E: Host notified of Client B joining');
    assert(initA.assignedSpawnX !== initB.assignedSpawnX, 'Test 3F: Players assigned staggered spawn coordinates');

    // ── TEST 4: AUTHORITATIVE STATE BROADCAST & NPC TRAFFIC ──
    const statePromiseA = new Promise<any>((resolve) => {
      clientA.once('room:state', (snapshot) => resolve(snapshot));
    });
    const statePromiseB = new Promise<any>((resolve) => {
      clientB.once('room:state', (snapshot) => resolve(snapshot));
    });

    const [snapshotA, snapshotB] = await Promise.all([statePromiseA, statePromiseB]);
    assert(snapshotA.npcs.length > 0 && snapshotB.npcs.length > 0, 'Test 4A: Authoritative NPCs active in room');
    assert(snapshotA.npcs.length === snapshotB.npcs.length, 'Test 4B: NPC count identical on both clients');
    assert(snapshotA.npcs[0].id === snapshotB.npcs[0].id, 'Test 4C: Same unique NPC entity IDs broadcast to both clients');

    // ── TEST 5: TRAFFIC SIGNAL SYNCHRONIZATION ──
    assert(snapshotA.signals.length > 0 && snapshotB.signals.length > 0, 'Test 5A: Traffic signals present in world');
    assert(snapshotA.signals[0].phase === snapshotB.signals[0].phase, 'Test 5B: Authoritative signal phase matched on both clients');
    assert(snapshotA.signals[0].nextTransitionTime === snapshotB.signals[0].nextTransitionTime, 'Test 5C: Signal transition time identical');

    // ── TEST 6: ENVIRONMENT SYNCHRONIZATION ──
    assert(snapshotA.environment.weatherMode === snapshotB.environment.weatherMode, 'Test 6A: Authoritative weather mode matched');
    assert(Math.abs(snapshotA.environment.timeOfDay - snapshotB.environment.timeOfDay) < 0.01, 'Test 6B: Day/night time of day matched');

    // ── TEST 7: HIGH-FREQUENCY PLAYER MOVEMENT SYNCHRONIZATION ──
    clientA.emit('player:update', {
      position: { x: 2.5, y: 0, z: -10 },
      rotation: { x: 0, y: 0.1, z: -0.05 },
      speed: 180,
      rawSpeed: 0.82,
      score: 1500,
      isBoosting: true,
      isAlive: true,
    });

    // Wait for the next state broadcast to verify Client B receives Client A's movement
    const updatedStateB = await new Promise<any>((resolve) => {
      const handler = (snapshot: any) => {
        const pA = snapshot.players.find((p: any) => p.playerId === clientA.id);
        if (pA && pA.score === 1500) {
          clientB.off('room:state', handler);
          resolve(pA);
        }
      };
      clientB.on('room:state', handler);
    });

    assert(updatedStateB.position.x === 2.5, 'Test 7A: Client B receives Client A updated position');
    assert(updatedStateB.score === 1500, 'Test 7B: Client B receives Client A updated score');
    assert(updatedStateB.isBoosting === true, 'Test 7C: Client B receives Client A boost effect');

    // ── TEST 8: CRASH EVENT SYNCHRONIZATION ──
    const crashEventPromise = new Promise<any>((resolve) => {
      clientA.on('gameplay:event', (event) => {
        if (event.eventType === 'crash') resolve(event);
      });
    });

    clientB.emit('player:crashed', { score: 980 });
    const crashEvent = await crashEventPromise;
    assert(crashEvent.crashedPlayerId === clientB.id, 'Test 8A: Client A receives authoritative crash event for Client B');
    assert(crashEvent.finalScore === 980, 'Test 8B: Final score transmitted correctly');

    // ── TEST 9: LATE JOINING PLAYER ──
    const clientC = await createClient();
    const lateJoinPromise = new Promise<any>((resolve) => {
      clientC.on('room:joined', (data) => resolve(data));
    });

    clientC.emit('room:join', {
      roomCode: '77701',
      pilotName: 'LATE-JOINER',
      vehicleType: 'thar',
      vehicleColor: 0xffff00,
    });

    const initC = await lateJoinPromise;
    assert(initC.worldConfig.seed === initA.worldConfig.seed, 'Test 9A: Late-joining player receives matching world seed');
    assert(initC.players.length === 3, 'Test 9B: Late joiner sees all 3 players in room');
    assert(initC.signals.length > 0, 'Test 9C: Late joiner receives current traffic signals');

    // ── TEST 10: DISCONNECT & ENTITY CLEANUP ──
    const clientBId = clientB.id;
    const playerLeftPromise = new Promise<any>((resolve) => {
      clientA.on('room:player-left', (data) => resolve(data));
    });

    clientB.disconnect();
    const leftEvent = await playerLeftPromise;
    assert(leftEvent.playerId === clientBId, 'Test 10A: Remaining player notified of disconnect');

    clientA.disconnect();
    clientC.disconnect();

    console.log(`\n====================================================`);
    console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log(`====================================================\n`);
  } finally {
    serverInstance.roomManager.stopSimulationLoop();
    serverInstance.httpServer.close();
  }
}

runMultiplayerTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

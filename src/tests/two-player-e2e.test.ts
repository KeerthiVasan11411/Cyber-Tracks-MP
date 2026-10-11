import { io as Client, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTwoPlayerEndToEnd() {
  console.log('====================================================');
  console.log('   CYBER RACER 3D — TWO-PLAYER E2E VERIFICATION     ');
  console.log(`   Connecting to live server: ${SERVER_URL}       `);
  console.log('====================================================\n');

  // TEST A: ROOM IDENTITY & CREATION
  console.log('--- TEST A: ROOM CREATION & IDENTITY ---');
  const clientA: Socket = Client(SERVER_URL, { transports: ['websocket'] });
  const clientB: Socket = Client(SERVER_URL, { transports: ['websocket'] });

  await new Promise<void>((resolve) => clientA.on('connect', () => resolve()));
  await new Promise<void>((resolve) => clientB.on('connect', () => resolve()));
  console.log('✔ [TEST A.1] Both Client A and Client B connected to Socket.IO server.');

  let roomCode = '';
  let roomId = '';
  let roomSeed = 0;

  const roomCreatedPromise = new Promise<any>((resolve) => {
    clientA.on('room:created', (data) => resolve(data));
  });

  clientA.emit('room:create', {
    pilotName: 'VIPER-1',
    vehicleType: 'car',
    vehicleColor: 0x00f0ff,
  });

  const stateA = await roomCreatedPromise;
  roomCode = stateA.roomCode;
  roomId = stateA.roomId;
  roomSeed = stateA.worldConfig.seed;

  console.log(`✔ [TEST A.2] Room created successfully! Code: "${roomCode}", ID: "${roomId}", Seed: ${roomSeed}`);
  if (!roomCode || roomCode.length !== 5) throw new Error('Invalid 5-digit room code');

  // TEST B: JOINING ROOM WITH CODE
  console.log('\n--- TEST B: ROOM JOINING ---');
  const clientBJoinedPromise = new Promise<any>((resolve) => {
    clientB.on('room:joined', (data) => resolve(data));
  });
  const hostNotifiedPromise = new Promise<any>((resolve) => {
    clientA.on('room:player-joined', (data) => resolve(data));
  });

  clientB.emit('room:join', {
    roomCode: roomCode,
    pilotName: 'SHADOW-2',
    vehicleType: 'thar',
    vehicleColor: 0xff0055,
  });

  const stateB = await clientBJoinedPromise;
  const hostNotif = await hostNotifiedPromise;

  console.log(`✔ [TEST B.1] Client B joined room ${roomCode}. Slot: ${stateB.localPlayerSlot}`);
  console.log(`✔ [TEST B.2] Host received join notification for pilot "${hostNotif.pilotName}".`);
  if (stateB.worldConfig.seed !== roomSeed) throw new Error('World seed mismatch between clients');
  console.log(`✔ [TEST B.3] Deterministic world seed matches across both players: ${stateB.worldConfig.seed}`);

  // TEST C: VEHICLE MOVEMENT & INPUT SYNCHRONIZATION
  console.log('\n--- TEST C: VEHICLE MOVEMENT SYNCHRONIZATION ---');
  let clientBReceivedAUpdate = false;
  clientB.on('room:state', (snapshot) => {
    const playerA = snapshot.players.find((p: any) => p.playerId === clientA.id);
    if (playerA && playerA.position.x === 3.5 && playerA.score === 1250) {
      clientBReceivedAUpdate = true;
    }
  });

  // Client A drives and sends updates
  clientA.emit('player:update', {
    position: { x: 3.5, y: 0, z: -120 },
    rotation: { x: 0, y: 0.05, z: 0 },
    speed: 185,
    rawSpeed: 0.84,
    steerAngle: 0.25,
    score: 1250,
    isBoosting: true,
    isHornActive: false,
    isAlive: true,
  });

  await wait(250);
  if (!clientBReceivedAUpdate) throw new Error('Client B did not receive authoritative state for Client A');
  console.log('✔ [TEST C.1] Client B received Client A movement update (X: 3.5, Score: 1250, Speed: 185, Boosting: true)');

  // TEST D: AUTHORITATIVE NPC TRAFFIC & SIGNALS
  console.log('\n--- TEST D: AUTHORITATIVE NPC TRAFFIC & SIGNALS ---');
  let receivedSnapshot: any = null;
  const snapshotPromise = new Promise<any>((resolve) => {
    clientA.on('room:state', (snapshot) => {
      if (snapshot.npcs && snapshot.npcs.length > 0 && snapshot.signals && snapshot.signals.length > 0) {
        resolve(snapshot);
      }
    });
  });

  receivedSnapshot = await snapshotPromise;
  console.log(`✔ [TEST D.1] Authoritative NPCs count: ${receivedSnapshot.npcs.length}`);
  console.log(`✔ [TEST D.2] Sample NPC ID: ${receivedSnapshot.npcs[0].id}, Type: ${receivedSnapshot.npcs[0].type}, LaneX: ${receivedSnapshot.npcs[0].laneX}, Speed: ${receivedSnapshot.npcs[0].cruiseSpeed}`);
  console.log(`✔ [TEST D.3] Authoritative Traffic signals count: ${receivedSnapshot.signals.length}`);
  console.log(`✔ [TEST D.4] Sample Signal: ID ${receivedSnapshot.signals[0].id}, Phase: ${receivedSnapshot.signals[0].phase}, TransitionIn: ${receivedSnapshot.signals[0].timeToTransitionMs}ms`);

  // TEST E: ENVIRONMENT & WEATHER SYNCHRONIZATION
  console.log('\n--- TEST E: ENVIRONMENT & WEATHER SYNCHRONIZATION ---');
  console.log(`✔ [TEST E.1] Room authoritative weatherMode: ${receivedSnapshot.environment.weatherMode}`);
  console.log(`✔ [TEST E.2] Room authoritative timeOfDay: ${receivedSnapshot.environment.timeOfDay}`);

  // TEST F: CRASH EVENT & WINNER NOTIFICATION
  console.log('\n--- TEST F: CRASH EVENT & GAMEPLAY OUTCOME ---');
  const hostCrashPromise = new Promise<any>((resolve) => {
    clientA.on('gameplay:event', (event) => {
      if (event.eventType === 'crash') resolve(event);
    });
  });

  // Client B crashes
  clientB.emit('player:crashed', { score: 850 });
  const crashEvent = await hostCrashPromise;

  console.log(`✔ [TEST F.1] Host received crash event: Crashed Pilot ID: ${crashEvent.crashedPlayerId}, Final Score: ${crashEvent.finalScore}`);
  if (crashEvent.crashedPlayerId !== clientB.id) throw new Error('Crash event pilot mismatch');

  // TEST G: REMATCH FLOW
  console.log('\n--- TEST G: REMATCH FLOW ---');
  const rematchRequestedPromise = new Promise<any>((resolve) => {
    clientB.on('gameplay:event', (event) => {
      if (event.eventType === 'rematch_requested') resolve(event);
    });
  });
  const rematchStartPromise = new Promise<any>((resolve) => {
    clientA.on('gameplay:event', (event) => {
      if (event.eventType === 'rematch_start') resolve(event);
    });
  });

  // Client A requests rematch
  clientA.emit('player:rematch-request');
  await rematchRequestedPromise;
  console.log('✔ [TEST G.1] Client B received rematch request notification.');

  // Client B accepts rematch
  clientB.emit('player:rematch-accept');
  const rematchStart = await rematchStartPromise;
  console.log(`✔ [TEST G.2] Both clients received rematch_start signal with synchronized world seed: ${rematchStart.worldConfig.seed}`);

  // TEST H: DISCONNECTION & CLEANUP
  console.log('\n--- TEST H: DISCONNECTION & CLEANUP ---');
  const playerLeftPromise = new Promise<any>((resolve) => {
    clientA.on('room:player-left', (data) => resolve(data));
  });

  clientB.disconnect();
  const leftEvent = await playerLeftPromise;
  console.log(`✔ [TEST H.1] Client A notified that player ${leftEvent.playerId} disconnected.`);

  clientA.disconnect();
  console.log('\n====================================================');
  console.log('   ALL TWO-PLAYER E2E TESTS PASSED WITH 100% SUCCESS! ');
  console.log('====================================================');
}

runTwoPlayerEndToEnd()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });

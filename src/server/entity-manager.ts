import { AuthoritativeNpc, TrafficSignalState, VehicleModelType, NpcAiState } from './types.js';
import { SeededRandom } from './seed-rng.js';

const LANE_X_POSITIONS = [-5, 0, 5];
const VEHICLE_LENGTH = 4;
const MIN_VEHICLE_GAP = 5;
const SAFE_MIN_CENTER_DIST = VEHICLE_LENGTH + MIN_VEHICLE_GAP;

export class EntityManager {
  private rng: SeededRandom;
  private npcs: Map<number, AuthoritativeNpc> = new Map();
  private signals: Map<string, TrafficSignalState> = new Map();
  private nextNpcId = 1;
  private hornYieldTimers: Map<number, number> = new Map();

  constructor(seed: number) {
    this.rng = new SeededRandom(seed);
    this.initTrafficSignals();
    this.initPrespawnNpcs();
  }

  private initTrafficSignals(): void {
    // Traffic signals placed along the highway every ~300 meters starting at 180m
    const signalInterval = 300;
    const initialSignals = 10;
    const now = Date.now();

    for (let i = 0; i < initialSignals; i++) {
      const roadDist = 180 + i * signalInterval;
      const id = `sig_${i + 1}`;
      // Stagger phases slightly for varied realistic city feel
      const offset = (i * 7000) % 26500;
      this.signals.set(id, {
        id,
        roadDist,
        phase: 'green',
        phaseStartTime: now - offset,
        phaseDuration: 14000,
        nextTransitionTime: now + (14000 - (offset % 14000)),
      });
    }
  }

  private initPrespawnNpcs(): void {
    const vehicleTypes: VehicleModelType[] = [
      'car',
      'truck',
      'schoolbus',
      'thar',
      'bike',
      'police',
      'ambulance',
    ];

    const initialOffsets = [42, 75, 110, 145, 180, 220, 260, 300, 345, 390];
    const lanes = [-5, 5, 0, -5, 5, 0, -5, 5, 0, -5];

    for (let i = 0; i < initialOffsets.length; i++) {
      const type = vehicleTypes[i % vehicleTypes.length];
      const lane = lanes[i % lanes.length];
      const id = this.nextNpcId++;

      const isHeavy = type === 'truck' || type === 'schoolbus';
      const isBike = type === 'bike';
      const isEmergency = type === 'police' || type === 'ambulance';

      const npc: AuthoritativeNpc = {
        id,
        type,
        laneX: lane,
        targetX: lane,
        roadDist: initialOffsets[i],
        cruiseSpeed: 0.10 + (i * 0.005) + this.rng.range(-0.01, 0.015),
        currentSpeed: 0.10 + (i * 0.005),
        speedBoost: 0,
        aiState: 'cruising',
        halfLength: isHeavy ? 3.5 : isBike ? 1.2 : 2.2,
        halfWidth: isBike ? 0.45 : isHeavy ? 1.25 : 0.98,
        height: isHeavy ? 2.8 : 1.4,
        isHeavy,
        isEmergency,
        stoppedForSignalId: null,
      };

      this.npcs.set(id, npc);
    }
  }

  public updateSignals(now: Date = new Date()): void {
    const currentTime = now.getTime();
    for (const signal of this.signals.values()) {
      if (currentTime >= signal.nextTransitionTime) {
        if (signal.phase === 'green') {
          signal.phase = 'yellow';
          signal.phaseStartTime = currentTime;
          signal.phaseDuration = 3500;
          signal.nextTransitionTime = currentTime + 3500;
        } else if (signal.phase === 'yellow') {
          signal.phase = 'red';
          signal.phaseStartTime = currentTime;
          signal.phaseDuration = 9000;
          signal.nextTransitionTime = currentTime + 9000;
        } else {
          signal.phase = 'green';
          signal.phaseStartTime = currentTime;
          signal.phaseDuration = 14000;
          signal.nextTransitionTime = currentTime + 14000;
        }
      }
    }
  }

  public updateNpcs(deltaSec: number, playerRoadDistances: number[]): void {
    if (playerRoadDistances.length === 0) return;

    const minPlayerDist = Math.min(...playerRoadDistances);
    const maxPlayerDist = Math.max(...playerRoadDistances);

    // 1. Update horn yield timers
    for (const [npcId, remaining] of this.hornYieldTimers.entries()) {
      const nextTime = remaining - deltaSec;
      if (nextTime <= 0) {
        this.hornYieldTimers.delete(npcId);
        const npc = this.npcs.get(npcId);
        if (npc) {
          npc.targetX = npc.laneX; // return to lane
          npc.aiState = 'cruising';
        }
      } else {
        this.hornYieldTimers.set(npcId, nextTime);
      }
    }

    // 2. Check signal stops & lane dynamics for each NPC
    const sortedNpcs = Array.from(this.npcs.values()).sort((a, b) => b.roadDist - a.roadDist);

    for (let i = 0; i < sortedNpcs.length; i++) {
      const npc = sortedNpcs[i];
      let desiredSpeed = npc.cruiseSpeed;

      // Traffic Signal Check: check signals ahead within 28 meters
      let signalObstacle = false;
      for (const signal of this.signals.values()) {
        const distToSignal = signal.roadDist - npc.roadDist;
        if (distToSignal > 0 && distToSignal < 26) {
          if (signal.phase === 'red' || (signal.phase === 'yellow' && distToSignal > 12)) {
            signalObstacle = true;
            npc.stoppedForSignalId = signal.id;
            npc.aiState = 'stopped_at_signal';
            // Smoothly brake to a complete stop at the stop line
            desiredSpeed = 0;
            break;
          }
        }
      }

      if (!signalObstacle && npc.stoppedForSignalId) {
        npc.stoppedForSignalId = null;
        npc.aiState = 'accelerating';
      }

      // Vehicle Following: don't rear-end car in front
      for (let j = 0; j < sortedNpcs.length; j++) {
        if (i === j) continue;
        const other = sortedNpcs[j];
        if (Math.abs(npc.targetX - other.targetX) < 1.4) {
          const gap = other.roadDist - npc.roadDist;
          if (gap > 0 && gap < SAFE_MIN_CENTER_DIST + 4) {
            desiredSpeed = Math.min(desiredSpeed, other.currentSpeed * 0.9);
          }
        }
      }

      // Smooth acceleration / deceleration
      const accelRate = desiredSpeed < npc.currentSpeed ? 0.35 : 0.15;
      npc.currentSpeed += (desiredSpeed - npc.currentSpeed) * accelRate;
      if (npc.currentSpeed < 0.002) npc.currentSpeed = 0;

      // Advance along highway (scale factor 90 matches client coordinate physics)
      npc.roadDist += npc.currentSpeed * deltaSec * 90;

      // Lane-shifting lerp
      npc.laneX += (npc.targetX - npc.laneX) * Math.min(deltaSec * 4, 0.25);
    }

    // 3. Prevent 3-lane simultaneous blockade
    this.preventRoadBlockades();

    // 4. Cull NPCs far behind all players (> 70m behind trailing player)
    // or unreasonably far ahead (> 450m ahead of leading player)
    for (const [id, npc] of this.npcs.entries()) {
      if (npc.roadDist < minPlayerDist - 70 || npc.roadDist > maxPlayerDist + 450) {
        this.npcs.delete(id);
        this.hornYieldTimers.delete(id);
      }
    }

    // 5. Spawn new NPCs ahead of players if density is low
    this.maintainTrafficDensity(playerRoadDistances);
  }

  private preventRoadBlockades(): void {
    const list = Array.from(this.npcs.values());
    if (list.length < LANE_X_POSITIONS.length) return;

    for (let i = 0; i < list.length; i++) {
      const anchor = list[i];
      const cluster = list.filter((c) => Math.abs(c.roadDist - anchor.roadDist) < 16);
      if (cluster.length >= LANE_X_POSITIONS.length) {
        const lanesUsed = new Set(
          cluster.map((c) =>
            LANE_X_POSITIONS.reduce((best, lx) =>
              Math.abs(lx - c.laneX) < Math.abs(best - c.laneX) ? lx : best
            )
          )
        );
        if (lanesUsed.size >= LANE_X_POSITIONS.length) {
          // Push rearmost vehicle back or adjust speed
          const rearmost = cluster.reduce((min, c) => (c.roadDist < min.roadDist ? c : min));
          if (rearmost.aiState !== 'stopped_at_signal') {
            rearmost.roadDist -= 18;
          }
          break;
        }
      }
    }
  }

  private maintainTrafficDensity(playerRoadDistances: number[]): void {
    const maxNpcCount = 18;
    if (this.npcs.size >= maxNpcCount) return;

    for (const playerDist of playerRoadDistances) {
      const countAhead = Array.from(this.npcs.values()).filter(
        (c) => c.roadDist >= playerDist + 30 && c.roadDist <= playerDist + 220
      ).length;

      if (countAhead < 6 && this.npcs.size < maxNpcCount) {
        const lane = this.rng.choice(LANE_X_POSITIONS);
        const spawnDist = playerDist + 80 + this.rng.range(15, 110);

        const conflict = Array.from(this.npcs.values()).some(
          (c) => Math.abs(c.roadDist - spawnDist) < SAFE_MIN_CENTER_DIST && Math.abs(c.laneX - lane) < 1.6
        );

        if (!conflict) {
          const vehicleTypes: VehicleModelType[] = [
            'car',
            'truck',
            'schoolbus',
            'thar',
            'bike',
            'police',
            'ambulance',
          ];
          const type = this.rng.choice(vehicleTypes);
          const isHeavy = type === 'truck' || type === 'schoolbus';
          const isBike = type === 'bike';
          const isEmergency = type === 'police' || type === 'ambulance';
          const id = this.nextNpcId++;

          const npc: AuthoritativeNpc = {
            id,
            type,
            laneX: lane,
            targetX: lane,
            roadDist: spawnDist,
            cruiseSpeed: this.rng.range(0.09, 0.16),
            currentSpeed: this.rng.range(0.09, 0.14),
            speedBoost: 0,
            aiState: 'cruising',
            halfLength: isHeavy ? 3.5 : isBike ? 1.2 : 2.2,
            halfWidth: isBike ? 0.45 : isHeavy ? 1.25 : 0.98,
            height: isHeavy ? 2.8 : 1.4,
            isHeavy,
            isEmergency,
            stoppedForSignalId: null,
          };

          this.npcs.set(id, npc);
        }
      }
    }
  }

  public triggerHornYield(laneX: number, playerRoadDist: number): void {
    // NPCs ahead of player in similar lane yield towards outer shoulders
    for (const npc of this.npcs.values()) {
      const distAhead = npc.roadDist - playerRoadDist;
      if (distAhead > 5 && distAhead < 80 && Math.abs(npc.laneX - laneX) < 2.5) {
        const yieldSide = npc.laneX >= 0 ? 6.2 : -6.2;
        npc.targetX = yieldSide;
        npc.aiState = 'yielding';
        this.hornYieldTimers.set(npc.id, 4.0); // yield for 4 seconds
      }
    }
  }

  public getAllNpcs(): AuthoritativeNpc[] {
    return Array.from(this.npcs.values());
  }

  public getSignals(): TrafficSignalState[] {
    const now = Date.now();
    return Array.from(this.signals.values()).map((s) => ({
      ...s,
      timeToTransitionMs: Math.max(0, s.nextTransitionTime - now),
    }));
  }

  public removeNpc(id: number): void {
    this.npcs.delete(id);
    this.hornYieldTimers.delete(id);
  }
}

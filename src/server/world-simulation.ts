import {
  EnvironmentState,
  PlayerVehicleState,
  RoomSnapshot,
  VehicleModelType,
  Vector3D,
  EulerRotation,
  PlayerInput,
  WorldConfig,
} from './types.js';
import { EntityManager } from './entity-manager.js';

const ROAD_LIMIT_X = 6.65;
const MAX_PLAUSIBLE_SPEED = 2.0; // Normalized engine units (corresponds to ~440 km/h hyperdrive)

export class WorldSimulation {
  public readonly roomId: string;
  public readonly roomCode: string;
  public readonly worldSeed: number;

  public readonly entityManager: EntityManager;
  public readonly players: Map<string, PlayerVehicleState> = new Map();

  public environment: EnvironmentState;
  private weatherTimer: number = 0;
  private simulationStartTime: number = Date.now();
  private lastTickTime: number = Date.now();

  public readonly worldConfig: WorldConfig;

  constructor(roomId: string, roomCode: string, worldSeed: number) {
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.worldSeed = worldSeed;
    this.entityManager = new EntityManager(worldSeed);

    this.worldConfig = {
      seed: worldSeed,
      roadWidth: 16,
      segmentLength: 100,
      totalSegments: 6,
      trafficSignalDistances: this.entityManager.getSignals().map((s) => s.roadDist),
    };

    this.environment = {
      timestamp: Date.now(),
      timeOfDay: 10.0, // 10:00 AM morning start
      weatherMode: 0,  // Morning / Clear
      weatherName: 'Morning Clear',
      rainIntensity: 0.0,
      fogDensity: 0.002,
      ambientIntensity: 1.2,
      sunIntensity: 1.2,
    };
  }

  public addPlayer(
    playerId: string,
    pilotName: string,
    vehicleType: VehicleModelType,
    vehicleColor: number,
    slot: number
  ): PlayerVehicleState {
    // Stagger spawn positions so players don't spawn inside each other
    // Slot 0 (Host): +2.5 right lane; Slot 1: -2.5 left lane; Slot 2: 0 center; etc.
    const spawnX = slot === 0 ? 2.5 : slot === 1 ? -2.5 : slot % 2 === 0 ? 4.5 : -4.5;

    const playerState: PlayerVehicleState = {
      playerId,
      slot,
      pilotName: pilotName || `PILOT-${slot + 1}`,
      vehicleType,
      vehicleColor,
      position: { x: spawnX, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      rawSpeed: 0.28,
      steerAngle: 0,
      score: 0,
      isAlive: true,
      isBoosting: false,
      isHornActive: false,
      ping: 0,
      lastInputTime: Date.now(),
      lastSequence: 0,
    };

    this.players.set(playerId, playerState);
    return playerState;
  }

  public removePlayer(playerId: string): boolean {
    return this.players.delete(playerId);
  }

  public getPlayer(playerId: string): PlayerVehicleState | undefined {
    return this.players.get(playerId);
  }

  public processPlayerInput(playerId: string, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive) return;

    player.lastInputTime = Date.now();
    player.lastSequence = input.clientSequence;
    player.isBoosting = input.isBoosting || input.isSuperBoosting;
    player.isHornActive = input.isHornActive;

    if (input.isHornActive) {
      const roadDist = player.score * 0.36;
      this.entityManager.triggerHornYield(player.position.x, roadDist);
    }
  }

  public updatePlayerStateFromClient(
    playerId: string,
    data: {
      position: Vector3D;
      rotation: EulerRotation;
      speed: number;
      rawSpeed: number;
      steerAngle?: number;
      score: number;
      isBoosting?: boolean;
      isHornActive?: boolean;
      isAlive?: boolean;
      clientSequence?: number;
    }
  ): void {
    const player = this.players.get(playerId);
    if (!player) return;

    // Server-side validation: prevent teleporting or arbitrary physics hacks
    const validatedX = Math.max(-ROAD_LIMIT_X, Math.min(ROAD_LIMIT_X, data.position.x));
    const clampedRawSpeed = Math.max(0, Math.min(MAX_PLAUSIBLE_SPEED, data.rawSpeed || 0.28));

    // Monotonic score progression validation: score cannot jump arbitrarily backwards or jump by millions
    const maxScoreJump = 3000;
    const currentScore = player.score;
    const validatedScore =
      data.score >= currentScore && data.score <= currentScore + maxScoreJump
        ? data.score
        : currentScore;

    player.position.x = validatedX;
    player.position.y = Math.max(0, Math.min(10, data.position.y));
    player.position.z = data.position.z;

    player.rotation = data.rotation;
    player.speed = data.speed;
    player.rawSpeed = clampedRawSpeed;
    player.score = validatedScore;
    if (data.steerAngle !== undefined) player.steerAngle = data.steerAngle;
    if (data.isBoosting !== undefined) player.isBoosting = data.isBoosting;
    if (data.isHornActive !== undefined) player.isHornActive = data.isHornActive;
    if (data.isAlive !== undefined) player.isAlive = data.isAlive;
    if (data.clientSequence !== undefined) player.lastSequence = data.clientSequence;
  }

  public tick(): void {
    const now = Date.now();
    const deltaSec = Math.min((now - this.lastTickTime) / 1000, 0.1);
    this.lastTickTime = now;

    // 1. Advance simulation clock & environment state
    this.updateEnvironment(deltaSec);

    // 2. Update traffic signals
    this.entityManager.updateSignals(new Date(now));

    // 3. Update authoritative NPC AI
    const playerRoadDistances = Array.from(this.players.values()).map(
      (p) => p.score * 0.36
    );
    this.entityManager.updateNpcs(deltaSec, playerRoadDistances);
  }

  private updateEnvironment(deltaSec: number): void {
    this.environment.timestamp = Date.now();

    // Advance 24h day/night cycle: 1 hour every 30 seconds real-time
    this.environment.timeOfDay = (this.environment.timeOfDay + deltaSec * (1 / 30)) % 24;

    this.weatherTimer += deltaSec;
    // Rotate weather mode every 60 seconds
    if (this.weatherTimer >= 60) {
      this.weatherTimer = 0;
      const nextMode = (this.environment.weatherMode + 1) % 4;
      this.environment.weatherMode = nextMode;

      if (nextMode === 0) {
        this.environment.weatherName = 'Morning Clear';
        this.environment.rainIntensity = 0.0;
        this.environment.fogDensity = 0.002;
        this.environment.ambientIntensity = 1.2;
        this.environment.sunIntensity = 1.2;
      } else if (nextMode === 1) {
        this.environment.weatherName = 'Night Neon';
        this.environment.rainIntensity = 0.0;
        this.environment.fogDensity = 0.0035;
        this.environment.ambientIntensity = 0.35;
        this.environment.sunIntensity = 0.1;
      } else if (nextMode === 2) {
        this.environment.weatherName = 'Heavy Rain & Storm';
        this.environment.rainIntensity = 1.0;
        this.environment.fogDensity = 0.007;
        this.environment.ambientIntensity = 0.55;
        this.environment.sunIntensity = 0.4;
      } else {
        this.environment.weatherName = 'Golden Sunset Fog';
        this.environment.rainIntensity = 0.0;
        this.environment.fogDensity = 0.005;
        this.environment.ambientIntensity = 0.9;
        this.environment.sunIntensity = 1.0;
      }
    }
  }

  public setWeatherMode(mode: number): void {
    this.environment.weatherMode = mode % 4;
    this.weatherTimer = 0;
  }

  public createSnapshot(): RoomSnapshot {
    return {
      roomId: this.roomId,
      roomCode: this.roomCode,
      serverTime: Date.now(),
      players: Array.from(this.players.values()),
      npcs: this.entityManager.getAllNpcs(),
      signals: this.entityManager.getSignals(),
      environment: { ...this.environment },
    };
  }
}

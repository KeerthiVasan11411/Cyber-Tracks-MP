import { WorldSimulation } from './world-simulation.js';
import {
  PlayerVehicleState,
  RoomInitialState,
  VehicleModelType,
  WorldConfig,
} from './types.js';

export interface RoomMetadata {
  roomId: string;
  roomCode: string;
  createdAt: number;
  lastActiveAt: number;
  simulation: WorldSimulation;
  hostPlayerId: string;
}

export class RoomManager {
  private rooms: Map<string, RoomMetadata> = new Map(); // roomId -> metadata
  private codeToRoomId: Map<string, string> = new Map(); // uppercase code -> roomId
  private playerToRoomId: Map<string, string> = new Map(); // socket/playerId -> roomId

  private tickInterval: NodeJS.Timeout | null = null;
  private readonly TICK_RATE_HZ = 25; // 25 Hz authoritative simulation
  private onSnapshotCallback?: (roomId: string, snapshot: any) => void;

  constructor() {
    this.startSimulationLoop();
  }

  public setSnapshotCallback(callback: (roomId: string, snapshot: any) => void): void {
    this.onSnapshotCallback = callback;
  }

  private startSimulationLoop(): void {
    const tickMs = Math.floor(1000 / this.TICK_RATE_HZ);
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      for (const [roomId, meta] of this.rooms.entries()) {
        // If room has no connected players for > 2 minutes, destroy room
        if (meta.simulation.players.size === 0 && now - meta.lastActiveAt > 120000) {
          this.destroyRoom(roomId);
          continue;
        }

        if (meta.simulation.players.size > 0) {
          meta.lastActiveAt = now;
          meta.simulation.tick();
          if (this.onSnapshotCallback) {
            const snapshot = meta.simulation.createSnapshot();
            this.onSnapshotCallback(roomId, snapshot);
          }
        }
      }
    }, tickMs);
  }

  public stopSimulationLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  public generateRoomCode(): string {
    // Generate 5-digit PIN code like '48291'
    let code = '';
    do {
      code = Math.floor(10000 + Math.random() * 90000).toString();
    } while (this.codeToRoomId.has(code));
    return code;
  }

  public createRoom(
    hostPlayerId: string,
    pilotName: string,
    vehicleType: VehicleModelType = 'car',
    vehicleColor: number = 0x00f0ff,
    customCode?: string
  ): { meta: RoomMetadata; initialState: RoomInitialState } {
    // Clean up if player is already in a room
    this.leaveRoom(hostPlayerId);

    const roomCode = customCode ? customCode.trim().toUpperCase() : this.generateRoomCode();
    const roomId = `room_${roomCode}_${Date.now()}`;
    const worldSeed = Math.floor(Math.random() * 1000000) + 1;

    const simulation = new WorldSimulation(roomId, roomCode, worldSeed);
    const hostPlayer = simulation.addPlayer(hostPlayerId, pilotName, vehicleType, vehicleColor, 0);

    const meta: RoomMetadata = {
      roomId,
      roomCode,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      simulation,
      hostPlayerId,
    };

    this.rooms.set(roomId, meta);
    this.codeToRoomId.set(roomCode, roomId);
    this.playerToRoomId.set(hostPlayerId, roomId);

    const worldConfig = simulation.worldConfig;

    const initialState: RoomInitialState = {
      roomId,
      roomCode,
      serverTime: Date.now(),
      worldConfig,
      localPlayerSlot: 0,
      localPlayerId: hostPlayerId,
      assignedSpawnX: hostPlayer.position.x,
      environment: { ...simulation.environment },
      players: Array.from(simulation.players.values()),
      signals: simulation.entityManager.getSignals(),
    };

    return { meta, initialState };
  }

  public joinRoom(
    playerId: string,
    roomCode: string,
    pilotName: string,
    vehicleType: VehicleModelType = 'car',
    vehicleColor: number = 0x0044ff
  ): { meta: RoomMetadata; initialState: RoomInitialState } | null {
    const code = roomCode.trim().toUpperCase();
    const roomId = this.codeToRoomId.get(code);
    if (!roomId) return null;

    const meta = this.rooms.get(roomId);
    if (!meta) return null;

    // Clean up if player is already in another room
    this.leaveRoom(playerId);

    const slot = meta.simulation.players.size;
    const player = meta.simulation.addPlayer(playerId, pilotName, vehicleType, vehicleColor, slot);

    this.playerToRoomId.set(playerId, roomId);
    meta.lastActiveAt = Date.now();

    const worldConfig: WorldConfig = {
      seed: meta.simulation.worldSeed,
      roadWidth: 16,
      segmentLength: 100,
      totalSegments: 6,
      trafficSignalDistances: meta.simulation.entityManager.getSignals().map((s) => s.roadDist),
    };

    const initialState: RoomInitialState = {
      roomId,
      roomCode: meta.roomCode,
      serverTime: Date.now(),
      worldConfig,
      localPlayerSlot: slot,
      localPlayerId: playerId,
      assignedSpawnX: player.position.x,
      environment: { ...meta.simulation.environment },
      players: Array.from(meta.simulation.players.values()),
      signals: meta.simulation.entityManager.getSignals(),
    };

    return { meta, initialState };
  }

  public leaveRoom(playerId: string): { roomId: string; roomCode: string; wasHost: boolean } | null {
    const roomId = this.playerToRoomId.get(playerId);
    if (!roomId) return null;

    this.playerToRoomId.delete(playerId);
    const meta = this.rooms.get(roomId);
    if (!meta) return null;

    const wasHost = meta.hostPlayerId === playerId;
    meta.simulation.removePlayer(playerId);

    if (meta.simulation.players.size === 0) {
      this.destroyRoom(roomId);
    } else if (wasHost) {
      // Reassign host to the next remaining player
      const nextHost = meta.simulation.players.values().next().value;
      if (nextHost) {
        meta.hostPlayerId = nextHost.playerId;
      }
    }

    return { roomId, roomCode: meta.roomCode, wasHost };
  }

  public getPlayerRoom(playerId: string): RoomMetadata | undefined {
    const roomId = this.playerToRoomId.get(playerId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  public getRoomByCode(code: string): RoomMetadata | undefined {
    const roomId = this.codeToRoomId.get(code.trim().toUpperCase());
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  public destroyRoom(roomId: string): void {
    const meta = this.rooms.get(roomId);
    if (meta) {
      this.codeToRoomId.delete(meta.roomCode);
      for (const pid of meta.simulation.players.keys()) {
        this.playerToRoomId.delete(pid);
      }
      this.rooms.delete(roomId);
    }
  }

  public getActiveRoomCount(): number {
    return this.rooms.size;
  }
}

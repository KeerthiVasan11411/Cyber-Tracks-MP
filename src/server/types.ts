export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface EulerRotation {
  x: number;
  y: number;
  z: number;
}

export type VehicleModelType = 'car' | 'bike' | 'truck' | 'schoolbus' | 'thar' | 'police' | 'ambulance';

export interface PlayerInput {
  throttle: number; // 0 to 1
  brake: number;    // 0 to 1
  steer: number;    // -1 to 1
  isBoosting: boolean;
  isSuperBoosting: boolean;
  isHornActive: boolean;
  timestamp: number;
  clientSequence: number;
}

export interface PlayerVehicleState {
  playerId: string;
  slot: number; // 0, 1, 2, ...
  pilotName: string;
  vehicleType: VehicleModelType;
  vehicleColor: number;
  position: Vector3D;
  rotation: EulerRotation;
  velocity: Vector3D;
  speed: number;       // km/h
  rawSpeed: number;    // normalized engine units
  steerAngle: number;
  score: number;
  isAlive: boolean;
  isBoosting: boolean;
  isHornActive: boolean;
  ping: number;
  lastInputTime: number;
  lastSequence: number;
}

export type NpcAiState = 'cruising' | 'yielding' | 'stopped_at_signal' | 'accelerating' | 'crashed';

export interface AuthoritativeNpc {
  id: number;
  type: VehicleModelType;
  laneX: number;
  targetX: number;
  roadDist: number;       // absolute coordinate along highway
  cruiseSpeed: number;    // units/sec
  currentSpeed: number;   // units/sec
  speedBoost: number;
  aiState: NpcAiState;
  halfLength: number;
  halfWidth: number;
  height: number;
  isHeavy: boolean;
  isEmergency: boolean;
  stoppedForSignalId: string | null;
}

export interface AuthoritativePedestrian {
  id: number;
  x: number;
  roadDist: number;
  walkDirection: number; // -1 or 1
  isCrossing: boolean;
  walkPhase: number;
}

export type SignalPhase = 'green' | 'yellow' | 'red';

export interface TrafficSignalState {
  id: string;
  roadDist: number;
  phase: SignalPhase;
  phaseStartTime: number;
  phaseDuration: number;
  nextTransitionTime: number;
  timeToTransitionMs?: number;
}

export interface EnvironmentState {
  timestamp: number;
  timeOfDay: number;        // 0 to 24 hours simulation time
  weatherMode: number;      // 0: Morning/Clear, 1: Night/Neon, 2: Rainy/Wet, 3: Foggy Sunset
  weatherName: string;
  rainIntensity: number;
  fogDensity: number;
  ambientIntensity: number;
  sunIntensity: number;
}

export interface WorldConfig {
  seed: number;
  roadWidth: number;
  segmentLength: number;
  totalSegments: number;
  trafficSignalDistances: number[];
}

export interface RoomSnapshot {
  roomId: string;
  roomCode: string;
  serverTime: number;
  players: PlayerVehicleState[];
  npcs: AuthoritativeNpc[];
  signals: TrafficSignalState[];
  environment: EnvironmentState;
}

export interface RoomInitialState {
  roomId: string;
  roomCode: string;
  serverTime: number;
  worldConfig: WorldConfig;
  localPlayerSlot: number;
  localPlayerId: string;
  assignedSpawnX: number;
  environment: EnvironmentState;
  players: PlayerVehicleState[];
  signals: TrafficSignalState[];
}

export interface CollisionEventPayload {
  attackerId?: string;
  targetId?: string;
  targetType: 'player' | 'npc' | 'obstacle';
  impactLocation: Vector3D;
  impactVelocity: Vector3D;
  timestamp: number;
}

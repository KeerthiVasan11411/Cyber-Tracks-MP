import { Server as SocketIOServer, Socket } from 'socket.io';
import { RoomManager } from './room-manager.js';
import { VehicleModelType, PlayerInput } from './types.js';

export function setupSocketHandlers(io: SocketIOServer, roomManager: RoomManager): void {
  // Wire up authoritative room snapshot broadcast
  roomManager.setSnapshotCallback((roomId: string, snapshot) => {
    io.to(roomId).emit('room:state', snapshot);
  });

  io.on('connection', (socket: Socket) => {
    const socketId = socket.id;

    // ── Ping / Pong for latency measurement ──
    socket.on('player:ping', (data: { timestamp: number }) => {
      socket.emit('player:pong', {
        clientTimestamp: data?.timestamp || Date.now(),
        serverTime: Date.now(),
      });
    });

    // ── Create Room ──
    socket.on(
      'room:create',
      (payload: {
        pilotName?: string;
        vehicleType?: VehicleModelType;
        vehicleColor?: number;
        roomCode?: string;
      }) => {
        try {
          const pilotName = payload?.pilotName || 'PILOT-1';
          const vehicleType = payload?.vehicleType || 'car';
          const vehicleColor = payload?.vehicleColor ?? 0x00f0ff;

          const { meta, initialState } = roomManager.createRoom(
            socketId,
            pilotName,
            vehicleType,
            vehicleColor,
            payload?.roomCode
          );

          socket.join(meta.roomId);
          socket.emit('room:created', initialState);
        } catch (err: any) {
          socket.emit('server:error', { message: err?.message || 'Failed to create room' });
        }
      }
    );

    // ── Join Room ──
    socket.on(
      'room:join',
      (payload: {
        roomCode: string;
        pilotName?: string;
        vehicleType?: VehicleModelType;
        vehicleColor?: number;
      }) => {
        try {
          if (!payload?.roomCode) {
            socket.emit('server:error', { message: 'Room code is required' });
            return;
          }

          const pilotName = payload?.pilotName || 'PILOT-2';
          const vehicleType = payload?.vehicleType || 'car';
          const vehicleColor = payload?.vehicleColor ?? 0x0044ff;

          const result = roomManager.joinRoom(
            socketId,
            payload.roomCode,
            pilotName,
            vehicleType,
            vehicleColor
          );

          if (!result) {
            socket.emit('server:error', {
              message: `Room "${payload.roomCode}" not found. Verify code and try again.`,
              code: 'ROOM_NOT_FOUND',
            });
            return;
          }

          const { meta, initialState } = result;
          socket.join(meta.roomId);

          // Tell the joining player their initial state
          socket.emit('room:joined', initialState);

          // Notify existing players in room
          const newPlayer = meta.simulation.getPlayer(socketId);
          if (newPlayer) {
            socket.to(meta.roomId).emit('room:player-joined', newPlayer);
          }
        } catch (err: any) {
          socket.emit('server:error', { message: err?.message || 'Failed to join room' });
        }
      }
    );

    // ── Leave Room ──
    socket.on('room:leave', () => {
      const left = roomManager.leaveRoom(socketId);
      if (left) {
        socket.leave(left.roomId);
        io.to(left.roomId).emit('room:player-left', { playerId: socketId });
      }
    });

    // ── Player High-Frequency State Update ──
    socket.on('player:update', (data: any) => {
      if (!data) return;
      const room = roomManager.getPlayerRoom(socketId);
      if (!room) return;

      room.simulation.updatePlayerStateFromClient(socketId, {
        position: data.position || { x: 0, y: 0, z: 0 },
        rotation: data.rotation || { x: 0, y: 0, z: 0 },
        speed: typeof data.speed === 'number' ? data.speed : 0,
        rawSpeed: typeof data.rawSpeed === 'number' ? data.rawSpeed : 0.28,
        steerAngle: data.steerAngle,
        score: typeof data.score === 'number' ? data.score : 0,
        isBoosting: !!data.isBoosting,
        isHornActive: !!data.isHornActive,
        isAlive: data.isAlive !== undefined ? !!data.isAlive : true,
        clientSequence: data.clientSequence,
      });
    });

    // ── Player Driving Input Event ──
    socket.on('player:input', (input: PlayerInput) => {
      const room = roomManager.getPlayerRoom(socketId);
      if (!room) return;
      room.simulation.processPlayerInput(socketId, input);
    });

    // ── Horn Trigger ──
    socket.on('player:horn', (data: { laneX: number; roadDist: number }) => {
      const room = roomManager.getPlayerRoom(socketId);
      if (!room) return;
      if (typeof data?.laneX === 'number' && typeof data?.roadDist === 'number') {
        room.simulation.entityManager.triggerHornYield(data.laneX, data.roadDist);
      }
    });

    // ── Player Crashed ──
    socket.on('player:crashed', (data: { score: number; impactPoint?: any }) => {
      const room = roomManager.getPlayerRoom(socketId);
      if (!room) return;

      const player = room.simulation.getPlayer(socketId);
      if (player) {
        player.isAlive = false;
        player.score = data?.score ?? player.score;
      }

      // Broadcast authoritative crash event to all room participants
      io.to(room.roomId).emit('gameplay:event', {
        eventType: 'crash',
        crashedPlayerId: socketId,
        finalScore: data?.score || player?.score || 0,
        impactPoint: data?.impactPoint,
      });
    });

    // ── Rematch Request ──
    socket.on('player:rematch-request', () => {
      const room = roomManager.getPlayerRoom(socketId);
      if (!room) return;

      io.to(room.roomId).emit('gameplay:event', {
        eventType: 'rematch_requested',
        playerId: socketId,
      });
    });

    // ── Rematch Accept / Start ──
    socket.on('player:rematch-accept', () => {
      const room = roomManager.getPlayerRoom(socketId);
      if (!room) return;

      // Reset all players in simulation for new race
      for (const player of room.simulation.players.values()) {
        player.isAlive = true;
        player.score = 0;
        player.speed = 0;
        player.rawSpeed = 0.28;
      }

      io.to(room.roomId).emit('gameplay:event', {
        eventType: 'rematch_start',
        serverTime: Date.now(),
        worldConfig: room.simulation.worldConfig,
      });
    });

    // ── Dev Weather Toggle ──
    socket.on('dev:set-weather', (payload: { weatherMode: number }) => {
      const room = roomManager.getPlayerRoom(socketId);
      if (!room) return;
      if (typeof payload?.weatherMode === 'number') {
        room.simulation.setWeatherMode(payload.weatherMode);
      }
    });

    // ── Disconnect Cleanup ──
    socket.on('disconnect', () => {
      const left = roomManager.leaveRoom(socketId);
      if (left) {
        io.to(left.roomId).emit('room:player-left', { playerId: socketId });
      }
    });
  });
}


        document.addEventListener('dblclick', (event) => {
            event.preventDefault();
        }, { passive: false });

        // --- SYNTHESIZER AUDIO ENGINE & MASTER GAIN ---
        let audioCtx = null;
        let masterGainNode = null;
        let lobbyTimer = null;
        let engineFundamental = null, engineHarmonic = null, exhaustNoise = null, engineGain = null, noiseFilter = null;
        let rainNoiseNode = null, rainGainNode = null, rainFilterNode = null;
        const masterVolumeSlider = document.getElementById('masterVolumeSlider');

        function initAudio() {
            if (audioCtx && audioCtx.state === 'suspended') { audioCtx.resume().catch(() => { }); }
            try {
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                if (!masterGainNode && audioCtx) {
                    masterGainNode = audioCtx.createGain();
                    masterGainNode.gain.setValueAtTime(parseFloat(masterVolumeSlider.value), audioCtx.currentTime);
                    masterGainNode.connect(audioCtx.destination);
                }
            } catch (e) { }
            const prompt = document.getElementById('audio-prompt');
            if (prompt) prompt.style.display = 'none';
        }

        masterVolumeSlider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            if (masterGainNode && audioCtx) {
                masterGainNode.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.02);
            }
        });

        function startLobbyMusic() {
            if (!audioCtx || audioCtx.state !== 'running') return;
            stopLobbyMusic();

            const melody = [
                { f: 110.00, d: 0.25 }, { f: 110.00, d: 0.25 }, { f: 164.81, d: 0.25 }, { f: 146.83, d: 0.25 },
                { f: 130.81, d: 0.25 }, { f: 110.00, d: 0.25 }, { f: 98.00, d: 0.25 }, { f: 123.47, d: 0.25 }
            ];
            let step = 0;

            lobbyTimer = setInterval(() => {
                if (!audioCtx || audioCtx.state !== 'running') return;
                try {
                    const note = melody[step];
                    const osc = audioCtx.createOscillator();
                    const subOsc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();

                    osc.type = 'sawtooth';
                    subOsc.type = 'triangle';

                    osc.frequency.setValueAtTime(note.f, audioCtx.currentTime);
                    subOsc.frequency.setValueAtTime(note.f / 2, audioCtx.currentTime);

                    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + note.d);

                    osc.connect(gain);
                    subOsc.connect(gain);
                    gain.connect(masterGainNode);

                    osc.start();
                    subOsc.start();
                    osc.stop(audioCtx.currentTime + note.d);
                    subOsc.stop(audioCtx.currentTime + note.d);

                    step = (step + 1) % melody.length;
                } catch (e) { }
            }, 200);
        }

        function stopLobbyMusic() {
            if (lobbyTimer) {
                clearInterval(lobbyTimer);
                lobbyTimer = null;
            }
        }

        function startEngineSound() {
            if (!audioCtx || audioCtx.state !== 'running') return;
            stopEngineSound();

            try {
                engineGain = audioCtx.createGain();
                engineGain.gain.setValueAtTime(0.12, audioCtx.currentTime);

                engineFundamental = audioCtx.createOscillator();
                engineFundamental.type = 'sawtooth';
                engineFundamental.frequency.setValueAtTime(45, audioCtx.currentTime);

                engineHarmonic = audioCtx.createOscillator();
                engineHarmonic.type = 'square';
                engineHarmonic.frequency.setValueAtTime(90, audioCtx.currentTime);

                const bufferSize = audioCtx.sampleRate * 2;
                const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;
                }

                exhaustNoise = audioCtx.createBufferSource();
                exhaustNoise.buffer = noiseBuffer;
                exhaustNoise.loop = true;

                noiseFilter = audioCtx.createBiquadFilter();
                noiseFilter.type = 'bandpass';
                noiseFilter.frequency.setValueAtTime(150, audioCtx.currentTime);
                noiseFilter.Q.setValueAtTime(3, audioCtx.currentTime);

                const noiseGain = audioCtx.createGain();
                noiseGain.gain.setValueAtTime(0.04, audioCtx.currentTime);

                exhaustNoise.connect(noiseFilter);
                noiseFilter.connect(noiseGain);

                engineFundamental.connect(engineGain);
                engineHarmonic.connect(engineGain);
                noiseGain.connect(engineGain);

                engineGain.connect(masterGainNode);

                engineFundamental.start();
                engineHarmonic.start();
                exhaustNoise.start();
            } catch (e) { }
        }

        function updateEnginePitch(speedRatio, isAccelerating) {
            if (engineFundamental && audioCtx && audioCtx.state === 'running') {
                try {
                    let pitch = 25 + (speedRatio * 210);
                    if (isAccelerating) pitch += 35;

                    if (speedRatio <= 0.01) {
                        engineGain.gain.setTargetAtTime(0.01, audioCtx.currentTime, 0.05);
                    } else {
                        engineGain.gain.setTargetAtTime(0.12, audioCtx.currentTime, 0.05);
                    }

                    engineFundamental.frequency.setTargetAtTime(pitch, audioCtx.currentTime, 0.08);
                    engineHarmonic.frequency.setTargetAtTime(pitch * 2.1, audioCtx.currentTime, 0.08);
                    if (noiseFilter) {
                        noiseFilter.frequency.setTargetAtTime(150 + (speedRatio * 600), audioCtx.currentTime, 0.08);
                    }
                } catch (e) { }
            }
        }

        function stopEngineSound() {
            if (engineFundamental) {
                try {
                    engineFundamental.stop();
                    engineHarmonic.stop();
                    exhaustNoise.stop();
                } catch (e) { }
                engineFundamental = null;
            }
        }

        function startRainSound() {
            if (!audioCtx || audioCtx.state !== 'running' || rainNoiseNode) return;

            try {
                const bufferSize = audioCtx.sampleRate * 2;
                const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;
                }

                rainNoiseNode = audioCtx.createBufferSource();
                rainNoiseNode.buffer = noiseBuffer;
                rainNoiseNode.loop = true;

                rainFilterNode = audioCtx.createBiquadFilter();
                rainFilterNode.type = 'lowpass';
                rainFilterNode.frequency.setValueAtTime(1200, audioCtx.currentTime);

                rainGainNode = audioCtx.createGain();
                rainGainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);

                rainNoiseNode.connect(rainFilterNode);
                rainFilterNode.connect(rainGainNode);
                rainGainNode.connect(masterGainNode);

                rainNoiseNode.start();
            } catch (e) { }
        }

        function stopRainSound() {
            if (rainNoiseNode) {
                try {
                    rainNoiseNode.stop();
                } catch (e) { }
                rainNoiseNode = null;
            }
        }

        function playThunderSound() {
            if (!audioCtx || audioCtx.state !== 'running') return;
            try {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(60, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(15, audioCtx.currentTime + 1.2);

                gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

                osc.connect(gain);
                gain.connect(masterGainNode);

                osc.start();
                osc.stop(audioCtx.currentTime + 1.2);
            } catch (e) { }
        }

        function playHornSound() {
            if (!audioCtx || audioCtx.state !== 'running') return;
            try {
                const osc1 = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc1.type = 'sawtooth';
                osc2.type = 'sawtooth';

                osc1.frequency.setValueAtTime(435, audioCtx.currentTime);
                osc2.frequency.setValueAtTime(345, audioCtx.currentTime);

                gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(masterGainNode);

                osc1.start();
                osc2.start();
                osc1.stop(audioCtx.currentTime + 0.4);
                osc2.stop(audioCtx.currentTime + 0.4);
            } catch (e) { }
        }

        function playCrashSound() {
            if (!audioCtx || audioCtx.state !== 'running') return;
            try {
                const boomOsc = audioCtx.createOscillator();
                const boomGain = audioCtx.createGain();

                boomOsc.type = 'triangle';
                boomOsc.frequency.setValueAtTime(140, audioCtx.currentTime);
                boomOsc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.6);

                boomGain.gain.setValueAtTime(0.6, audioCtx.currentTime);
                boomGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

                boomOsc.connect(boomGain);
                boomGain.connect(masterGainNode);

                const bufferSize = audioCtx.sampleRate * 0.5;
                const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;
                }

                const crunchNoise = audioCtx.createBufferSource();
                crunchNoise.buffer = noiseBuffer;

                const crunchFilter = audioCtx.createBiquadFilter();
                crunchFilter.type = 'highpass';
                crunchFilter.frequency.setValueAtTime(800, audioCtx.currentTime);

                const crunchGain = audioCtx.createGain();
                crunchGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
                crunchGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

                crunchNoise.connect(crunchFilter);
                crunchFilter.connect(crunchGain);
                crunchGain.connect(masterGainNode);

                boomOsc.start();
                crunchNoise.start();
                boomOsc.stop(audioCtx.currentTime + 0.6);
                crunchNoise.stop(audioCtx.currentTime + 0.4);
            } catch (e) { }
        }

        // --- THREE.JS ENGINE SETUP ---
        const container = document.getElementById('game-container');
        const scoreDisplay = document.getElementById('scoreDisplay');
        const speedDisplay = document.getElementById('speedDisplay');
        const speedPhaseEl = document.getElementById('speed-phase');
        const signalAlert = document.getElementById('signal-alert');
        const signalAlertState = document.getElementById('signal-alert-state');
        const signalAlertDistance = document.getElementById('signal-alert-distance');
        const screenOverlay = document.getElementById('screen-overlay');
        const mainMenuModal = document.getElementById('mainMenuModal');
        const settingsModal = document.getElementById('settingsModal');
        const screenTitle = document.getElementById('screenTitle');
        const screenText = document.getElementById('screenText');
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const menuSettingsBtn = document.getElementById('menuSettingsBtn');
        const backToMenuBtn = document.getElementById('backToMenuBtn');
        const leaderboardBtn = document.getElementById('leaderboardBtn');
        const menuLeaderboardBtn = document.getElementById('menuLeaderboardBtn');
        const leaderboardModal = document.getElementById('leaderboardModal');
        const closeLeaderboardBtn = document.getElementById('closeLeaderboardBtn');
        const playerInputContainer = document.getElementById('player-input-container');
        const playerNameInput = document.getElementById('playerNameInput');
        const submitScoreBtn = document.getElementById('submitScoreBtn');
        const submitMessage = document.getElementById('submitMessage');
        const leaderboardLoading = document.getElementById('leaderboardLoading');
        const leaderboardTable = document.getElementById('leaderboardTable');
        const leaderboardTbody = document.getElementById('leaderboardTbody');
        const pilotNameModal = document.getElementById('pilot-name-modal');
        const pilotNameInput = document.getElementById('pilot-name-input');
        const pilotNameError = document.getElementById('pilot-name-error');
        const pilotNameConfirm = document.getElementById('pilot-name-confirm');
        const pilotCallsign = document.getElementById('pilot-callsign');

        if (playerNameInput) {
            playerNameInput.value = sessionStorage.getItem('cyber_player_name') || '';
        }

        function getPilotName() {
            return (sessionStorage.getItem('cyber_player_name') || '').trim();
        }

        function updatePilotNameDisplay() {
            if (pilotCallsign) pilotCallsign.textContent = getPilotName() || 'UNIDENTIFIED';
        }

        function requestPilotName() {
            if (getPilotName()) return;
            pilotNameModal.classList.remove('hidden');
            screenOverlay.classList.add('hidden');
            pilotNameInput.focus();
        }

        function savePilotName() {
            const name = pilotNameInput.value.replace(/\s+/g, ' ').trim();
            if (name.length < 2) {
                pilotNameError.textContent = 'Enter at least 2 characters.';
                pilotNameInput.focus();
                return;
            }
            sessionStorage.setItem('cyber_player_name', name.slice(0, 16));
            if (playerNameInput) playerNameInput.value = name.slice(0, 16);
            updatePilotNameDisplay();
            pilotNameModal.classList.add('hidden');
            screenOverlay.classList.remove('hidden');
            mainMenuModal.classList.remove('hidden');
        }
        const quitGameBtn = document.getElementById('quitGameBtn');
        const touchControlsEl = document.getElementById('touch-controls');
        const toggleTouch = document.getElementById('toggleTouch');
        const btnSizeSlider = document.getElementById('btnSizeSlider');
        const btnBottomSlider = document.getElementById('btnBottomSlider');

        let scene, camera, renderer;
        let playerCar, playerBox, exhaustFlamesGroup;
        let selectedVehicleType = 'car';

        // --- FIRST PERSON VIEW (FPV) & COCKPIT CONTROLLER ---
        let isFirstPersonView = false;
        let steerAngleSmoothed = 0;
        const movingBridgeVehicles = [];

        function toggleFirstPersonView() {
            isFirstPersonView = !isFirstPersonView;
            const btn = document.getElementById('fpvToggleBtn');
            const icon = document.getElementById('fpvIcon');
            const label = document.getElementById('fpvLabel');
            const toast = document.getElementById('fpv-toast-notify');
            const toastIcon = document.getElementById('fpv-toast-icon');
            const toastText = document.getElementById('fpv-toast-text');

            if (btn) {
                if (isFirstPersonView) {
                    btn.classList.add('fpv-active');
                    if (icon) icon.innerText = selectedVehicleType === 'bike' ? '🏍️' : '🏎️';
                    if (label) label.innerText = '3RD PERSON';
                } else {
                    btn.classList.remove('fpv-active');
                    if (icon) icon.innerText = '👁️';
                    if (label) label.innerText = '1ST PERSON';
                }
            }

            if (toast) {
                if (toastIcon) toastIcon.innerText = isFirstPersonView ? (selectedVehicleType === 'bike' ? '🏍️' : '🏎️') : '👁️';
                if (toastText) toastText.innerText = isFirstPersonView ? (selectedVehicleType === 'bike' ? '1ST PERSON BIKE COCKPIT' : '1ST PERSON DRIVER COCKPIT') : '3RD PERSON CHASE CAMERA';
                toast.classList.add('visible');
                clearTimeout(toast.userDataTimeout);
                toast.userDataTimeout = setTimeout(() => {
                    toast.classList.remove('visible');
                }, 1800);
            }

            try {
                if (audioCtx && audioCtx.state === 'running') {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.frequency.setValueAtTime(isFirstPersonView ? 880 : 440, audioCtx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(isFirstPersonView ? 1320 : 660, audioCtx.currentTime + 0.08);
                    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.1);
                }
            } catch (e) { }
        }

        let trafficCars = [];
        let crossTrafficCars = [];
        let roadSegments = [];
        let junctions = [];
        let signalSections = [];
        let streetLights = [];
        let roadBridges = [];
        let roadTrees = [];
        let pedestrians = [];
        let junctionPedestrians = [];
        let sideBuildings = [];

        let smokeParticles = [];
        let crashParticles = [];
        let isCrashing = false;
        let crashTimer = 0;
        const crashDuration = 1.35;
        let crashVelocity = { x: 0, y: 0, z: 0 };
        let crashAngularVel = { x: 0, y: 0, z: 0 };
        let crashShakeIntensity = 0;
        let opponentCrashing = false;
        let oppCrashTimer = 0;
        let oppCrashVelocity = { x: 0, y: 0, z: 0 };
        let oppCrashAngularVel = { x: 0, y: 0, z: 0 };

        let sunMesh, moonMesh;
        let rainParticles, rainGeo;
        let ambientLight, sunLight, lightningLight;
        let weatherMode = 0;
        let weatherTimer = 0;
        let lightningTimer = 0;

        let trafficLightState = 'GREEN';
        let trafficLightTimer = 0;
        const trafficLightDurations = { GREEN: 7, YELLOW: 2, RED: 6 };

        let targetBgColor = new THREE.Color(0x87ceeb);
        let targetFogColor = new THREE.Color(0x87ceeb);
        let targetAmbColor = new THREE.Color(0xffffff);
        let targetAmbIntensity = 1.2;
        let targetSunColor = new THREE.Color(0xfffaed);
        let targetSunIntensity = 1.2;

        let isGameRunning = false;
        let isPaused = false;
        let animFrameId = null;
        let gameTime = 0;
        let score = 0;
        let offlineScoreSubmitted = false;
        let baseSpeed = 0.28;
        let currentSpeed = 0.28;

        let isSuperBoostActive = false;
        let hornTrafficFreezeTimer = 0;
        let lastAlertState = '';
        let lastAlertJunction = null;

        const pressedKeys = {};
        const roadWidth = 16;
        const mainRoadVehicleLimit = roadWidth / 2 - 1.35;
        const crossRoadVehicleLimit = 50 - 2.0;
        const laneXPositions = [-5, 0, 5];
        const totalSegments = 6;
        const segmentLength = 100;
        const vehicleLength = 4;
        const requiredVehicleGap = 4;
        const minimumVehicleCenterDistance = vehicleLength + requiredVehicleGap;
        const signalOffset = 12;
        const signalStopDistance = 10;
        const junctionLineOffset = signalOffset + signalStopDistance;
        const vehicleStopCenterOffset = junctionLineOffset + vehicleLength / 2;

        function init() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x87ceeb);
            scene.fog = new THREE.Fog(0x87ceeb, 80, 600);

            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 3.8, 8.5);
            camera.rotation.set(-0.22, 0, 0);

            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.2;
            container.appendChild(renderer.domElement);

            ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
            scene.add(ambientLight);

            sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
            sunLight.position.set(0, 60, -50);
            sunLight.castShadow = true;
            scene.add(sunLight);

            lightningLight = new THREE.DirectionalLight(0xffffff, 0);
            lightningLight.position.set(0, 100, 0);
            scene.add(lightningLight);

            createCelestialBodies();
            createRainSystem();
            createRoadNetwork();
            createEnvironmentElements();

            // Spawn player vehicle with initial cyber cyan (0x00f0ff) matching active UI swatch
            playerCustomColor = 0x00f0ff;
            selectedVehicleType = 'car';
            spawnSelectedPlayerVehicle(0x00f0ff);

            playerBox = new THREE.Box3();

            setWeatherEnvironment(Math.floor(Math.random() * 2));

            window.addEventListener('resize', onWindowResize);
            document.addEventListener('fullscreenchange', onWindowResize);
            document.addEventListener('webkitfullscreenchange', onWindowResize);
            setupTouchListeners();
            setupMenuListeners();
            pilotNameConfirm.addEventListener('click', savePilotName);
            pilotNameInput.addEventListener('keydown', event => {
                if (event.key === 'Enter') savePilotName();
            });
            requestPilotName();
            updatePilotNameDisplay();

            const enableAudioOnUserAction = () => {
                initAudio();
                if (!isGameRunning && !lobbyTimer) {
                    startLobbyMusic();
                }
            };

            screenOverlay.addEventListener('click', enableAudioOnUserAction);
            document.body.addEventListener('keydown', enableAudioOnUserAction);
        }

        // --- SILENCER EXHAUST SMOKE SYSTEM ---
        function emitSmokeParticle(x, y, z, isBoost = false, isHeavyTruck = false) {
            if (smokeParticles.length >= 450) {
                const oldest = smokeParticles.shift();
                scene.remove(oldest.mesh);
                oldest.mesh.geometry.dispose();
                oldest.mesh.material.dispose();
            }

            const smokeGeo = new THREE.SphereGeometry(isBoost ? 0.38 : (isHeavyTruck ? 0.3 : 0.18), 10, 10);
            const smokeMat = new THREE.MeshBasicMaterial({
                color: isBoost ? 0x00f0ff : (isHeavyTruck ? 0x222222 : 0xb8b8b8),
                transparent: true,
                opacity: isHeavyTruck ? 0.7 : 0.45
            });

            const p = new THREE.Mesh(smokeGeo, smokeMat);
            p.position.set(x + (Math.random() - 0.5) * 0.15, y, z);
            scene.add(p);

            smokeParticles.push({
                mesh: p,
                life: 1.2,
                scaleSpeed: isBoost ? 2.8 : 1.5,
                driftX: (Math.random() - 0.5) * 0.4,
                riseSpeed: 0.6 + Math.random() * 0.7
            });
        }

        function updateSmokeParticles(delta, moveDist) {
            for (let i = smokeParticles.length - 1; i >= 0; i--) {
                const sp = smokeParticles[i];
                sp.life -= delta * 1.4;
                sp.mesh.position.z += moveDist + delta * 7.5;
                sp.mesh.position.y += delta * sp.riseSpeed;
                sp.mesh.position.x += delta * sp.driftX;
                sp.mesh.scale.addScalar(delta * sp.scaleSpeed);
                sp.mesh.material.opacity = sp.life * 0.38;

                if (sp.life <= 0) {
                    scene.remove(sp.mesh);
                    sp.mesh.geometry.dispose();
                    sp.mesh.material.dispose();
                    smokeParticles.splice(i, 1);
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // ██████████████  EXPLOSIVE CRASH & DEBRIS SYSTEM  ██████████████
        // ═══════════════════════════════════════════════════════════════════
        function spawnCrashExplosion(position, count = 80) {
            const sparkMatOptions = [
                new THREE.MeshBasicMaterial({ color: 0xff2200 }),
                new THREE.MeshBasicMaterial({ color: 0xff7700 }),
                new THREE.MeshBasicMaterial({ color: 0xffea00 }),
                new THREE.MeshBasicMaterial({ color: 0x00f0ff }),
                new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.9, roughness: 0.2 })
            ];

            const sparkGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
            const fireballGeo = new THREE.SphereGeometry(0.50, 8, 8);

            for (let i = 0; i < count; i++) {
                const isFireball = i < 20;
                const mat = isFireball
                    ? new THREE.MeshBasicMaterial({ color: (i % 2 === 0 ? 0xff4400 : 0xffbb00), transparent: true, opacity: 0.95 })
                    : sparkMatOptions[Math.floor(Math.random() * sparkMatOptions.length)];

                const mesh = new THREE.Mesh(isFireball ? fireballGeo : sparkGeo, mat);
                mesh.position.copy(position);
                mesh.position.x += (Math.random() - 0.5) * 1.4;
                mesh.position.y += Math.random() * 0.9 + 0.2;
                mesh.position.z += (Math.random() - 0.5) * 1.4;

                const speed = isFireball ? (8 + Math.random() * 12) : (16 + Math.random() * 24);
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI * 0.42;

                const vx = Math.sin(phi) * Math.cos(theta) * speed;
                const vy = Math.cos(phi) * speed + (isFireball ? 4 : 2);
                const vz = Math.sin(phi) * Math.sin(theta) * speed;

                mesh.castShadow = true;
                scene.add(mesh);

                crashParticles.push({
                    mesh,
                    vx, vy, vz,
                    rotX: (Math.random() - 0.5) * 20,
                    rotY: (Math.random() - 0.5) * 20,
                    rotZ: (Math.random() - 0.5) * 20,
                    isFireball,
                    life: 1.0,
                    maxLife: 0.85 + Math.random() * 0.6
                });
            }

            // Expanding Fiery Shockwave Ring on road pavement
            const shockRingGeo = new THREE.RingGeometry(0.5, 1.4, 32);
            const shockRingMat = new THREE.MeshBasicMaterial({ color: 0xff5500, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
            const shockRing = new THREE.Mesh(shockRingGeo, shockRingMat);
            shockRing.rotation.x = -Math.PI / 2;
            shockRing.position.set(position.x, 0.12, position.z);
            scene.add(shockRing);

            crashParticles.push({
                mesh: shockRing,
                vx: 0, vy: 0, vz: 0,
                rotX: 0, rotY: 0, rotZ: 0,
                isRing: true,
                scaleSpeed: 28,
                life: 1.0,
                maxLife: 0.7
            });
        }

        function updateCrashParticles(delta) {
            for (let i = crashParticles.length - 1; i >= 0; i--) {
                const p = crashParticles[i];
                p.life -= delta / p.maxLife;

                if (p.isRing) {
                    p.mesh.scale.addScalar(delta * p.scaleSpeed);
                    p.mesh.material.opacity = Math.max(0, p.life * 0.9);
                } else {
                    p.vy -= 28 * delta; // Heavy Gravity
                    p.mesh.position.x += p.vx * delta;
                    p.mesh.position.y += p.vy * delta;
                    p.mesh.position.z += p.vz * delta;

                    // Road bounce
                    if (p.mesh.position.y < 0.12) {
                        p.mesh.position.y = 0.12;
                        p.vy = -p.vy * 0.38;
                        p.vx *= 0.65;
                        p.vz *= 0.65;
                    }

                    p.mesh.rotation.x += p.rotX * delta;
                    p.mesh.rotation.y += p.rotY * delta;
                    p.mesh.rotation.z += p.rotZ * delta;

                    if (p.isFireball) {
                        p.mesh.scale.addScalar(delta * 2.8);
                        p.mesh.material.opacity = Math.max(0, p.life * 0.95);
                    }
                }

                if (p.life <= 0) {
                    scene.remove(p.mesh);
                    if (p.mesh.geometry) p.mesh.geometry.dispose();
                    if (p.mesh.material) p.mesh.material.dispose();
                    crashParticles.splice(i, 1);
                }
            }
        }

        function triggerPlayerCrash() {
            if (isCrashing || !isGameRunning) return;
            isCrashing = true;
            crashTimer = crashDuration;
            crashShakeIntensity = 1.8;

            stopEngineSound();
            stopRainSound();
            playCrashSound();
            if (exhaustFlamesGroup) exhaustFlamesGroup.visible = false;

            if (navigator.vibrate) {
                try { navigator.vibrate([150, 80, 280]); } catch (e) { }
            }

            const flashEl = document.getElementById('crash-flash-overlay');
            if (flashEl) {
                flashEl.classList.remove('active');
                void flashEl.offsetWidth;
                flashEl.classList.add('active');
            }

            if (playerCar) {
                spawnCrashExplosion(playerCar.position, 85);
                const forwardImpulse = Math.max(currentSpeed * 45, 18);
                crashVelocity = {
                    x: (Math.random() - 0.5) * 16,
                    y: 11 + Math.random() * 4,
                    z: (Math.random() - 0.5) * 8 - forwardImpulse * 0.35
                };
                crashAngularVel = {
                    x: (Math.random() > 0.5 ? 1 : -1) * (14 + Math.random() * 10),
                    y: (Math.random() - 0.5) * 16,
                    z: (Math.random() > 0.5 ? 1 : -1) * (16 + Math.random() * 10)
                };
            }

            // Multiplayer: send opponent_crashed packet immediately
            if (window.isMultiplayerMode && window.conn && window.conn.open) {
                try {
                    window.conn.send({
                        type: 'opponent_crashed',
                        score: Math.floor(score)
                    });
                } catch (e) { }
            }
        }

        function triggerOpponentCrash() {
            opponentCrashing = true;
            oppCrashTimer = crashDuration;
            if (opponentCar) {
                spawnCrashExplosion(opponentCar.position, 85);
                playCrashSound();
                oppCrashVelocity = {
                    x: (Math.random() - 0.5) * 16,
                    y: 10 + Math.random() * 4,
                    z: (Math.random() - 0.5) * 10
                };
                oppCrashAngularVel = {
                    x: (Math.random() - 0.5) * 16,
                    y: (Math.random() - 0.5) * 14,
                    z: (Math.random() - 0.5) * 16
                };
            }
        }

        function finalizeGameOver() {
            isGameRunning = false;
            isCrashing = false;
            clearPressedKeys();

            if (window.isMultiplayerMode) {
                const myFinalScore = Math.floor(score);
                setTimeout(() => {
                    window.showMpResult('loser', myFinalScore, window.oppNetScore || 0);
                }, 100);
                return;
            }

            submitOfflineScore(Math.floor(score));

            setTimeout(() => {
                startLobbyMusic();
            }, 400);

            mainMenuModal.classList.add('hidden');
            if (pauseCrashModal) {
                pauseCrashModal.classList.remove('hidden');
                pauseCrashModal.classList.add('crashed');
                pauseCrashTitle.innerText = "CRASH DETECTED!";
                pauseCrashText.innerHTML = `Survival Time: <strong>${Math.floor(gameTime)}s</strong><br>Final Score: <strong>${Math.floor(score)}</strong>`;
                pauseResumeBtn.innerText = "PLAY AGAIN";
            }
            settingsModal.classList.add('hidden');
            screenOverlay.classList.remove('hidden');
        }

        
        let sunGlowMesh = null;
        let sunRaysMesh = null;
        let moonGlowMesh = null;
        let starFieldMesh = null;

        function createCelestialBodies() {
            // Realistic Sun with glowing corona & radiant solar flares
            const sunGeo = new THREE.SphereGeometry(18, 32, 32);
            const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff0aa });
            sunMesh = new THREE.Mesh(sunGeo, sunMat);
            sunMesh.material.fog = false;

            // Multi-layered solar corona halo
            const glowGeo = new THREE.SphereGeometry(28, 32, 32);
            const glowMat = new THREE.MeshBasicMaterial({
                color: 0xffaa22,
                transparent: true,
                opacity: 0.38,
                side: THREE.BackSide,
                blending: THREE.AdditiveBlending
            });
            sunGlowMesh = new THREE.Mesh(glowGeo, glowMat);
            sunGlowMesh.material.fog = false;
            sunMesh.add(sunGlowMesh);

            // Solar ray flare ring
            const raysGeo = new THREE.RingGeometry(18, 42, 36);
            const raysMat = new THREE.MeshBasicMaterial({
                color: 0xffdd66,
                transparent: true,
                opacity: 0.25,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            });
            sunRaysMesh = new THREE.Mesh(raysGeo, raysMat);
            sunRaysMesh.material.fog = false;
            sunMesh.add(sunRaysMesh);

            scene.add(sunMesh);

            // Realistic Moon with crater texture canvas
            const moonGeo = new THREE.SphereGeometry(15, 32, 32);
            const moonCanvas = document.createElement('canvas');
            moonCanvas.width = 256;
            moonCanvas.height = 256;
            const mCtx = moonCanvas.getContext('2d');
            mCtx.fillStyle = '#d8e4ec';
            mCtx.fillRect(0, 0, 256, 256);
            // Paint lunar maria & craters
            mCtx.fillStyle = '#9cb1c2';
            const craters = [
                {x: 80, y: 70, r: 35}, {x: 170, y: 90, r: 45}, {x: 110, y: 160, r: 50},
                {x: 180, y: 180, r: 30}, {x: 60, y: 130, r: 25}, {x: 140, y: 120, r: 20}
            ];
            craters.forEach(c => {
                mCtx.beginPath();
                mCtx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                mCtx.fill();
            });
            const moonTex = new THREE.CanvasTexture(moonCanvas);
            const moonMat = new THREE.MeshBasicMaterial({ map: moonTex });
            moonMesh = new THREE.Mesh(moonGeo, moonMat);
            moonMesh.material.fog = false;

            // Soft cyan-silver atmospheric lunar halo
            const mGlowGeo = new THREE.SphereGeometry(22, 32, 32);
            const mGlowMat = new THREE.MeshBasicMaterial({
                color: 0x66aacc,
                transparent: true,
                opacity: 0.28,
                side: THREE.BackSide,
                blending: THREE.AdditiveBlending
            });
            moonGlowMesh = new THREE.Mesh(mGlowGeo, mGlowMat);
            moonGlowMesh.material.fog = false;
            moonMesh.add(moonGlowMesh);

            scene.add(moonMesh);

            // Night sky starry starfield
            const starCount = 350;
            const starGeo = new THREE.BufferGeometry();
            const starPositions = new Float32Array(starCount * 3);
            for (let i = 0; i < starCount; i++) {
                starPositions[i * 3] = (Math.random() - 0.5) * 800;
                starPositions[i * 3 + 1] = 60 + Math.random() * 260;
                starPositions[i * 3 + 2] = -150 - Math.random() * 550;
            }
            starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
            const starMat = new THREE.PointsMaterial({
                color: 0xffffff,
                size: 2.2,
                transparent: true,
                opacity: 0.85
            });
            starFieldMesh = new THREE.Points(starGeo, starMat);
            starFieldMesh.visible = false;
            scene.add(starFieldMesh);
        }

        function updateCelestialPositions() {
            if (sunMesh && moonMesh && playerCar) {
                const carZ = playerCar.position.z;
                sunMesh.position.set(0, 160, carZ - 380);
                moonMesh.position.set(0, 160, carZ - 380);
                if (sunRaysMesh) sunRaysMesh.rotation.z += 0.0015;
                if (starFieldMesh) starFieldMesh.position.z = carZ;
            }
        }

        function setWeatherEnvironment(mode) {
            weatherMode = mode;

            const modes = [
                { name: "MORNING", bg: 0x87ceeb, fog: 0x87ceeb, amb: 0xffffff, ambInt: 1.2, sun: 0xfffaed, sunInt: 1.2, rain: false, isNight: false },
                { name: "NIGHT", bg: 0x050512, fog: 0x050512, amb: 0x223355, ambInt: 0.8, sun: 0x4080ff, sunInt: 0.5, rain: false, isNight: true }
            ];

            const current = modes[weatherMode % modes.length];

            targetBgColor.setHex(current.bg);
            targetFogColor.setHex(current.fog);
            targetAmbColor.setHex(current.amb);
            targetAmbIntensity = current.ambInt;
            targetSunColor.setHex(current.sun);
            targetSunIntensity = current.sunInt;

            rainParticles.visible = current.rain;

            if (current.rain) {
                startRainSound();
            } else {
                stopRainSound();
            }

            streetLights.forEach(lightGroup => {
                const fixtureMesh = lightGroup.children[2];
                const streetLightPoint = lightGroup.children[3];
                if (current.isNight) {
                    streetLightPoint.intensity = 4.5;
                    fixtureMesh.material.color.setHex(0xffff00);
                } else {
                    streetLightPoint.intensity = 0.0;
                    fixtureMesh.material.color.setHex(0x444444);
                }
            });

            if (current.isNight) {
                sunMesh.visible = false;
                moonMesh.visible = true;
            } else {
                sunMesh.visible = true;
                moonMesh.visible = false;
            }

            roadSegments.forEach(seg => {
                seg.children[0].material.roughness = current.rain ? 0.15 : 0.6;
            });
        }

        function updateEnvironmentBlending(delta) {
            scene.background.lerp(targetBgColor, delta * 1.5);
            scene.fog.color.lerp(targetFogColor, delta * 1.5);

            ambientLight.color.lerp(targetAmbColor, delta * 1.5);
            ambientLight.intensity = THREE.MathUtils.lerp(ambientLight.intensity, targetAmbIntensity, delta * 1.5);

            sunLight.color.lerp(targetSunColor, delta * 1.5);
            sunLight.intensity = THREE.MathUtils.lerp(sunLight.intensity, targetSunIntensity, delta * 1.5);
        }

        function createRainSystem() {
            const count = 3000;
            rainGeo = new THREE.BufferGeometry();
            const positions = new Float32Array(count * 3);

            for (let i = 0; i < count * 3; i += 3) {
                positions[i] = (Math.random() - 0.5) * 60;
                positions[i + 1] = Math.random() * 40;
                positions[i + 2] = (Math.random() - 0.5) * 200;
            }

            rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const rainMat = new THREE.PointsMaterial({
                color: 0xaaaaaa,
                size: 0.15,
                transparent: true,
                opacity: 0.6
            });

            rainParticles = new THREE.Points(rainGeo, rainMat);
            scene.add(rainParticles);
            rainParticles.visible = false;
        }

        function updateRainAndLightning(delta) {
            if (!rainParticles.visible) return;

            const pos = rainGeo.attributes.position.array;
            for (let i = 1; i < pos.length; i += 3) {
                pos[i] -= delta * 60;
                if (pos[i] < 0) pos[i] = 40;
            }
            rainGeo.attributes.position.needsUpdate = true;

            lightningTimer -= delta;
            if (lightningTimer <= 0) {
                if (Math.random() < 0.2) {
                    lightningLight.intensity = 4.0;
                    playThunderSound();
                    setTimeout(() => { lightningLight.intensity = 0; }, 120);
                }
                lightningTimer = 4 + Math.random() * 8;
            }
        }

        // --- DETAILED VEHICLE & BUILDERS WITH SINGLE RIGHT SILENCER ---
        function addVehicleTaillights(group, width = 1.8, height = 0.6) {
            const lightGeo = new THREE.BoxGeometry(0.35, 0.12, 0.1);
            const tailMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });

            const leftTL = new THREE.Mesh(lightGeo, tailMat);
            leftTL.position.set(-width / 2.5, height, 2.11);

            const rightTL = new THREE.Mesh(lightGeo, tailMat);
            rightTL.position.set(width / 2.5, height, 2.11);

            group.add(leftTL, rightTL);
        }

        function addSingleSilencer(carGroup, zOffset = 2.11, xOffset = 0.5) {
            const silencerGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.35, 12);
            silencerGeo.rotateX(Math.PI / 2);
            const silencerMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 });

            const rightPipe = new THREE.Mesh(silencerGeo, silencerMat);
            rightPipe.position.set(xOffset, 0.32, zOffset);

            carGroup.add(rightPipe);
        }

        function addWheelsAndDetails(carGroup, isPlayer = false, wheelRadius = 0.38) {
            const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.35, 24);
            const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.1 });
            wheelGeo.rotateZ(Math.PI / 2);

            const wheelPositions = [
                [-1.05, wheelRadius, 1.3],
                [1.05, wheelRadius, 1.3],
                [-1.05, wheelRadius, -1.3],
                [1.05, wheelRadius, -1.3]
            ];

            wheelPositions.forEach(pos => {
                const wheelGroup = new THREE.Group();
                const tire = new THREE.Mesh(wheelGeo, wheelMat);
                const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.55, wheelRadius * 0.55, 0.38, 12), rimMat);
                rim.rotation.z = Math.PI / 2;
                wheelGroup.add(tire, rim);
                wheelGroup.position.set(...pos);
                carGroup.add(wheelGroup);
            });

            addVehicleTaillights(carGroup, 1.8, 0.65);
            addSingleSilencer(carGroup, 2.11, 0.5);

            if (isPlayer) {
                const neonLight = new THREE.PointLight(0x00f0ff, 4, 12);
                neonLight.position.set(0, 0.2, 0);
                carGroup.add(neonLight);

                exhaustFlamesGroup = new THREE.Group();
                const thruster = new THREE.Group();
                const coreGeo = new THREE.ConeGeometry(0.18, 1.6, 16);
                coreGeo.rotateX(Math.PI / 2);
                const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
                const core = new THREE.Mesh(coreGeo, coreMat);

                const auraGeo = new THREE.ConeGeometry(0.35, 2.2, 16);
                auraGeo.rotateX(Math.PI / 2);
                const auraMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.75 });
                const aura = new THREE.Mesh(auraGeo, auraMat);

                thruster.add(aura, core);
                thruster.position.set(0.5, 0.32, 2.3);
                exhaustFlamesGroup.add(thruster);
                exhaustFlamesGroup.visible = false;
                carGroup.add(exhaustFlamesGroup);
            }
        }

        function createRealisticCar(colorHex, isPlayer = false) {
            const group = new THREE.Group();

            // ── Materials ──────────────────────────────────────────────
            const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.12, metalness: 0.90 });
            const carbonMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.25, metalness: 0.80 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1a2e, roughness: 0.05, metalness: 0.95, transparent: true, opacity: 0.82 });
            const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.08, metalness: 0.98 });
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.90, metalness: 0.05 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.10, metalness: 0.95 });
            const discMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.30, metalness: 0.85 });
            const glowMat = new THREE.MeshBasicMaterial({ color: isPlayer ? 0x00f0ff : 0xff3300 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.4, metalness: 0.6 });

            // ── Main low-slung body (flat GT profile) ──────────────────
            const mainBody = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.38, 4.2), bodyMat);
            mainBody.position.set(0, 0.42, 0);
            mainBody.castShadow = true;
            group.add(mainBody);

            // Raised center spine (engine cover ridge)
            const spine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 3.0), bodyMat);
            spine.position.set(0, 0.65, -0.1);
            group.add(spine);

            // ── Sidepods (left & right aerodynamic housings) ───────────
            [-1.12, 1.12].forEach(x => {
                const pod = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 2.4), bodyMat);
                pod.position.set(x, 0.52, 0.2);
                group.add(pod);

                // Pod intake vent (darker opening)
                const intake = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.1), carbonMat);
                intake.position.set(x, 0.52, -0.95);
                group.add(intake);
            });

            // ── Cockpit / cabin (low racing canopy) ───────────────────
            const cockpitBase = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.28, 1.6), bodyMat);
            cockpitBase.position.set(0, 0.72, -0.18);
            group.add(cockpitBase);

            const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.32, 0.06), glassMat);
            windscreen.position.set(0, 0.82, -1.0);
            windscreen.rotation.x = -0.55;
            group.add(windscreen);

            const sideglass_L = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 1.1), glassMat);
            sideglass_L.position.set(-0.56, 0.76, -0.18);
            const sideglass_R = sideglass_L.clone();
            sideglass_R.position.x = 0.56;
            group.add(sideglass_L, sideglass_R);

            const rollHoop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.1), carbonMat);
            rollHoop.position.set(0, 0.88, 0.42);
            group.add(rollHoop);

            // ── Hood with sculpted vents ───────────────────────────────
            const hood = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.10, 1.45), bodyMat);
            hood.position.set(0, 0.62, -1.38);
            group.add(hood);

            // Hood vents (2 narrow slits)
            [-0.28, 0.28].forEach(x => {
                const vent = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.55), carbonMat);
                vent.position.set(x, 0.68, -1.3);
                group.add(vent);
            });

            // ── Front bumper & splitter ───────────────────────────────
            const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 0.28), carbonMat);
            frontBumper.position.set(0, 0.32, -2.15);
            group.add(frontBumper);

            const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.45), carbonMat);
            splitter.position.set(0, 0.16, -2.28);
            group.add(splitter);

            // Front canards (small dive planes)
            [-0.88, 0.88].forEach(x => {
                const canard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.32), carbonMat);
                canard.position.set(x, 0.22, -2.08);
                canard.rotation.z = x > 0 ? -0.18 : 0.18;
                group.add(canard);
            });

            // Racing headlights (thin LED strips)
            [-0.72, 0.72].forEach(x => {
                const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                hl.position.set(x, 0.44, -2.12);
                group.add(hl);
                const hlAccent = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.08), glowMat);
                hlAccent.position.set(x, 0.35, -2.12);
                group.add(hlAccent);
            });

            // ── Rear section ──────────────────────────────────────────
            const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.28, 0.28), carbonMat);
            rearBumper.position.set(0, 0.36, 2.16);
            group.add(rearBumper);

            // Rear diffuser (angled fins)
            const diffuserBase = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.55), carbonMat);
            diffuserBase.position.set(0, 0.14, 2.1);
            diffuserBase.rotation.x = 0.3;
            group.add(diffuserBase);

            for (let i = -3; i <= 3; i++) {
                const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.5), darkMat);
                fin.position.set(i * 0.24, 0.2, 2.12);
                fin.rotation.x = 0.3;
                group.add(fin);
            }

            // Brake lights (wide LED bar)
            const brakeBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
            brakeBar.position.set(0, 0.48, 2.18);
            group.add(brakeBar);

            // ── Rear wing ──────────────────────────────────────────────
            const wingPlane = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.55), carbonMat);
            wingPlane.position.set(0, 1.28, 1.72);
            wingPlane.rotation.x = -0.18;
            group.add(wingPlane);

            // Wing endplates
            [-1.06, 1.06].forEach(x => {
                const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.62), carbonMat);
                endplate.position.set(x, 1.2, 1.72);
                group.add(endplate);
            });

            // Wing pillars
            [-0.55, 0.55].forEach(x => {
                const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), carbonMat);
                pillar.position.set(x, 1.0, 1.72);
                group.add(pillar);
            });

            // DRS secondary element (smaller wing above main)
            const drs = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.05, 0.35), bodyMat);
            drs.position.set(0, 1.38, 1.68);
            drs.rotation.x = -0.12;
            group.add(drs);

            // ── Racing Wheels (4 wide, with detailed rims & discs) ─────
            const wheelR = 0.40;
            const wheelW = 0.32;
            const wheelPositions = [
                { x: -1.12, z: -1.38 },
                { x: 1.12, z: -1.38 },
                { x: -1.12, z: 1.38 },
                { x: 1.12, z: 1.38 },
            ];

            wheelPositions.forEach(({ x, z }) => {
                const wGroup = new THREE.Group();

                // Tire
                const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 28);
                tireGeo.rotateZ(Math.PI / 2);
                const tire = new THREE.Mesh(tireGeo, tireMat);
                tire.castShadow = true;
                wGroup.add(tire);

                // Rim face
                const rimFaceGeo = new THREE.CylinderGeometry(wheelR * 0.70, wheelR * 0.70, wheelW * 0.28, 20);
                rimFaceGeo.rotateZ(Math.PI / 2);
                const rimFace = new THREE.Mesh(rimFaceGeo, rimMat);
                rimFace.position.x = x > 0 ? -wheelW * 0.38 : wheelW * 0.38;
                wGroup.add(rimFace);

                // Spokes (5 spokes)
                for (let s = 0; s < 5; s++) {
                    const angle = (s / 5) * Math.PI * 2;
                    const spoke = new THREE.Mesh(
                        new THREE.BoxGeometry(wheelR * 0.85, wheelW * 0.22, wheelR * 0.14),
                        rimMat
                    );
                    spoke.rotation.set(0, 0, angle);
                    spoke.position.x = rimFace.position.x;
                    wGroup.add(spoke);
                }

                // Brake disc
                const discGeo = new THREE.CylinderGeometry(wheelR * 0.58, wheelR * 0.58, 0.04, 20);
                discGeo.rotateZ(Math.PI / 2);
                const disc = new THREE.Mesh(discGeo, discMat);
                disc.position.x = x > 0 ? -wheelW * 0.52 : wheelW * 0.52;
                wGroup.add(disc);

                // Brake caliper (small red block)
                const caliper = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, wheelR * 0.35, 0.16),
                    new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.3, metalness: 0.7 })
                );
                caliper.position.set(x > 0 ? -wheelW * 0.52 : wheelW * 0.52, -wheelR * 0.45, 0);
                wGroup.add(caliper);

                wGroup.position.set(x, wheelR, z);
                group.add(wGroup);
            });

            // ── Exhausts (twin center-exit, F1-style) ─────────────────
            [-0.14, 0.14].forEach(x => {
                const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.6, 12), chromeMat);
                pipe.rotation.x = Math.PI / 2;
                pipe.position.set(x, 0.35, 2.06);
                group.add(pipe);
            });

            // ── Player-only: neon underglow + exhaust flames ──────────
            if (isPlayer) {
                const neonLight = new THREE.PointLight(0x00f0ff, 5, 14);
                neonLight.position.set(0, 0.1, 0);
                group.add(neonLight);

                exhaustFlamesGroup = new THREE.Group();

                // Twin exhaust flame cones
                [-0.14, 0.14].forEach(x => {
                    const coreGeo = new THREE.ConeGeometry(0.06, 0.85, 12);
                    coreGeo.rotateX(Math.PI / 2);
                    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
                    core.position.set(x, 0.35, 2.55);

                    const auraGeo = new THREE.ConeGeometry(0.13, 1.3, 12);
                    auraGeo.rotateX(Math.PI / 2);
                    const aura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 }));
                    aura.position.set(x, 0.35, 2.65);

                    exhaustFlamesGroup.add(core, aura);
                });

                exhaustFlamesGroup.visible = false;
                group.add(exhaustFlamesGroup);
            }

            
            // ── DRIVER COCKPIT & LIVE STEERING WHEEL FOR FPV ─────────
            if (isPlayer) {
                const leatherMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.85 });
                const alcantaraMat = new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.9 });
                const gloveMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.5, metalness: 0.3 });
                const gloveDarkMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.8 });

                // Driver & Passenger Sports Bucket Seats
                [-0.35, 0.35].forEach(x => {
                    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.55), alcantaraMat);
                    seatBase.position.set(x, 0.42, 0.05);
                    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.65, 0.14), leatherMat);
                    seatBack.rotation.x = -0.18;
                    seatBack.position.set(x, 0.72, 0.28);
                    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.12), alcantaraMat);
                    headrest.position.set(x, 1.08, 0.34);
                    group.add(seatBase, seatBack, headrest);
                });

                // Dashboard shelf
                const dashShelf = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.26, 0.65), alcantaraMat);
                dashShelf.position.set(0, 0.76, -0.62);
                group.add(dashShelf);

                // Driver's Glowing Digital Gauge Binnacle
                const dashScreen = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.36, 0.18),
                    new THREE.MeshBasicMaterial({ color: 0x00f0ff })
                );
                dashScreen.position.set(-0.35, 0.85, -0.60);
                dashScreen.rotation.x = -0.22;
                group.add(dashScreen);

                // Center Infotainment / Cyber GPS Screen
                const centerScreen = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.28, 0.22),
                    new THREE.MeshBasicMaterial({ color: 0x004466 })
                );
                centerScreen.position.set(0, 0.82, -0.61);
                centerScreen.rotation.x = -0.22;
                group.add(centerScreen);

                // Rearview Mirror at top of windshield
                const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.04), chromeMat);
                mirror.position.set(0, 1.05, -0.85);
                group.add(mirror);

                // Windshield Wipers parked at bottom edge
                [-0.32, 0.18].forEach(x => {
                    const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.025, 0.03), carbonMat);
                    wiper.position.set(x, 0.82, -0.96);
                    wiper.rotation.z = 0.18;
                    group.add(wiper);
                });

                // ── FULLY ARTICULATED 3D SPORTS STEERING WHEEL WITH GLOVED HANDS ──
                const steeringWheelGroup = new THREE.Group();
                steeringWheelGroup.position.set(-0.35, 0.81, -0.42);
                steeringWheelGroup.rotation.x = -0.38; // angled towards driver's torso

                // Sports Wheel Rim (leather wrap)
                const rimGeo = new THREE.TorusGeometry(0.18, 0.024, 16, 32);
                const wheelRim = new THREE.Mesh(rimGeo, leatherMat);
                steeringWheelGroup.add(wheelRim);

                // 12 O'Clock Racing Alignment Stripe (Cyan marker)
                const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.04, 12), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
                stripe.rotation.z = Math.PI / 2;
                stripe.position.set(0, 0.18, 0);
                steeringWheelGroup.add(stripe);

                // 3 Metallic Spokes
                const spokeH = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.02), chromeMat);
                const spokeV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.02), chromeMat);
                spokeV.position.set(0, -0.08, 0);
                steeringWheelGroup.add(spokeH, spokeV);

                // Center Horn Boss with Cyber Logo
                const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 16), carbonMat);
                hub.rotation.x = Math.PI / 2;
                const hubBadge = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
                hubBadge.position.z = 0.02;
                hub.add(hubBadge);
                steeringWheelGroup.add(hub);

                // Dual Paddle Shifters behind wheel
                [-0.14, 0.14].forEach(x => {
                    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.015), chromeMat);
                    paddle.position.set(x, 0.04, -0.03);
                    steeringWheelGroup.add(paddle);
                });

                // Cyber Racing Gloves Gripping the Wheel (at 9 and 3 o'clock)
                [-0.18, 0.18].forEach((x, i) => {
                    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.09), gloveMat);
                    glove.position.set(x, 0.01, 0.02);
                    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), gloveDarkMat);
                    thumb.position.set(i === 0 ? x + 0.03 : x - 0.03, 0.04, 0.03);
                    steeringWheelGroup.add(glove, thumb);
                });

                group.add(steeringWheelGroup);
                group.userData.steeringWheel = steeringWheelGroup;
            }

            return group;
        }

        function createRealisticBike(colorHex, isPlayer = false) {
            const group = new THREE.Group();

            const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x151821, roughness: 0.3, metalness: 0.85 });
            const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.06, metalness: 0.98 });
            const goldMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.2, metalness: 0.9 });
            const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.12, metalness: 0.88 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1020, roughness: 0.04, metalness: 0.95, transparent: true, opacity: 0.80 });
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.90, metalness: 0.05 });
            const brakeDiscMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.25, metalness: 0.90 });
            const carbonMat = new THREE.MeshStandardMaterial({ color: 0x080c10, roughness: 0.28, metalness: 0.80 });
            const seatMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.95, metalness: 0.0 });

            // ── Frame & Engine ─────────────────────────────────────────
            // Main perimeter frame tubes
            [-0.22, 0.22].forEach(x => {
                const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.55, 12), darkMetalMat);
                tube.rotation.x = -0.14;
                tube.position.set(x, 0.60, -0.05);
                group.add(tube);
            });

            // Engine block
            const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.44, 0.72), darkMetalMat);
            engineBlock.position.set(0, 0.48, 0.05);
            engineBlock.castShadow = true;
            group.add(engineBlock);

            // Engine cylinder head (chrome)
            const cylHead = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.58), chromeMat);
            cylHead.position.set(0, 0.72, 0.04);
            group.add(cylHead);

            // Radiator fins
            for (let i = -2; i <= 2; i++) {
                const fin = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.06), chromeMat);
                fin.position.set(0, 0.52 + i * 0.06, -0.39);
                group.add(fin);
            }

            // ── Swingarm & Shock ────────────────────────────────────────
            [-0.20, 0.20].forEach(x => {
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.05), darkMetalMat);
                arm.rotation.x = 0.1;
                arm.position.set(x, 0.46, 0.68);
                group.add(arm);
            });

            const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 12), goldMat);
            shock.rotation.x = 0.32;
            shock.position.set(0, 0.62, 0.42);
            group.add(shock);

            // ── Front Forks ─────────────────────────────────────────────
            [-0.18, 0.18].forEach(x => {
                const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 1.32, 12), goldMat);
                fork.rotation.x = 0.33;
                fork.position.set(x, 0.58, -0.90);
                group.add(fork);
            });

            // Handlebar
            const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.60, 12), chromeMat);
            handlebar.rotation.z = Math.PI / 2;
            handlebar.position.set(0, 0.98, -0.72);
            group.add(handlebar);

            [-0.30, 0.30].forEach(x => {
                const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.16, 12), carbonMat);
                grip.rotation.z = Math.PI / 2;
                grip.position.set(x, 0.98, -0.72);
                group.add(grip);
            });

            // Instrument cluster
            const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
            dash.position.set(0, 1.04, -0.76);
            dash.rotation.x = -0.4;
            group.add(dash);

            // ── Wheels (Torus tires with spoke rims) ───────────────────
            const makeWheel = (radius, tubeR, posZ, rimColor) => {
                const wg = new THREE.Group();
                const tire = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeR, 20, 36), tireMat);
                tire.rotation.y = Math.PI / 2;
                tire.castShadow = true;
                wg.add(tire);

                // Spoke rim
                const rimFaceGeo = new THREE.CylinderGeometry(radius * 0.68, radius * 0.68, 0.10, 20);
                rimFaceGeo.rotateZ(Math.PI / 2);
                const rim = new THREE.Mesh(rimFaceGeo, new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.08, metalness: 0.96 }));
                wg.add(rim);

                for (let s = 0; s < 6; s++) {
                    const angle = (s / 6) * Math.PI * 2;
                    const spoke = new THREE.Mesh(
                        new THREE.BoxGeometry(radius * 0.9, 0.06, radius * 0.10),
                        new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.08, metalness: 0.96 })
                    );
                    spoke.rotation.set(0, 0, angle);
                    wg.add(spoke);
                }

                // Brake disc
                const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.60, radius * 0.60, 0.025, 20), brakeDiscMat);
                disc.rotation.z = Math.PI / 2;
                disc.position.x = -0.10;
                wg.add(disc);

                wg.position.set(0, radius, posZ);
                return wg;
            };

            group.add(makeWheel(0.44, 0.108, -1.18, colorHex));
            group.add(makeWheel(0.46, 0.132, 1.16, colorHex));

            // ── Body Fairing & Fuel Tank ────────────────────────────────
            // Main upper fairing
            const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.38, 0.90), bodyMat);
            fairing.position.set(0, 0.90, -0.62);
            fairing.castShadow = true;
            group.add(fairing);

            // Front nose fairing
            const noseCone = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.28, 0.55, 8), bodyMat);
            noseCone.rotation.x = Math.PI / 2;
            noseCone.position.set(0, 0.82, -1.08);
            group.add(noseCone);

            // Windscreen
            const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.06), glassMat);
            windscreen.rotation.x = -0.52;
            windscreen.position.set(0, 1.10, -0.84);
            group.add(windscreen);

            // Fuel tank
            const tank = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.38, 0.88), bodyMat);
            tank.position.set(0, 0.94, -0.22);
            tank.rotation.x = -0.12;
            group.add(tank);

            // Seat cowl
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 0.62), seatMat);
            seat.position.set(0, 0.88, 0.48);
            group.add(seat);

            // Tail cowl
            const tailCowl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.60), bodyMat);
            tailCowl.position.set(0, 0.92, 0.88);
            tailCowl.rotation.x = -0.15;
            group.add(tailCowl);

            // ── LED headlights ──────────────────────────────────────────
            const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            [-0.14, 0.14].forEach(x => {
                const hl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.08), hlMat);
                hl.position.set(x, 0.78, -1.22);
                group.add(hl);
            });

            const tlMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
            const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.08), tlMat);
            taillight.position.set(0, 0.94, 1.20);
            group.add(taillight);

            // ── Exhaust (upswept high pipe, carbon + chrome) ────────────
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.82, 12), chromeMat);
            pipe.rotation.x = Math.PI / 2 - 0.28;
            pipe.position.set(0.30, 0.48, 0.55);
            group.add(pipe);

            const muffler = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.62, 14), carbonMat);
            muffler.rotation.x = Math.PI / 2 - 0.28;
            muffler.position.set(0.34, 0.60, 1.12);
            group.add(muffler);

            const mufflerTip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.08, 12), chromeMat);
            mufflerTip.rotation.x = Math.PI / 2 - 0.28;
            mufflerTip.position.set(0.35, 0.66, 1.42);
            group.add(mufflerTip);

            // ── Rider ───────────────────────────────────────────────────
            const riderSuitMat = new THREE.MeshStandardMaterial({ color: 0x0a1020, roughness: 0.4 });
            const helmetMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.10, metalness: 0.88 });

            // Helmet
            const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 18), helmetMat);
            helmet.position.set(0, 1.34, -0.22);
            group.add(helmet);

            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.10, 0.18), new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.7 }));
            visor.position.set(0, 1.33, -0.34);
            group.add(visor);

            // Torso (leaned forward aggressively)
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.48, 0.68), riderSuitMat);
            torso.position.set(0, 1.06, 0.12);
            torso.rotation.x = -0.38;
            group.add(torso);

            // Aero hump on back
            const aeroHump = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.28), bodyMat);
            aeroHump.position.set(0, 1.24, 0.38);
            group.add(aeroHump);

            // Arms
            [-0.24, 0.24].forEach((x, i) => {
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.62, 10), riderSuitMat);
                arm.position.set(x, 1.08, -0.33);
                arm.rotation.set(-0.42, i === 0 ? 0.2 : -0.2, i === 0 ? -0.28 : 0.28);
                group.add(arm);
            });

            // Legs tucked in
            [-0.28, 0.28].forEach(x => {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.62), riderSuitMat);
                leg.position.set(x, 0.70, 0.36);
                leg.rotation.x = 0.28;
                group.add(leg);
            });

            if (isPlayer) {
                exhaustFlamesGroup = new THREE.Group();
                const coreGeo = new THREE.ConeGeometry(0.055, 0.50, 10);
                coreGeo.rotateX(Math.PI / 2);
                const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
                core.position.set(0.34, 0.66, 1.68);
                const auraGeo = new THREE.ConeGeometry(0.11, 0.82, 10);
                auraGeo.rotateX(Math.PI / 2);
                const aura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 }));
                aura.position.set(0.34, 0.66, 1.78);
                exhaustFlamesGroup.add(core, aura);
                exhaustFlamesGroup.visible = false;
                group.add(exhaustFlamesGroup);
            }

            
            // ── RIDER COCKPIT & LIVE HANDLEBARS FOR FPV ───────────────
            if (isPlayer) {
                const gloveMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.5, metalness: 0.3 });
                const gloveDarkMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.8 });

                // Articulated Handlebars & Triple Tree Group
                const handlebarGroup = new THREE.Group();
                handlebarGroup.position.set(0, 0.98, -0.72);

                // Top Triple Tree Clamp
                const topClamp = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.12), chromeMat);
                handlebarGroup.add(topClamp);

                // Fork Top Caps
                [-0.18, 0.18].forEach(x => {
                    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), goldMat);
                    cap.position.set(x, 0.03, 0);
                    handlebarGroup.add(cap);
                });

                // Left & Right Clip-on Handlebars
                [-0.22, 0.22].forEach((x, i) => {
                    const clipon = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 12), darkMetalMat);
                    clipon.rotation.z = i === 0 ? 0.25 : -0.25;
                    clipon.position.set(x, 0.02, 0.05);
                    handlebarGroup.add(clipon);
                });

                // Textured Rubber Grips
                [-0.33, 0.33].forEach(x => {
                    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.16, 16), carbonMat);
                    grip.rotation.z = Math.PI / 2;
                    grip.position.set(x, 0.02, 0.08);
                    handlebarGroup.add(grip);
                });

                // Billet Brake Lever (right) & Clutch Lever (left)
                [-0.32, 0.32].forEach((x, i) => {
                    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.03), chromeMat);
                    lever.position.set(x, -0.01, -0.05);
                    lever.rotation.y = i === 0 ? -0.2 : 0.2;
                    handlebarGroup.add(lever);
                });

                // Brake Fluid Reservoir (Right side)
                const res = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
                res.position.set(0.24, 0.08, 0.04);
                handlebarGroup.add(res);

                // Racing Gloves Gripping the Handlebars
                [-0.33, 0.33].forEach((x, i) => {
                    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.10), gloveMat);
                    glove.position.set(x, 0.03, 0.08);
                    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.06), gloveDarkMat);
                    thumb.position.set(i === 0 ? x + 0.04 : x - 0.04, 0.01, 0.06);
                    handlebarGroup.add(glove, thumb);
                });

                // Aerodynamic Mirrors on Bars
                [-0.42, 0.42].forEach(x => {
                    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.02), chromeMat);
                    mirror.position.set(x, 0.12, 0.05);
                    handlebarGroup.add(mirror);
                });

                group.add(handlebarGroup);
                group.userData.handlebars = handlebarGroup;
            }

            return group;
        }

        let playerCustomColor = 0x00f0ff;

        function spawnSelectedPlayerVehicle(colorOverride) {
            if (colorOverride !== undefined && !isNaN(Number(colorOverride))) {
                playerCustomColor = Number(colorOverride);
            }
            if (playerCar) {
                scene.remove(playerCar);
            }
            const activeColor = (playerCustomColor !== null) ? playerCustomColor : (selectedVehicleType === 'bike' ? 0x00f0ff : 0xff0055);
            if (selectedVehicleType === 'bike') {
                playerCar = createRealisticBike(activeColor, true);
            } else {
                playerCar = createRealisticCar(activeColor, true);
            }
            playerCar.position.set(0, 0, 0);
            playerCar.rotation.set(0, 0, 0);
            scene.add(playerCar);

            // Re-render immediately so the change is instant
            if (!isGameRunning && renderer && scene && camera) {
                camera.position.set(0, 3.8, 8.5);
                camera.rotation.set(-0.22, 0, 0);
                renderer.render(scene, camera);
            }
        }

        function createTataTruck() {
            const group = new THREE.Group();

            const cabMat = new THREE.MeshStandardMaterial({ color: 0xcc5500, roughness: 0.28, metalness: 0.55 });
            const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.08, metalness: 0.96 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1824, roughness: 0.06, metalness: 0.9, transparent: true, opacity: 0.78 });
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.88, metalness: 0.05 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.15, metalness: 0.90 });
            const cargoMat = new THREE.MeshStandardMaterial({ color: 0x1a3852, roughness: 0.55, metalness: 0.20 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.5, metalness: 0.4 });

            // ── CAB ─────────────────────────────────────────────────────
            // Main cab body
            const cab = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.10, 2.50), cabMat);
            cab.position.set(0, 1.55, -1.85);
            cab.castShadow = true;
            group.add(cab);

            // Cab roof panel
            const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 2.35), cabMat);
            roof.position.set(0, 2.68, -1.85);
            group.add(roof);

            // Roof spoiler / air deflector
            const deflector = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.42, 0.20), darkMat);
            deflector.position.set(0, 2.90, -3.04);
            deflector.rotation.x = -0.22;
            group.add(deflector);

            // Cab front grille
            const grille = new THREE.Mesh(new THREE.BoxGeometry(2.20, 0.80, 0.12), darkMat);
            grille.position.set(0, 1.25, -3.12);
            group.add(grille);

            // Grille horizontal bars
            for (let i = 0; i < 5; i++) {
                const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.10), chromeMat);
                bar.position.set(0, 0.96 + i * 0.18, -3.12);
                group.add(bar);
            }

            // Front bumper
            const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.40, 0.30, 0.20), chromeMat);
            bumper.position.set(0, 0.62, -3.08);
            group.add(bumper);

            // Headlights (quad)
            [[-0.72, 1.80], [0.72, 1.80], [-0.72, 1.45], [0.72, 1.45]].forEach(([x, y]) => {
                const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                hl.position.set(x, y, -3.12);
                group.add(hl);
            });

            // Windshield
            const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.95, 0.08), glassMat);
            windshield.position.set(0, 2.08, -3.02);
            windshield.rotation.x = -0.15;
            group.add(windshield);

            // Side windows
            [-1.20, 1.20].forEach(x => {
                const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 1.20), glassMat);
                win.position.set(x, 2.08, -1.55);
                group.add(win);
            });

            // Fuel tanks (side mounted)
            [-1.08, 1.08].forEach(x => {
                const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.10, 18), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.7 }));
                tank.rotation.z = Math.PI / 2;
                tank.position.set(x, 0.68, -0.55);
                group.add(tank);
            });

            // Step boards
            [-1.22, 1.22].forEach(x => {
                const step = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 1.60), darkMat);
                step.position.set(x, 0.35, -1.65);
                group.add(step);
            });

            // ── CARGO TRAILER ────────────────────────────────────────────
            const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.52, 2.75, 5.60), cargoMat);
            trailer.position.set(0, 1.82, 1.52);
            trailer.castShadow = true;
            group.add(trailer);

            // Trailer corrugated side ribs
            for (let i = -4; i <= 4; i++) {
                const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.65, 0.06), darkMat);
                rib.position.set(-1.30, 1.80, i * 0.62 + 1.52);
                group.add(rib.clone());
                const ribR = rib.clone();
                ribR.position.x = 1.30;
                group.add(ribR);
            }

            // Trailer roof rail
            const railGeo = new THREE.BoxGeometry(2.56, 0.10, 5.70);
            const rail = new THREE.Mesh(railGeo, darkMat);
            rail.position.set(0, 3.23, 1.52);
            group.add(rail);

            // Trailer rear doors
            const door = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.60, 0.10), new THREE.MeshStandardMaterial({ color: 0x1f4466, roughness: 0.5 }));
            door.position.set(0, 1.80, 4.35);
            group.add(door);

            // Rear reflectors
            [-0.80, 0.80].forEach(x => {
                const ref = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2200 }));
                ref.position.set(x, 0.80, 4.38);
                group.add(ref);
            });

            // ── DUAL EXHAUST STACKS ──────────────────────────────────────
            [0.95, 1.15].forEach(x => {
                const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 2.60, 14), chromeMat);
                stack.position.set(x, 2.45, -0.75);
                group.add(stack);
                // Stack rain cap
                const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.10, 0.12, 12), chromeMat);
                cap.position.set(x, 3.77, -0.75);
                group.add(cap);
            });

            // ── WHEELS (8 total with detailed rims) ──────────────────────
            const addTruckWheel = (x, y, z) => {
                const wg = new THREE.Group();
                const tireGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.44, 20);
                tireGeo.rotateZ(Math.PI / 2);
                const tire = new THREE.Mesh(tireGeo, tireMat);
                tire.castShadow = true;
                wg.add(tire);

                const rimFaceGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.12, 16);
                rimFaceGeo.rotateZ(Math.PI / 2);
                const rim = new THREE.Mesh(rimFaceGeo, rimMat);
                rim.position.x = x > 0 ? -0.26 : 0.26;
                wg.add(rim);

                // Lug nuts around rim
                for (let l = 0; l < 8; l++) {
                    const ang = (l / 8) * Math.PI * 2;
                    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.10, 8), chromeMat);
                    lug.rotation.z = Math.PI / 2;
                    lug.position.set(rim.position.x, Math.sin(ang) * 0.28, Math.cos(ang) * 0.28);
                    wg.add(lug);
                }

                wg.position.set(x, y, z);
                group.add(wg);
            };

            // Front axle
            [-1.32, 1.32].forEach(x => addTruckWheel(x, 0.56, -2.12));
            // Rear dual axles
            [0.22, 2.55, 3.85].forEach(z => {
                [-1.32, 1.32].forEach(x => addTruckWheel(x, 0.56, z));
            });

            addVehicleTaillights(group, 2.5, 0.8);
            group.userData.isHeavyTruck = true;
            return group;
        }

        function createSchoolBus() {
            const group = new THREE.Group();

            const busMat = new THREE.MeshStandardMaterial({ color: 0xf5c800, roughness: 0.28, metalness: 0.38 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.5, metalness: 0.3 });
            const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.10, metalness: 0.94 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1828, roughness: 0.06, metalness: 0.9, transparent: true, opacity: 0.72 });
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.88, metalness: 0.05 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.18, metalness: 0.88 });

            // Main body
            const body = new THREE.Mesh(new THREE.BoxGeometry(2.62, 2.60, 7.55), busMat);
            body.position.set(0, 1.62, 0);
            body.castShadow = true;
            group.add(body);

            // Flat roof
            const roof = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.12, 7.50), busMat);
            roof.position.set(0, 3.00, 0);
            group.add(roof);

            // Black safety stripe
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.42, 7.60), darkMat);
            stripe.position.set(0, 0.98, 0);
            group.add(stripe);

            // Upper trim stripe
            const upperStripe = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.28, 7.60), darkMat);
            upperStripe.position.set(0, 2.88, 0);
            group.add(upperStripe);

            // Side windows (evenly spaced)
            const winMat = glassMat;
            [-3.0, -1.8, -0.6, 0.6, 1.8, 3.0].forEach(z => {
                [-1.33, 1.33].forEach(x => {
                    const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.88), winMat);
                    win.position.set(x, 2.08, z);
                    group.add(win);
                });
            });

            // Front windshield
            const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.30, 0.92, 0.08), glassMat);
            windshield.position.set(0, 2.10, -3.85);
            windshield.rotation.x = -0.08;
            group.add(windshield);

            // Front grille
            const grille = new THREE.Mesh(new THREE.BoxGeometry(2.40, 0.55, 0.12), darkMat);
            grille.position.set(0, 1.20, -3.82);
            group.add(grille);

            for (let i = 0; i < 4; i++) {
                const bar = new THREE.Mesh(new THREE.BoxGeometry(2.20, 0.06, 0.10), chromeMat);
                bar.position.set(0, 1.05 + i * 0.16, -3.82);
                group.add(bar);
            }

            // Front bumper
            const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.28, 0.18), chromeMat);
            bumper.position.set(0, 0.60, -3.80);
            group.add(bumper);

            // Push bar
            const pushBar = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.10, 0.10), chromeMat);
            pushBar.position.set(0, 0.88, -3.82);
            group.add(pushBar);

            // Headlights
            [[-0.75, 1.65], [0.75, 1.65], [-0.75, 1.42], [0.75, 1.42]].forEach(([x, y]) => {
                const hl = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.18, 0.10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                hl.position.set(x, y, -3.82);
                group.add(hl);
            });

            // Red warning lights on top-front
            [-0.45, 0.45].forEach(x => {
                const wl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
                wl.position.set(x, 3.10, -3.60);
                group.add(wl);
            });

            // Rear emergency door
            const rearDoor = new THREE.Mesh(new THREE.BoxGeometry(1.10, 1.60, 0.10), busMat);
            rearDoor.position.set(0, 1.82, 3.82);
            group.add(rearDoor);

            // Rear lights
            [[-0.85, 0.70], [0.85, 0.70], [-0.85, 0.48], [0.85, 0.48]].forEach(([x, y]) => {
                const rl = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
                rl.position.set(x, y + 0.32, 3.82);
                group.add(rl);
            });

            // Undercarriage frame
            const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.40, 0.22, 7.20), darkMat);
            chassis.position.set(0, 0.30, 0);
            group.add(chassis);

            // Wheels (6 wheels, bus-style)
            const addBusWheel = (x, z) => {
                const wg = new THREE.Group();
                const tireGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.40, 20);
                tireGeo.rotateZ(Math.PI / 2);
                wg.add(new THREE.Mesh(tireGeo, tireMat));

                const rimGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.14, 16);
                rimGeo.rotateZ(Math.PI / 2);
                const rim = new THREE.Mesh(rimGeo, rimMat);
                rim.position.x = x > 0 ? -0.24 : 0.24;
                wg.add(rim);

                for (let l = 0; l < 6; l++) {
                    const ang = (l / 6) * Math.PI * 2;
                    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.08, 8), chromeMat);
                    lug.rotation.z = Math.PI / 2;
                    lug.position.set(rim.position.x, Math.sin(ang) * 0.26, Math.cos(ang) * 0.26);
                    wg.add(lug);
                }

                wg.position.set(x, 0.56, z);
                group.add(wg);
            };

            [-1.36, 1.36].forEach(x => {
                [-2.68, 0.0, 2.88].forEach(z => addBusWheel(x, z));
            });

            // Exhaust
            const exPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.0, 12), chromeMat);
            exPipe.position.set(1.15, 1.45, -2.80);
            group.add(exPipe);

            addVehicleTaillights(group, 2.6, 1.0);
            group.userData.isHeavyTruck = true;
            return group;
        }

        function createMahindraThar() {
            const group = new THREE.Group();

            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb83030, roughness: 0.28, metalness: 0.58 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.55, metalness: 0.35 });
            const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.10, metalness: 0.94 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1820, roughness: 0.06, metalness: 0.9, transparent: true, opacity: 0.75 });
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.92, metalness: 0.04 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.25, metalness: 0.80 });
            const softTopMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.90 });

            // ── Main body (tall off-road profile) ───────────────────────
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.38, 3.85), bodyMat);
            body.position.set(0, 0.98, 0);
            body.castShadow = true;
            group.add(body);

            // Front fender flares
            [-0.98, 0.98].forEach(x => {
                const flare = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.30, 1.40), bodyMat);
                flare.position.set(x, 0.72, -0.80);
                group.add(flare);
                // Rear flare
                const rFlare = flare.clone();
                rFlare.position.z = 0.80;
                group.add(rFlare);
            });

            // ── Soft-top roof ────────────────────────────────────────────
            const roof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.82, 2.05), softTopMat);
            roof.position.set(0, 2.08, 0.28);
            group.add(roof);

            // Roof roll bar (A-pillars)
            [-0.78, 0.78].forEach(x => {
                const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.88, 10), chromeMat);
                pillar.position.set(x, 2.00, -0.75);
                group.add(pillar);
            });

            // ── Front face ───────────────────────────────────────────────
            // Flat grille panel
            const grille = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.80, 0.12), darkMat);
            grille.position.set(0, 0.92, -1.97);
            group.add(grille);

            // 7-slot grille bars (iconic)
            for (let i = -3; i <= 3; i++) {
                const slot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.65, 0.10), new THREE.MeshBasicMaterial({ color: 0x000000 }));
                slot.position.set(i * 0.24, 0.90, -1.96);
                group.add(slot);
            }

            // Front bumper (sturdy)
            const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.30, 0.22), chromeMat);
            bumper.position.set(0, 0.52, -1.96);
            group.add(bumper);

            // Bull bar
            const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 0.12), chromeMat);
            bullBar.position.set(0, 0.88, -2.02);
            group.add(bullBar);

            // Headlights (round, iconic)
            [-0.58, 0.58].forEach(x => {
                const hlBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), chromeMat);
                hlBase.rotation.x = Math.PI / 2;
                hlBase.position.set(x, 1.06, -1.98);
                group.add(hlBase);
                const hlLens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                hlLens.rotation.x = Math.PI / 2;
                hlLens.position.set(x, 1.06, -2.00);
                group.add(hlLens);
            });

            // Windshield
            const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.80, 0.08), glassMat);
            windshield.position.set(0, 1.72, -1.30);
            windshield.rotation.x = -0.28;
            group.add(windshield);

            // Side windows
            [-0.98, 0.98].forEach(x => {
                const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 1.10), glassMat);
                win.position.set(x, 1.72, 0.22);
                group.add(win);
            });

            // ── Snorkel (right side, off-road style) ─────────────────────
            const snorkelPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.50, 10), darkMat);
            snorkelPipe.position.set(1.00, 1.90, -1.50);
            group.add(snorkelPipe);
            const snorkelHead = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.22, 10), darkMat);
            snorkelHead.position.set(1.00, 2.68, -1.50);
            group.add(snorkelHead);

            // ── Roof rack ────────────────────────────────────────────────
            const rackBase = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.06, 1.80), darkMat);
            rackBase.position.set(0, 2.52, 0.28);
            group.add(rackBase);

            // Rack cross bars
            [-0.65, 0.0, 0.65].forEach(z => {
                const bar = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.06, 0.06), chromeMat);
                bar.position.set(0, 2.56, z + 0.28);
                group.add(bar);
            });

            // ── Spare tire on rear ───────────────────────────────────────
            const spareRim = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.30, 16), rimMat);
            spareRim.rotation.x = Math.PI / 2;
            spareRim.position.set(0, 1.25, 2.10);
            group.add(spareRim);
            const spareTire = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.10, 14, 28), tireMat);
            spareTire.rotation.x = Math.PI / 2;
            spareTire.position.set(0, 1.25, 2.10);
            group.add(spareTire);

            // ── Rear taillights ──────────────────────────────────────────
            [-0.72, 0.72].forEach(x => {
                const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.30, 0.08), new THREE.MeshBasicMaterial({ color: 0xff1100 }));
                tl.position.set(x, 1.02, 1.97);
                group.add(tl);
            });

            // ── Off-road wheels (big, aggressive) ───────────────────────
            const addOffroadWheel = (x, z) => {
                const wg = new THREE.Group();

                // Wide aggressive tire
                const tireGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 20);
                tireGeo.rotateZ(Math.PI / 2);
                const tire = new THREE.Mesh(tireGeo, tireMat);
                tire.castShadow = true;
                wg.add(tire);

                // Rim with spokes
                const rimFaceGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.14, 16);
                rimFaceGeo.rotateZ(Math.PI / 2);
                const rim = new THREE.Mesh(rimFaceGeo, rimMat);
                rim.position.x = x > 0 ? -0.24 : 0.24;
                wg.add(rim);

                for (let s = 0; s < 5; s++) {
                    const angle = (s / 5) * Math.PI * 2;
                    const spoke = new THREE.Mesh(
                        new THREE.BoxGeometry(0.36, 0.10, 0.12),
                        rimMat
                    );
                    spoke.rotation.set(0, 0, angle);
                    spoke.position.x = rim.position.x;
                    wg.add(spoke);
                }

                wg.position.set(x, 0.46, z);
                group.add(wg);
            };

            [-1.10, 1.10].forEach(x => {
                [-1.40, 1.40].forEach(z => addOffroadWheel(x, z));
            });

            return group;
        }

        function createMotorcycle() {
            const group = new THREE.Group();

            const bikeColors = [0xff2200, 0x00d4ff, 0x22cc44, 0xffaa00, 0x8822ee];
            const chosenColor = bikeColors[Math.floor(Math.random() * bikeColors.length)];

            const bodyMat = new THREE.MeshStandardMaterial({ color: chosenColor, roughness: 0.13, metalness: 0.87 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.65, metalness: 0.30 });
            const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.08, metalness: 0.96 });
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.90, metalness: 0.04 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.12, metalness: 0.92 });
            const carbonMat = new THREE.MeshStandardMaterial({ color: 0x080a0e, roughness: 0.28, metalness: 0.75 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1a2e, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.72 });
            const riderMat = new THREE.MeshStandardMaterial({ color: 0x0a0a18, roughness: 0.40 });
            const helmetMat = new THREE.MeshStandardMaterial({ color: chosenColor, roughness: 0.12, metalness: 0.85 });

            // ── Frame ────────────────────────────────────────────────────
            [-0.20, 0.20].forEach(x => {
                const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.45, 12), darkMat);
                tube.rotation.x = -0.14;
                tube.position.set(x, 0.58, -0.05);
                group.add(tube);
            });

            // Engine block
            const engine = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.68), darkMat);
            engine.position.set(0, 0.46, 0.02);
            engine.castShadow = true;
            group.add(engine);

            // Chrome cylinder head
            const cylHead = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.55), chromeMat);
            cylHead.position.set(0, 0.68, 0.02);
            group.add(cylHead);

            // ── Swingarm
            [-0.18, 0.18].forEach(x => {
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 1.00), darkMat);
                arm.rotation.x = 0.08;
                arm.position.set(x, 0.44, 0.66);
                group.add(arm);
            });

            const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.38, 12), chromeMat);
            shock.rotation.x = 0.30;
            shock.position.set(0, 0.60, 0.40);
            group.add(shock);

            // ── Front Forks ──────────────────────────────────────────────
            [-0.16, 0.16].forEach(x => {
                const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 1.20, 12), chromeMat);
                fork.rotation.x = 0.30;
                fork.position.set(x, 0.55, -0.86);
                group.add(fork);
            });

            const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.58, 10), chromeMat);
            handlebar.rotation.z = Math.PI / 2;
            handlebar.position.set(0, 0.95, -0.68);
            group.add(handlebar);

            [-0.28, 0.28].forEach(x => {
                const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.14, 10), carbonMat);
                grip.rotation.z = Math.PI / 2;
                grip.position.set(x, 0.95, -0.68);
                group.add(grip);
            });

            // ── Wheels (Torus with spokes) ────────────────────────────────
            const makeNpcWheel = (posZ, radius) => {
                const wg = new THREE.Group();
                const tire = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.25, 18, 32), tireMat);
                tire.rotation.y = Math.PI / 2;
                tire.castShadow = true;
                wg.add(tire);

                const rimGeo = new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, 0.08, 16);
                rimGeo.rotateZ(Math.PI / 2);
                const rim = new THREE.Mesh(rimGeo, rimMat);
                wg.add(rim);

                for (let s = 0; s < 6; s++) {
                    const ang = (s / 6) * Math.PI * 2;
                    const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.88, 0.05, radius * 0.09), rimMat);
                    spoke.rotation.set(0, 0, ang);
                    wg.add(spoke);
                }

                // Brake disc
                const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, 0.022, 16), new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.3, metalness: 0.85 }));
                disc.rotation.z = Math.PI / 2;
                disc.position.x = -0.09;
                wg.add(disc);

                wg.position.set(0, radius, posZ);
                return wg;
            };

            group.add(makeNpcWheel(-1.22, 0.36));
            group.add(makeNpcWheel(1.18, 0.38));

            // ── Body Fairing ──────────────────────────────────────────────
            const frontFairing = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.85), bodyMat);
            frontFairing.position.set(0, 0.86, -0.60);
            frontFairing.castShadow = true;
            group.add(frontFairing);

            const noseCone = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.26, 0.50, 8), bodyMat);
            noseCone.rotation.x = Math.PI / 2;
            noseCone.position.set(0, 0.78, -1.04);
            group.add(noseCone);

            const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.06), glassMat);
            windscreen.rotation.x = -0.50;
            windscreen.position.set(0, 1.06, -0.80);
            group.add(windscreen);

            const tank = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.35, 0.84), bodyMat);
            tank.position.set(0, 0.90, -0.20);
            group.add(tank);

            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.60), darkMat);
            seat.position.set(0, 0.84, 0.46);
            group.add(seat);

            const tailCowl = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.28, 0.55), bodyMat);
            tailCowl.position.set(0, 0.88, 0.84);
            tailCowl.rotation.x = -0.12;
            group.add(tailCowl);

            // Headlight
            [-0.12, 0.12].forEach(x => {
                const hl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                hl.position.set(x, 0.75, -1.20);
                group.add(hl);
            });

            // Taillight
            const tl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.08), new THREE.MeshBasicMaterial({ color: 0xff0033 }));
            tl.position.set(0, 0.90, 1.18);
            group.add(tl);

            // Exhaust
            const exPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.78, 12), chromeMat);
            exPipe.rotation.x = Math.PI / 2 - 0.25;
            exPipe.position.set(0.28, 0.40, 0.52);
            group.add(exPipe);

            const muffler = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.10, 0.58, 14), carbonMat);
            muffler.rotation.x = Math.PI / 2 - 0.25;
            muffler.position.set(0.30, 0.58, 1.10);
            group.add(muffler);

            // ── Rider ────────────────────────────────────────────────────
            const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 16), helmetMat);
            helmet.position.set(0, 1.28, -0.20);
            group.add(helmet);

            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.16), new THREE.MeshBasicMaterial({ color: 0x002244, transparent: true, opacity: 0.8 }));
            visor.position.set(0, 1.27, -0.32);
            group.add(visor);

            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.62), riderMat);
            torso.position.set(0, 1.02, 0.12);
            torso.rotation.x = -0.34;
            group.add(torso);

            [-0.22, 0.22].forEach((x, i) => {
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.050, 0.58, 10), riderMat);
                arm.position.set(x, 1.02, -0.30);
                arm.rotation.set(-0.40, i === 0 ? 0.18 : -0.18, i === 0 ? -0.26 : 0.26);
                group.add(arm);
            });

            [-0.26, 0.26].forEach(x => {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.58), riderMat);
                leg.position.set(x, 0.66, 0.32);
                leg.rotation.x = 0.26;
                group.add(leg);
            });

            group.userData.isBike = true;
            group.userData.silencerOffset = new THREE.Vector3(0.30, 0.58, 1.10);
            return group;
        }

        
        // ── ADVANCED EMERGENCY AMBULANCE ─────────────────────────────────────
        function createAmbulance() {
            const group = new THREE.Group();

            const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.22, metalness: 0.35 });
            const redMat = new THREE.MeshStandardMaterial({ color: 0xee1122, roughness: 0.25, metalness: 0.30 });
            const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.08, metalness: 0.96 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.5, metalness: 0.3 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x142233, roughness: 0.05, metalness: 0.95, transparent: true, opacity: 0.85 });
            const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.90, metalness: 0.05 });
            const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.12, metalness: 0.92 });

            // Main van cab & rear high-top body
            const cab = new THREE.Mesh(new THREE.BoxGeometry(2.32, 1.70, 2.20), whiteMat);
            cab.position.set(0, 1.25, -1.85);
            cab.castShadow = true;
            group.add(cab);

            const boxBody = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.30, 4.30), whiteMat);
            boxBody.position.set(0, 1.62, 1.15);
            boxBody.castShadow = true;
            group.add(boxBody);

            // Red reflective side hazard stripes (Day-Glo)
            [-1.23, 1.23].forEach(x => {
                const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 4.25), redMat);
                stripe.position.set(x, 1.35, 1.15);
                group.add(stripe);

                // Red Medical Cross (+) on side
                const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.70, 0.22), redMat);
                crossV.position.set(x, 2.05, 1.15);
                const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.70), redMat);
                crossH.position.set(x, 2.05, 1.15);
                group.add(crossV, crossH);
            });

            // Windshield & Cab Windows
            const windscreen = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.85, 0.06), glassMat);
            windscreen.rotation.x = -0.32;
            windscreen.position.set(0, 1.65, -2.75);
            group.add(windscreen);

            [-1.17, 1.17].forEach(x => {
                const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.70, 1.05), glassMat);
                sideWin.position.set(x, 1.62, -1.75);
                group.add(sideWin);
            });

            // Rear ambulance doors & frosted glass
            [-0.55, 0.55].forEach(x => {
                const rearWin = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.65, 0.05), glassMat);
                rearWin.position.set(x, 1.95, 3.32);
                group.add(rearWin);
            });

            // Chrome Front Grille & Heavy Bumper
            const grille = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.48, 0.12), chromeMat);
            grille.position.set(0, 0.82, -2.96);
            group.add(grille);

            const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.32, 0.28), darkMat);
            bumper.position.set(0, 0.45, -2.90);
            group.add(bumper);

            // Headlights
            [-0.85, 0.85].forEach(x => {
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                head.position.set(x, 0.88, -2.97);
                group.add(head);
            });

            // High-Intensity Emergency Strobe Lightbar on roof
            const barGroup = new THREE.Group();
            barGroup.position.set(0, 2.85, 0.8);

            const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.12, 0.32), darkMat);
            barGroup.add(barBase);

            const redStrobe = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.20, 0.28), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
            redStrobe.position.set(-0.38, 0.08, 0);
            const blueStrobe = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.20, 0.28), new THREE.MeshBasicMaterial({ color: 0x0066ff }));
            blueStrobe.position.set(0.38, 0.08, 0);

            const emergencyPointLight = new THREE.PointLight(0xff0022, 3.5, 26);
            emergencyPointLight.position.set(0, 0.4, 0);
            barGroup.add(emergencyPointLight);

            barGroup.add(redStrobe, blueStrobe);
            group.add(barGroup);

            // Wheels (Heavy 6-wheel setup: single front, dual rear)
            const addAmbulanceWheel = (x, z) => {
                const wGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.28, 20);
                wGeo.rotateZ(Math.PI / 2);
                const wheel = new THREE.Mesh(wGeo, tireMat);
                wheel.position.set(x, 0.44, z);
                wheel.castShadow = true;

                const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.29, 16);
                rimGeo.rotateZ(Math.PI / 2);
                const rim = new THREE.Mesh(rimGeo, rimMat);
                wheel.add(rim);
                group.add(wheel);
            };

            addAmbulanceWheel(-1.18, -1.8);
            addAmbulanceWheel(1.18, -1.8);
            addAmbulanceWheel(-1.22, 1.8);
            addAmbulanceWheel(1.22, 1.8);

            group.userData = {
                isEmergency: true,
                isAmbulance: true,
                redStrobe: redStrobe,
                blueStrobe: blueStrobe,
                strobeLight: emergencyPointLight,
                halfLength: 3.5
            };

            return group;
        }

        // ── ENHANCED POLICE CAR INTERCEPTOR ──────────────────────────────────
        function createPoliceCar() {
            const group = createRealisticCar(0x0a0c12, false);

            const whiteDoorMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.25, metalness: 0.35 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.4, metalness: 0.7 });

            // White doors & roof for classic Police Cruiser livery
            [-1.06, 1.06].forEach(x => {
                const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 1.7), whiteDoorMat);
                doorPanel.position.set(x, 0.58, 0);
                group.add(doorPanel);

                // Gold Police Shield / Star Emblem on door
                const badge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
                badge.position.set(x > 0 ? x + 0.01 : x - 0.01, 0.62, 0);
                group.add(badge);
            });

            // Heavy-duty Front Push Bumper (Bullbar)
            const bullbar = new THREE.Group();
            const barGeo = new THREE.BoxGeometry(1.6, 0.12, 0.12);
            const lowerBar = new THREE.Mesh(barGeo, darkMat);
            lowerBar.position.set(0, 0.38, -2.18);
            const upperBar = new THREE.Mesh(barGeo, darkMat);
            upperBar.position.set(0, 0.64, -2.18);

            [-0.45, 0.45].forEach(x => {
                const upright = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.14), darkMat);
                upright.position.set(x, 0.50, -2.18);
                bullbar.add(upright);
            });
            bullbar.add(lowerBar, upperBar);
            group.add(bullbar);

            // A-Pillar Spotlight
            const spotlight = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 12), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
            spotlight.rotation.x = Math.PI / 2;
            spotlight.position.set(-0.62, 0.92, -0.68);
            group.add(spotlight);

            // High-Tech Aerodynamic LED Lightbar
            const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.24), darkMat);
            barBase.position.set(0, 1.08, 0.05);

            const redLight = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.20), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
            redLight.position.set(-0.28, 0.06, 0);

            const blueLight = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.20), new THREE.MeshBasicMaterial({ color: 0x0055ff }));
            blueLight.position.set(0.28, 0.06, 0);

            const centerWhite = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.18), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            centerWhite.position.set(0, 0.06, 0);

            const sirenLight = new THREE.PointLight(0x0055ff, 3.2, 24);
            sirenLight.position.set(0, 0.35, 0);
            barBase.add(sirenLight);

            barBase.add(redLight, blueLight, centerWhite);
            group.add(barBase);

            group.userData.isPolice = true;
            group.userData.isEmergency = true;
            group.userData.redStrobe = redLight;
            group.userData.blueStrobe = blueLight;
            group.userData.strobeLight = sirenLight;

            return group;
        }


        // --- JUNCTION & TRAFFIC LIGHT SYSTEM ---
        function createJunctionSegment(zPos) {
            const segmentGroup = new THREE.Group();
            segmentGroup.position.z = zPos;
            segmentGroup.userData.isJunction = true;

            const roadGeo = new THREE.PlaneGeometry(roadWidth, segmentLength);
            const roadMat = new THREE.MeshStandardMaterial({ color: 0x101319, roughness: 0.72, metalness: 0.08 });
            const roadMesh = new THREE.Mesh(roadGeo, roadMat);
            roadMesh.rotation.x = -Math.PI / 2;
            roadMesh.receiveShadow = true;
            segmentGroup.add(roadMesh);

            const crossRoadGeo = new THREE.PlaneGeometry(100, roadWidth);
            const crossRoadMesh = new THREE.Mesh(crossRoadGeo, roadMat);
            crossRoadMesh.rotation.x = -Math.PI / 2;
            crossRoadMesh.position.set(0, 0.035, 0);
            crossRoadMesh.receiveShadow = true;
            segmentGroup.add(crossRoadMesh);

            const grassGeo = new THREE.PlaneGeometry(80, segmentLength);
            const grassMat = new THREE.MeshStandardMaterial({ color: 0x1e3f20, roughness: 0.95, metalness: 0.05 });

            const leftGrass = new THREE.Mesh(grassGeo, grassMat);
            leftGrass.rotation.x = -Math.PI / 2;
            leftGrass.position.set(-roadWidth / 2 - 40, -0.01, 0);
            leftGrass.receiveShadow = true;

            const rightGrass = new THREE.Mesh(grassGeo, grassMat);
            rightGrass.rotation.x = -Math.PI / 2;
            rightGrass.position.set(roadWidth / 2 + 40, -0.01, 0);
            rightGrass.receiveShadow = true;

            segmentGroup.add(leftGrass, rightGrass);
            addRoadCurbs(segmentGroup, true);
            addJunctionCornerFillets(segmentGroup);
            addJunctionMarkings(segmentGroup);

            createJunctionSignal(segmentGroup, -roadWidth / 2 - 2, -12, 0, 'main');
            createJunctionSignal(segmentGroup, roadWidth / 2 + 2, 12, Math.PI, 'main');
            createJunctionSignal(segmentGroup, -12, roadWidth / 2 + 2, -Math.PI / 2, 'cross');
            createJunctionSignal(segmentGroup, 12, -roadWidth / 2 - 2, Math.PI / 2, 'cross');

            scene.add(segmentGroup);
            return segmentGroup;
        }

        // Rounded "curvy" curb fillet that smoothly connects the two straight curb
        // lines meeting at each of the four junction corners (like a real street
        // corner radius), replacing the sharp 90-degree join.
        function addJunctionCornerFillets(segmentGroup) {
            const curbMat = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide });
            const R = 2.4;
            const curbDepth = 0.55;
            const curbHeight = 0.3;
            const outerR = R + curbDepth;
            const roadHalf = roadWidth / 2;

            const quadrants = [
                { qx: 1, qz: 1 },
                { qx: -1, qz: 1 },
                { qx: 1, qz: -1 },
                { qx: -1, qz: -1 }
            ];

            const shapeAngles = {
                '1,1': [0.5 * Math.PI, Math.PI],
                '-1,1': [0, 0.5 * Math.PI],
                '1,-1': [Math.PI, 1.5 * Math.PI],
                '-1,-1': [1.5 * Math.PI, 2 * Math.PI]
            };

            quadrants.forEach(({ qx, qz }) => {
                const ccx = qx * (roadHalf + R);
                const ccz = qz * (roadHalf + R);
                const scx = ccx;
                const scy = -ccz;
                const [startAngle, endAngle] = shapeAngles[`${qx},${qz}`];

                const shape = new THREE.Shape();
                shape.absarc(scx, scy, outerR, startAngle, endAngle, false);
                const innerEndX = scx + R * Math.cos(endAngle);
                const innerEndY = scy + R * Math.sin(endAngle);
                shape.lineTo(innerEndX, innerEndY);
                shape.absarc(scx, scy, R, endAngle, startAngle, true);
                shape.closePath();

                const geo = new THREE.ExtrudeGeometry(shape, { depth: curbHeight, bevelEnabled: false });
                geo.rotateX(-Math.PI / 2);
                const mesh = new THREE.Mesh(geo, curbMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                segmentGroup.add(mesh);
            });
        }

        function addJunctionMarkings(segmentGroup) {
            const crosswalkMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f5 });
            const laneMarkMat = new THREE.MeshBasicMaterial({ color: 0xf7f7f2 });
            const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xd5b84a });
            const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb7bdc1, roughness: 0.9 });
            const crosswalkOffset = 11.6;
            const stripeCount = 10;
            const stripeGap = 0.66;
            const stripeWidth = 0.48;
            const stripeHeight = 0.035;

            [-1, 1].forEach(side => {
                [-1, 1].forEach(corner => {
                    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 12), sidewalkMat);
                    sidewalk.position.set(side * 14, 0.04, corner * 14);
                    sidewalk.receiveShadow = true;
                    segmentGroup.add(sidewalk);
                });

                for (let index = 0; index < stripeCount; index++) {
                    const offset = (index - (stripeCount - 1) / 2) * stripeGap;
                    const mainStripe = new THREE.Mesh(
                        new THREE.BoxGeometry(roadWidth - 1.2, stripeHeight, stripeWidth),
                        crosswalkMat
                    );
                    mainStripe.position.set(offset, 0.14, side * crosswalkOffset);
                    segmentGroup.add(mainStripe);

                    const crossStripe = new THREE.Mesh(
                        new THREE.BoxGeometry(stripeWidth, stripeHeight, roadWidth - 1.2),
                        crosswalkMat
                    );
                    crossStripe.position.set(side * crosswalkOffset, 0.14, offset);
                    segmentGroup.add(crossStripe);
                }
            });

            [-1, 1].forEach(side => {
                [-1, 1].forEach(axis => {
                    const mainEdge = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 18), edgeLineMat);
                    mainEdge.rotation.x = -Math.PI / 2;
                    mainEdge.position.set(side * (roadWidth / 2 - 0.35), 0.08, axis * 18);
                    segmentGroup.add(mainEdge);

                    const crossEdge = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.12), edgeLineMat);
                    crossEdge.rotation.x = -Math.PI / 2;
                    crossEdge.position.set(axis * 18, 0.08, side * (roadWidth / 2 - 0.35));
                    segmentGroup.add(crossEdge);
                });

                for (let index = -2; index <= 2; index++) {
                    const mainDash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.4), laneMarkMat);
                    mainDash.rotation.x = -Math.PI / 2;
                    mainDash.position.set(0, 0.08, side * (27 + index * 5));
                    segmentGroup.add(mainDash);

                    const crossDash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.16), laneMarkMat);
                    crossDash.rotation.x = -Math.PI / 2;
                    crossDash.position.set(side * (27 + index * 5), 0.08, 0);
                    segmentGroup.add(crossDash);
                }
            });
        }

        function addJunctionStopLines(segmentGroup) {
            const stopLineMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f5 });
            const lineY = 0.045;
            const lineOffset = junctionLineOffset;
            const lineLength = roadWidth - 1.2;

            [-lineOffset, lineOffset].forEach(z => {
                const line = new THREE.Mesh(
                    new THREE.PlaneGeometry(lineLength, 0.18),
                    stopLineMat
                );
                line.rotation.x = -Math.PI / 2;
                line.position.set(0, lineY, z);
                segmentGroup.add(line);
            });

            [-lineOffset, lineOffset].forEach(x => {
                const line = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.18, lineLength),
                    stopLineMat
                );
                line.rotation.x = -Math.PI / 2;
                line.position.set(x, lineY, 0);
                segmentGroup.add(line);
            });
        }

        function createJunctionSignal(parent, x, z, rotationY, signalAxis) {
            const poleGroup = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.14, 0.18, 6, 8),
                new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 })
            );
            pole.position.y = 3;
            poleGroup.add(pole);

            // Horizontal housing: rounded-rectangle body made from a box plus
            // cylindrical end-caps, styled after a compact 3-lamp signal head.
            const housingWidth = 3.2;
            const housingHeight = 1.0;
            const housingDepth = 0.7;
            const housingY = 5.65;
            const housingMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.55, metalness: 0.35 });

            const housingBody = new THREE.Mesh(
                new THREE.BoxGeometry(housingWidth - housingHeight, housingHeight, housingDepth),
                housingMat
            );
            housingBody.position.y = housingY;
            poleGroup.add(housingBody);

            const capGeo = new THREE.CylinderGeometry(housingHeight / 2, housingHeight / 2, housingDepth, 20);
            capGeo.rotateX(Math.PI / 2);
            [-1, 1].forEach(side => {
                const cap = new THREE.Mesh(capGeo, housingMat);
                cap.position.set(side * (housingWidth - housingHeight) / 2, housingY, 0);
                poleGroup.add(cap);
            });

            const lampSpacing = (housingWidth - housingHeight) / 1.35;
            const lampSlots = [-1, 0, 1];
            const onColors = [0xff2222, 0xffd23f, 0x00e05a];
            const offColors = [0x330000, 0x332b00, 0x003310];
            const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.7, roughness: 0.35 });

            const lights = lampSlots.map((slot, index) => {
                const lampX = slot * (lampSpacing / 2);

                const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.075, 10, 24), bezelMat);
                bezel.position.set(lampX, housingY, housingDepth / 2 + 0.01);
                poleGroup.add(bezel);

                const socket = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24),
                    bezelMat
                );
                socket.rotation.x = Math.PI / 2;
                socket.position.set(lampX, housingY, housingDepth / 2 - 0.03);
                poleGroup.add(socket);

                const lens = new THREE.Mesh(
                    new THREE.CircleGeometry(0.27, 24),
                    new THREE.MeshBasicMaterial({ color: offColors[index] })
                );
                lens.position.set(lampX, housingY, housingDepth / 2 + 0.03);
                poleGroup.add(lens);
                lens.userData.onColor = onColors[index];
                lens.userData.offColor = offColors[index];

                return lens;
            });

            poleGroup.position.set(x, 0, z);
            poleGroup.rotation.y = rotationY;
            poleGroup.userData.signalLights = lights;
            poleGroup.userData.signalAxis = signalAxis;
            parent.add(poleGroup);
        }

        function addRoadCurbs(segmentGroup, isJunction = false) {
            const curbMat = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 0.9, metalness: 0.05 });
            const curbHeight = 0.3;
            const curbDepth = 0.55;

            if (isJunction) {
                [-1, 1].forEach(side => {
                    const mainCurb = new THREE.Mesh(
                        new THREE.BoxGeometry(curbDepth, curbHeight, 40),
                        curbMat
                    );
                    mainCurb.position.set(side * (roadWidth / 2 + curbDepth / 2), curbHeight / 2, -30);
                    mainCurb.castShadow = true;
                    mainCurb.receiveShadow = true;
                    segmentGroup.add(mainCurb);

                    const farMainCurb = mainCurb.clone();
                    farMainCurb.position.z = 30;
                    segmentGroup.add(farMainCurb);

                    [-1, 1].forEach(crossSide => {
                        const crossCurb = new THREE.Mesh(
                            new THREE.BoxGeometry(40, curbHeight, curbDepth),
                            curbMat
                        );
                        crossCurb.position.set(side * 30, curbHeight / 2, crossSide * (roadWidth / 2 + curbDepth / 2));
                        crossCurb.castShadow = true;
                        crossCurb.receiveShadow = true;
                        segmentGroup.add(crossCurb);
                    });
                });
            } else {
                [-1, 1].forEach(side => {
                    const curb = new THREE.Mesh(
                        new THREE.BoxGeometry(curbDepth, curbHeight, segmentLength),
                        curbMat
                    );
                    curb.position.set(side * (roadWidth / 2 + curbDepth / 2), curbHeight / 2, 0);
                    curb.castShadow = true;
                    curb.receiveShadow = true;
                    segmentGroup.add(curb);
                });
            }
        }

        
        function addRoadDetails(segmentGroup) {
            const studMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.95, roughness: 0.1 });
            const amberStudMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
            const drainMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.8, metalness: 0.7 });
            const curbRedMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6 });
            const curbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xededed, roughness: 0.6 });
            const grassBladeMat1 = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.95 });
            const grassBladeMat2 = new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 0.95 });
            const flowerPetalMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });

            // 3D Road Studs ("Cats' Eyes") along lane dividers
            [-3.5, 3.5].forEach(x => {
                for (let z = -segmentLength / 2 + 5; z < segmentLength / 2; z += 10) {
                    const stud = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.22), studMat);
                    stud.position.set(x, 0.08, z);
                    const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.08), amberStudMat);
                    reflector.position.set(x, 0.09, z);
                    segmentGroup.add(stud, reflector);
                }
            });

            // Painted Alternating Hazard Curb Blocks (Red & White)
            [-1, 1].forEach(side => {
                const curbX = side * (roadWidth / 2 + curbDepth / 2);
                for (let z = -segmentLength / 2 + 2; z < segmentLength / 2; z += 4) {
                    const isRed = Math.floor(Math.abs(z) / 4) % 2 === 0;
                    const block = new THREE.Mesh(new THREE.BoxGeometry(curbDepth * 0.98, curbHeight * 0.95, 3.8), isRed ? curbRedMat : curbWhiteMat);
                    block.position.set(curbX, curbHeight / 2 + 0.01, z);
                    segmentGroup.add(block);
                }

                // Metal Storm Drain Grate embedded along the curb
                const drain = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 1.45), drainMat);
                drain.position.set(side * (roadWidth / 2 - 0.55), 0.075, -12);
                segmentGroup.add(drain);
            });

            // 3D Lush Grass Tufts & Wildflowers in Side Paths
            [-1, 1].forEach(side => {
                for (let g = 0; g < 12; g++) {
                    const gx = side * (roadWidth / 2 + 3.2 + Math.random() * 22);
                    const gz = (Math.random() - 0.5) * segmentLength;
                    const tuftG = new THREE.Group();

                    // Cluster of grass blades
                    for (let b = 0; b < 3; b++) {
                        const blade = new THREE.Mesh(
                            new THREE.ConeGeometry(0.12, 0.55 + Math.random() * 0.35, 4),
                            b % 2 === 0 ? grassBladeMat1 : grassBladeMat2
                        );
                        blade.position.set((Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3);
                        blade.rotation.z = (Math.random() - 0.5) * 0.35;
                        tuftG.add(blade);
                    }

                    // Occasional roadside wildflower
                    if (g % 3 === 0) {
                        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), flowerPetalMat);
                        flower.position.set(0, 0.55, 0);
                        tuftG.add(flower);
                    }

                    tuftG.position.set(gx, 0, gz);
                    segmentGroup.add(tuftG);
                }
            });
        }

        function createRegularSegment(zPos) {
            const segmentGroup = new THREE.Group();
            segmentGroup.position.z = zPos;

            const roadGeo = new THREE.PlaneGeometry(roadWidth, segmentLength);
            const roadMat = new THREE.MeshStandardMaterial({ color: 0x101319, roughness: 0.72, metalness: 0.08 });
            const roadMesh = new THREE.Mesh(roadGeo, roadMat);
            roadMesh.rotation.x = -Math.PI / 2;
            roadMesh.receiveShadow = true;
            segmentGroup.add(roadMesh);
            addRoadLaneMarkings(segmentGroup);

            const grassGeo = new THREE.PlaneGeometry(80, segmentLength);
            const grassMat = new THREE.MeshStandardMaterial({ color: 0x1e3f20, roughness: 0.95, metalness: 0.05 });

            const leftGrass = new THREE.Mesh(grassGeo, grassMat);
            leftGrass.rotation.x = -Math.PI / 2;
            leftGrass.position.set(-roadWidth / 2 - 40, -0.01, 0);
            leftGrass.receiveShadow = true;

            const rightGrass = new THREE.Mesh(grassGeo, grassMat);
            rightGrass.rotation.x = -Math.PI / 2;
            rightGrass.position.set(roadWidth / 2 + 40, -0.01, 0);
            rightGrass.receiveShadow = true;

            segmentGroup.add(leftGrass, rightGrass);
            addRoadCurbs(segmentGroup);
            addRoadDetails(segmentGroup);

            scene.add(segmentGroup);
            return segmentGroup;
        }

        function addRoadLaneMarkings(segmentGroup) {
            const dashMat = new THREE.MeshBasicMaterial({ color: 0xe7ebed });
            const edgeMat = new THREE.MeshBasicMaterial({ color: 0xd5b84a });

            for (let index = -4; index <= 4; index++) {
                const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 4.2), dashMat);
                dash.rotation.x = -Math.PI / 2;
                dash.position.set(0, 0.07, index * 10);
                segmentGroup.add(dash);
            }

            [-1, 1].forEach(side => {
                const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.12, segmentLength - 4), edgeMat);
                edge.rotation.x = -Math.PI / 2;
                edge.position.set(side * (roadWidth / 2 - 0.35), 0.07, 0);
                segmentGroup.add(edge);
            });
        }

        function createRoadNetwork() {
            for (let i = 0; i < totalSegments; i++) {
                const zPos = -i * segmentLength;
                const seg = createRegularSegment(zPos);
                if (i > 0 && i % 2 === 0) {
                    addStandaloneTrafficSignals(seg);
                    signalSections.push(seg);
                }
                roadSegments.push(seg);
            }
        }

        function addStandaloneTrafficSignals(segmentGroup) {
            segmentGroup.userData.isSignalSection = true;
            segmentGroup.userData.crossingHalfDepth = 5 * 0.65 + 0.42 / 2;
            segmentGroup.userData.npcStopBeforeCrossing = 2;
            createJunctionSignal(segmentGroup, -roadWidth / 2 - 2, 0, 0, 'main');
            createJunctionSignal(segmentGroup, roadWidth / 2 + 2, 0, Math.PI, 'main');

            const zebraMaterial = new THREE.MeshBasicMaterial({ color: 0xf2f4f5 });
            for (let index = -5; index <= 5; index++) {
                const stripe = new THREE.Mesh(
                    new THREE.BoxGeometry(roadWidth, 0.04, 0.42),
                    zebraMaterial
                );
                stripe.position.set(0, 0.1, index * 0.65);
                segmentGroup.add(stripe);
            }
        }

        function getSafeSceneryZ(candidateZ, clearance = 32) {
            let safeZ = candidateZ;
            while (junctions.some(junction => Math.abs(safeZ - junction.position.z) < clearance)) {
                safeZ -= clearance;
            }
            return safeZ;
        }

        function isJunctionRoadSlotBlocked(x, z, xRadius, zRadius) {
            return junctions.some(junction => {
                const junctionZ = junction.position.z;
                const onMainRoad = Math.abs(x) < roadWidth / 2 + xRadius
                    && Math.abs(z - junctionZ) < segmentLength / 2 + zRadius;
                const onCrossRoad = Math.abs(x) < 50 + xRadius
                    && Math.abs(z - junctionZ) < roadWidth / 2 + zRadius;
                return onMainRoad || onCrossRoad;
            });
        }

        function isScenerySlotBlocked(x, z, xRadius, zRadius, ignoredObject = null) {
            if (isJunctionRoadSlotBlocked(x, z, xRadius, zRadius)) return true;

            const sceneryGroups = [roadBridges, roadTrees, streetLights, sideBuildings, pedestrians];
            return sceneryGroups.some(group => group.some(object => {
                if (object === ignoredObject) return false;
                const bounds = object.userData.sceneryBounds;
                if (!bounds) return false;
                return Math.abs(x - object.position.x) < xRadius + bounds.xRadius
                    && Math.abs(z - object.position.z) < zRadius + bounds.zRadius;
            }));
        }

        function getSafeSceneryPlacement(x, candidateZ, xRadius, zRadius, ignoredObject = null) {
            let safeZ = getSafeSceneryZ(candidateZ, Math.max(34, zRadius + 4));
            let attempts = 0;
            while (isScenerySlotBlocked(x, safeZ, xRadius, zRadius, ignoredObject) && attempts < 80) {
                safeZ -= Math.max(8, zRadius * 2);
                attempts++;
            }
            return safeZ;
        }

        function createEnvironmentElements() {
            for (let z = -400; z <= 100; z += 40) {
                const safeStreetLightZ = getSafeSceneryZ(z, 34);
                if (safeStreetLightZ === z) spawnStreetLightPair(safeStreetLightZ);
            }

            let bridgeZ = -95;
            while (bridgeZ > -520) {
                const safeBridgeZ = getSafeSceneryZ(bridgeZ, 32);
                if (Math.random() < 0.72) createRoadBridge(safeBridgeZ);
                bridgeZ -= 105 + Math.random() * 95;
            }

            for (let z = -430; z <= 70; z += 24) {
                const nearJunction = junctions.some(junction => Math.abs(z - junction.position.z) < 30);
                if (nearJunction) continue;

                createRoadTree(-10.8, getSafeSceneryZ(z + Math.random() * 8 - 4, 34));
                createRoadTree(10.8, getSafeSceneryZ(z + Math.random() * 8 - 4, 34));
                if (Math.random() < 0.75) {
                    createRoadTree(-13.2, getSafeSceneryZ(z + 8 + Math.random() * 5, 34));
                    createRoadTree(13.2, getSafeSceneryZ(z + 8 + Math.random() * 5, 34));
                }

                if (Math.random() < 0.65) {
                    const side = Math.random() > 0.5 ? -1 : 1;
                    createPedestrian(side * 9.8, getSafeSceneryZ(z + Math.random() * 12 - 6, 34), side > 0 ? 1 : -1);
                }

                if (Math.random() < 0.45) {
                    const side = Math.random() > 0.5 ? -1 : 1;
                    const standingPerson = createPedestrian(side * 10.3, getSafeSceneryZ(z + 5 + Math.random() * 5, 34), 0);
                    standingPerson.userData.isStanding = true;
                }
            }

            for (let i = 0; i < 30; i++) {
                let building;
                const side = (i % 2 === 0) ? 1 : -1;
                const mod = i % 5;
                if (mod === 0) {
                    building = createFarmZone(side);
                } else if (mod === 1) {
                    building = createHospitalBuilding();
                } else if (mod === 2) {
                    building = createSchoolBuilding();
                } else if (mod === 3) {
                    building = createApartmentBuilding();
                } else {
                    building = createCyberBuilding();
                }

                const buildingX = side * (32 + Math.random() * 16);
                const buildingBounds = building.userData.sceneryBounds || { xRadius: 16, zRadius: 16 };
                building.position.set(
                    buildingX,
                    0,
                    getSafeSceneryPlacement(buildingX, -i * 38, buildingBounds.xRadius, buildingBounds.zRadius)
                );
                scene.add(building);
                sideBuildings.push(building);
            }
        }

        function spawnStreetLightPair(zPos) {
            const safeZ = getSafeSceneryPlacement(roadWidth / 2 + 1.5, zPos, 1.5, 1.2);
            const createPole = (side) => {
                const poleGroup = new THREE.Group();
                const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 7, 8);
                const poleMat = new THREE.MeshStandardMaterial({ color: 0x202535, metalness: 0.8 });
                const pole = new THREE.Mesh(poleGeo, poleMat);
                pole.position.y = 3.5;

                const armLength = 2.5;
                const armGeo = new THREE.BoxGeometry(armLength, 0.12, 0.12);
                const arm = new THREE.Mesh(armGeo, poleMat);
                const armOffsetX = -side * (armLength / 2);
                arm.position.set(armOffsetX, 6.8, 0);

                const fixtureGeo = new THREE.BoxGeometry(0.8, 0.2, 0.4);
                const fixtureMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
                const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
                const fixtureOffsetX = -side * armLength;
                fixture.position.set(fixtureOffsetX, 6.7, 0);

                const streetLightPoint = new THREE.PointLight(0xfffaed, 0.0, 45);
                streetLightPoint.position.set(fixtureOffsetX, 6.2, 0);

                poleGroup.add(pole, arm, fixture, streetLightPoint);
                poleGroup.position.set(side * (roadWidth / 2 + 1.5), 0, safeZ);
                poleGroup.userData.sceneryBounds = { xRadius: 1.5, zRadius: 1.2 };
                scene.add(poleGroup);
                streetLights.push(poleGroup);
            };
            createPole(-1);
            createPole(1);
        }

        
        function createRoadBridge(zPos) {
            const safeZ = getSafeSceneryPlacement(0, zPos, 15, 3.2);
            const bridgeGroup = new THREE.Group();
            const bridgeColor = Math.random() > 0.5 ? 0x242d3d : 0x33283b;
            const bridgeMat = new THREE.MeshStandardMaterial({
                color: bridgeColor,
                roughness: 0.55,
                metalness: 0.65
            });
            const edgeMat = new THREE.MeshStandardMaterial({
                color: 0x111827,
                roughness: 0.4,
                metalness: 0.8
            });
            const yellowMarkMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });

            // Main Bridge Deck spanning over the highway
            const deck = new THREE.Mesh(new THREE.BoxGeometry(38, 0.8, 6.5), bridgeMat);
            deck.position.y = 7.4;
            deck.castShadow = true;
            bridgeGroup.add(deck);

            // Upper bridge roadway lane markings
            for (let x = -16; x <= 16; x += 3.5) {
                const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.14), yellowMarkMat);
                dash.rotation.x = -Math.PI / 2;
                dash.position.set(x, 7.82, 0);
                bridgeGroup.add(dash);
            }

            // Towering Arch / Suspension Pylons
            [-1, 1].forEach(side => {
                const support = new THREE.Mesh(new THREE.BoxGeometry(2.2, 7.6, 4.2), bridgeMat);
                support.position.set(side * 12.5, 3.8, 0);
                support.castShadow = true;
                bridgeGroup.add(support);

                const upperRail = new THREE.Mesh(new THREE.BoxGeometry(38, 0.42, 0.35), edgeMat);
                upperRail.position.set(0, 8.25, side * 2.8);
                upperRail.castShadow = true;
                bridgeGroup.add(upperRail);

                // Suspension Cables / Arch Truss
                const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9.5, 1.2), bridgeMat);
                pylon.position.set(side * 12.5, 10.5, side * 2.8);
                bridgeGroup.add(pylon);

                // Aviation hazard beacon on top of bridge pylon
                const bBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
                bBeacon.position.set(side * 12.5, 15.5, side * 2.8);
                bridgeGroup.add(bBeacon);
            });

            // Roadway night illumination
            [-1, 1].forEach(side => {
                const light = new THREE.PointLight(side === 1 ? 0xff0055 : 0x00f0ff, 2.5, 18);
                light.position.set(side * 7, 7.1, 2.8);
                bridgeGroup.add(light);
            });

            // ── CONNECTED MOVING VEHICLES ON BRIDGE UPPER DECK ─────────
            const createBridgeCar = (dir, zOffset, colorHex) => {
                const carG = new THREE.Group();
                const bMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.25, metalness: 0.7 });
                const dMat = new THREE.MeshStandardMaterial({ color: 0x111116 });

                const cBody = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.6), bMat);
                cBody.position.y = 0.55;
                const cCab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.4), dMat);
                cCab.position.set(-0.2 * dir, 1.35, 0);
                carG.add(cBody, cCab);

                // Headlights
                const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.35), new THREE.MeshBasicMaterial({ color: 0xfffaea }));
                hl.position.set(dir * 1.65, 0.55, -0.4);
                const hl2 = hl.clone();
                hl2.position.z = 0.4;
                carG.add(hl, hl2);

                // Taillights
                const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.35), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
                tl.position.set(-dir * 1.65, 0.55, -0.4);
                const tl2 = tl.clone();
                tl2.position.z = 0.4;
                carG.add(tl, tl2);

                carG.position.set((Math.random() - 0.5) * 26, 7.8, zOffset);
                carG.userData = { speed: dir * (5.5 + Math.random() * 3.5) };
                bridgeGroup.add(carG);
                movingBridgeVehicles.push(carG);
            };

            createBridgeCar(1, -1.4, 0x00f0ff);  // left to right
            createBridgeCar(-1, 1.4, 0xff0055); // right to left

            bridgeGroup.position.set(0, 0, safeZ);
            bridgeGroup.userData.sceneryBounds = { xRadius: 18, zRadius: 3.5 };
            scene.add(bridgeGroup);
            roadBridges.push(bridgeGroup);
        }


        function createRoadTree(xPos, zPos) {
            const safeZ = getSafeSceneryPlacement(xPos, zPos, 1.4, 1.4);
            const treeGroup = new THREE.Group();
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.18, 0.26, 2.1, 8),
                new THREE.MeshStandardMaterial({ color: 0x765039, roughness: 0.9 })
            );
            trunk.position.y = 1.05;

            const canopy = new THREE.Mesh(
                new THREE.SphereGeometry(1.15, 10, 8),
                new THREE.MeshStandardMaterial({
                    color: Math.random() > 0.5 ? 0x2f8f46 : 0x3fa65a,
                    roughness: 0.95
                })
            );
            canopy.position.y = 2.45;
            canopy.scale.y = 1.15;

            treeGroup.add(trunk, canopy);
            treeGroup.position.set(xPos, 0, safeZ);
            treeGroup.userData.baseX = xPos;
            treeGroup.userData.sceneryBounds = { xRadius: 1.4, zRadius: 1.4 };
            scene.add(treeGroup);
            roadTrees.push(treeGroup);
        }

        function createPedestrian(xPos, zPos, direction, allowJunction = false) {
            const safeZ = allowJunction ? zPos : getSafeSceneryPlacement(xPos, zPos, 0.5, 0.5);
            const person = new THREE.Group();
            const outfitColors = [0x00a8cc, 0xe07a35, 0x8e5bd9, 0x2e9d62];
            const outfitColor = outfitColors[Math.floor(Math.random() * outfitColors.length)];
            const bodyMat = new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.75 });
            const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9825a, roughness: 0.85 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.8 });

            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.75, 7), bodyMat);
            body.position.y = 1.05;
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), skinMat);
            head.position.y = 1.65;

            const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.65, 6), darkMat);
            leftLeg.position.set(-0.12, 0.42, 0);
            const rightLeg = leftLeg.clone();
            rightLeg.position.x = 0.12;
            const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.65, 6), skinMat);
            leftArm.position.set(-0.3, 1.08, 0);
            leftArm.rotation.z = 0.15;
            const rightArm = leftArm.clone();
            rightArm.position.x = 0.3;
            rightArm.rotation.z = -0.15;

            person.add(body, head, leftLeg, rightLeg, leftArm, rightArm);
            person.position.set(xPos, 0, safeZ);
            person.rotation.y = direction > 0 ? 0 : Math.PI;
            person.userData.walkPhase = Math.random() * Math.PI * 2;
            person.userData.walkDirection = direction;
            person.userData.leftLeg = leftLeg;
            person.userData.rightLeg = rightLeg;
            person.userData.leftArm = leftArm;
            person.userData.rightArm = rightArm;
            person.userData.sceneryBounds = { xRadius: 0.5, zRadius: 0.5 };
            scene.add(person);
            pedestrians.push(person);
            return person;
        }

        
        // ═════════════════════════════════════════════════════════════════════
        // REALISTIC ANIMALS: COWS, GOATS, HORSES, HENS
        // ═════════════════════════════════════════════════════════════════════

        const animalAnimatedObjects = [];

        function createRealisticCow(isGrazing = false) {
            const cow = new THREE.Group();
            const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.85 });
            const blackSpotMat = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.85 });
            const pinkMat = new THREE.MeshStandardMaterial({ color: 0xefa2a8, roughness: 0.70 });
            const hornMat = new THREE.MeshStandardMaterial({ color: 0xd9cca8, roughness: 0.40 });
            const hoofMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.60 });

            // Torso (Holstein black & white spotted)
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.15, 2.20), whiteMat);
            body.position.y = 1.30;
            body.castShadow = true;
            cow.add(body);

            // Random black patches on torso
            const patch1 = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.65, 0.95), blackSpotMat);
            patch1.position.set(0.01, 1.35, -0.45);
            const patch2 = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.55, 0.75), blackSpotMat);
            patch2.position.set(-0.01, 1.25, 0.55);
            cow.add(patch1, patch2);

            // Udder
            const udder = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.55), pinkMat);
            udder.position.set(0, 0.65, 0.45);
            cow.add(udder);

            // 4 Legs with joints and hooves
            const addLeg = (x, z) => {
                const legGroup = new THREE.Group();
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.82, 8), whiteMat);
                leg.position.y = 0.41;
                leg.castShadow = true;
                const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.15, 8), hoofMat);
                hoof.position.y = 0.08;
                legGroup.add(leg, hoof);
                legGroup.position.set(x, 0, z);
                cow.add(legGroup);
            };
            addLeg(-0.48, -0.75);
            addLeg(0.48, -0.75);
            addLeg(-0.48, 0.75);
            addLeg(0.48, 0.75);

            // Head & Neck
            const headGroup = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.75), whiteMat);
            neck.position.set(0, 1.55, -1.25);
            neck.rotation.x = isGrazing ? 0.45 : -0.25;
            cow.add(neck);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.65, 0.85), whiteMat);
            head.position.set(0, isGrazing ? 1.05 : 1.78, isGrazing ? -1.85 : -1.65);
            head.rotation.x = isGrazing ? 0.35 : 0;
            cow.add(head);

            // Head black face patch
            const facePatch = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.45, 0.45), blackSpotMat);
            facePatch.position.set(0.1, head.position.y + 0.12, head.position.z + 0.1);
            cow.add(facePatch);

            // Pink Snout & Muzzle
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.42), pinkMat);
            snout.position.set(0, head.position.y - 0.18, head.position.z - 0.45);
            cow.add(snout);

            // Nostrils
            [-0.14, 0.14].forEach(x => {
                const nostril = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), blackSpotMat);
                nostril.position.set(x, snout.position.y, snout.position.z - 0.22);
                cow.add(nostril);
            });

            // Horns (curving up and out)
            [-0.34, 0.34].forEach((x, i) => {
                const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.38, 8), hornMat);
                horn.position.set(x, head.position.y + 0.42, head.position.z);
                horn.rotation.z = i === 0 ? 0.35 : -0.35;
                horn.rotation.x = -0.15;
                cow.add(horn);

                const ear = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.14), whiteMat);
                ear.position.set(i === 0 ? x - 0.16 : x + 0.16, head.position.y + 0.22, head.position.z + 0.1);
                ear.rotation.z = i === 0 ? -0.25 : 0.25;
                cow.add(ear);
            });

            // Swishing Tail
            const tailGroup = new THREE.Group();
            tailGroup.position.set(0, 1.75, 1.10);
            const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 6), whiteMat);
            tail.position.y = -0.42;
            const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), blackSpotMat);
            tuft.position.y = -0.85;
            tailGroup.add(tail, tuft);
            cow.add(tailGroup);

            cow.userData = {
                type: 'cow',
                tail: tailGroup,
                animPhase: Math.random() * Math.PI * 2
            };
            animalAnimatedObjects.push(cow);

            return cow;
        }

        function createRealisticGoat() {
            const goat = new THREE.Group();
            const goatMat = new THREE.MeshStandardMaterial({ color: 0xded8ce, roughness: 0.85 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 0.8 });
            const hornMat = new THREE.MeshStandardMaterial({ color: 0x302a24, roughness: 0.5 });
            const pinkMat = new THREE.MeshStandardMaterial({ color: 0xdd9999, roughness: 0.7 });

            // Compact agile torso
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.70, 1.25), goatMat);
            body.position.y = 0.85;
            goat.add(body);

            // 4 Slender legs
            const addLeg = (x, z) => {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.65, 8), goatMat);
                leg.position.set(x, 0.32, z);
                goat.add(leg);
            };
            addLeg(-0.28, -0.45);
            addLeg(0.28, -0.45);
            addLeg(-0.28, 0.45);
            addLeg(0.28, 0.45);

            // Slender neck & head
            const neck = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 0.42), goatMat);
            neck.position.set(0, 1.10, -0.65);
            neck.rotation.x = -0.45;
            goat.add(neck);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.55), goatMat);
            head.position.set(0, 1.35, -0.92);
            goat.add(head);

            // Muzzle & Goatee Beard
            const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.28), pinkMat);
            muzzle.position.set(0, 1.25, -1.22);
            goat.add(muzzle);

            const beard = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 6), darkMat);
            beard.position.set(0, 1.05, -1.20);
            beard.rotation.x = 0.2;
            goat.add(beard);

            // Backward-curving ribbed horns
            [-0.14, 0.14].forEach((x, i) => {
                const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.45, 8), hornMat);
                horn.position.set(x, 1.62, -0.95);
                horn.rotation.x = 0.55;
                horn.rotation.z = i === 0 ? 0.15 : -0.15;
                goat.add(horn);

                const ear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.08), goatMat);
                ear.position.set(i === 0 ? x - 0.12 : x + 0.12, 1.45, -0.85);
                goat.add(ear);
            });

            // Short perky tail
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), goatMat);
            tail.position.set(0, 1.12, 0.65);
            tail.rotation.x = -0.65;
            goat.add(tail);

            goat.userData = { type: 'goat', animPhase: Math.random() * Math.PI * 2 };
            animalAnimatedObjects.push(goat);

            return goat;
        }

        function createRealisticHorse() {
            const horse = new THREE.Group();
            const coatColors = [0x5c3317, 0x2b1d0c, 0x8a5024, 0x151210];
            const coatMat = new THREE.MeshStandardMaterial({
                color: coatColors[Math.floor(Math.random() * coatColors.length)],
                roughness: 0.65,
                metalness: 0.15
            });
            const maneMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
            const blazeMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.7 });
            const hoofMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.5 });

            // Muscular torso
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.15, 2.35), coatMat);
            body.position.y = 1.62;
            body.castShadow = true;
            horse.add(body);

            // Hindquarters curve
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.68, 10, 8), coatMat);
            rump.position.set(0, 1.70, 0.95);
            horse.add(rump);

            // 4 Graceful legs with fetlocks & hooves
            const addHorseLeg = (x, z) => {
                const legGroup = new THREE.Group();
                const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.65, 8), coatMat);
                upper.position.y = 0.75;
                const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.08, 0.65, 8), coatMat);
                lower.position.y = 0.25;
                const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), hoofMat);
                hoof.position.y = 0.07;
                legGroup.add(upper, lower, hoof);
                legGroup.position.set(x, 0, z);
                horse.add(legGroup);
            };
            addHorseLeg(-0.45, -0.85);
            addHorseLeg(0.45, -0.85);
            addHorseLeg(-0.45, 0.85);
            addHorseLeg(0.45, 0.85);

            // Arched powerful neck
            const neck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.10, 0.85), coatMat);
            neck.position.set(0, 2.25, -1.15);
            neck.rotation.x = -0.55;
            horse.add(neck);

            // Dark flowing mane along crest
            const mane = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.45), maneMat);
            mane.position.set(0, 2.45, -1.05);
            mane.rotation.x = -0.55;
            horse.add(mane);

            // Equine head & white blaze marking
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.95), coatMat);
            head.position.set(0, 2.65, -1.65);
            head.rotation.x = 0.25;
            horse.add(head);

            const blaze = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.48, 0.12), blazeMat);
            blaze.position.set(0, 2.70, -1.78);
            blaze.rotation.x = 0.25;
            horse.add(blaze);

            // Muzzle
            const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.35, 0.38), coatMat);
            muzzle.position.set(0, 2.40, -2.10);
            horse.add(muzzle);

            // Pricked ears
            [-0.18, 0.18].forEach(x => {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 6), coatMat);
                ear.position.set(x, 3.05, -1.45);
                ear.rotation.x = 0.2;
                horse.add(ear);
            });

            // Flowing tail
            const tailGroup = new THREE.Group();
            tailGroup.position.set(0, 2.05, 1.25);
            const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.25, 8), maneMat);
            tail.position.set(0, -0.62, 0.25);
            tail.rotation.x = 0.32;
            tailGroup.add(tail);
            horse.add(tailGroup);

            horse.userData = { type: 'horse', tail: tailGroup, animPhase: Math.random() * Math.PI * 2 };
            animalAnimatedObjects.push(horse);

            return horse;
        }

        function createRealisticHen() {
            const hen = new THREE.Group();
            const featherColors = [0xf5f5f5, 0xa64b2a, 0xddaa55];
            const featherMat = new THREE.MeshStandardMaterial({
                color: featherColors[Math.floor(Math.random() * featherColors.length)],
                roughness: 0.8
            });
            const redMat = new THREE.MeshStandardMaterial({ color: 0xdd1122, roughness: 0.6 });
            const beakMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.4 });
            const legMat = new THREE.MeshStandardMaterial({ color: 0xee9900, roughness: 0.5 });

            // Plump feathery body
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), featherMat);
            body.position.y = 0.38;
            body.scale.set(0.9, 1.0, 1.25);
            hen.add(body);

            // Tail feathers
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.38, 6), featherMat);
            tail.position.set(0, 0.55, 0.32);
            tail.rotation.x = -0.75;
            hen.add(tail);

            // Neck & Head with pecking animation
            const neckGroup = new THREE.Group();
            neckGroup.position.set(0, 0.42, -0.22);

            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 0.28, 8), featherMat);
            neck.position.y = 0.14;
            neckGroup.add(neck);

            const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), featherMat);
            head.position.set(0, 0.28, -0.05);
            neckGroup.add(head);

            // Red Comb on top
            const comb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.22), redMat);
            comb.position.set(0, 0.41, -0.05);
            neckGroup.add(comb);

            // Wattles under beak
            const wattle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.08), redMat);
            wattle.position.set(0, 0.19, -0.15);
            neckGroup.add(wattle);

            // Yellow Beak
            const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), beakMat);
            beak.rotation.x = -Math.PI / 2;
            beak.position.set(0, 0.27, -0.22);
            neckGroup.add(beak);

            hen.add(neckGroup);

            // Slender yellow legs & clawed feet
            [-0.09, 0.09].forEach(x => {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), legMat);
                leg.position.set(x, 0.11, 0);
                hen.add(leg);
            });

            hen.userData = {
                type: 'hen',
                neck: neckGroup,
                animPhase: Math.random() * Math.PI * 2
            };
            animalAnimatedObjects.push(hen);

            return hen;
        }

        // ═════════════════════════════════════════════════════════════════════
        // RURAL FARMS: PASTURE, RED BARN, GRAIN SILO, HAY BALES, ANIMALS
        // ═════════════════════════════════════════════════════════════════════
        function createFarmZone(side = 1) {
            const group = new THREE.Group();
            const farmWidth = 36;
            const farmDepth = 48;

            const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5530, roughness: 0.9 });
            const barnRedMat = new THREE.MeshStandardMaterial({ color: 0xa8201a, roughness: 0.65 });
            const barnRoofMat = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.7 });
            const whiteTrimMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });
            const siloMat = new THREE.MeshStandardMaterial({ color: 0xa0a8b0, roughness: 0.35, metalness: 0.8 });
            const hayMat = new THREE.MeshStandardMaterial({ color: 0xdbad40, roughness: 0.95 });
            const pastureGrassMat = new THREE.MeshStandardMaterial({ color: 0x3d7028, roughness: 0.9 });

            // Pasture Ground Plot
            const plot = new THREE.Mesh(new THREE.PlaneGeometry(farmWidth, farmDepth), pastureGrassMat);
            plot.rotation.x = -Math.PI / 2;
            plot.position.set(0, 0.02, 0);
            plot.receiveShadow = true;
            group.add(plot);

            // Rustic Split-Rail Wooden Fence around pasture
            const addFenceLine = (start, end, numPosts = 6) => {
                for (let i = 0; i <= numPosts; i++) {
                    const t = i / numPosts;
                    const x = THREE.MathUtils.lerp(start[0], end[0], t);
                    const z = THREE.MathUtils.lerp(start[1], end[1], t);

                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.45, 6), woodMat);
                    post.position.set(x, 0.72, z);
                    group.add(post);
                }
                // Two horizontal rails
                [0.55, 1.05].forEach(y => {
                    const dx = end[0] - start[0];
                    const dz = end[1] - start[1];
                    const len = Math.hypot(dx, dz);
                    const angle = Math.atan2(dx, dz);
                    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, len), woodMat);
                    rail.position.set((start[0] + end[0]) / 2, y, (start[1] + end[1]) / 2);
                    rail.rotation.y = angle;
                    group.add(rail);
                });
            };

            const hw = farmWidth / 2;
            const hd = farmDepth / 2;
            addFenceLine([-hw, -hd], [hw, -hd], 7);
            addFenceLine([-hw, hd], [hw, hd], 7);
            addFenceLine([-hw, -hd], [-hw, hd], 9);

            // Traditional American Red Barn with gambrel roof
            const barnGroup = new THREE.Group();
            const bWidth = 14, bHeight = 9, bDepth = 18;
            const barnWalls = new THREE.Mesh(new THREE.BoxGeometry(bWidth, bHeight, bDepth), barnRedMat);
            barnWalls.position.set(0, bHeight / 2, 0);
            barnWalls.castShadow = true;
            barnGroup.add(barnWalls);

            // Barn White Trim & Sliding Cross-braced Doors
            const door = new THREE.Mesh(new THREE.BoxGeometry(4.2, 5.2, 0.2), whiteTrimMat);
            door.position.set(0, 2.6, bDepth / 2 + 0.1);
            barnGroup.add(door);

            // Barn Gambrel Roof
            const roof = new THREE.Mesh(new THREE.ConeGeometry(bWidth * 0.82, 4.5, 4), barnRoofMat);
            roof.rotation.y = Math.PI / 4;
            roof.position.set(0, bHeight + 2.2, 0);
            roof.scale.set(1.0, 1.0, bDepth / bWidth);
            roof.castShadow = true;
            barnGroup.add(roof);

            barnGroup.position.set(side * 8, 0, -8);
            group.add(barnGroup);

            // Tall Corrugated Grain Silo
            const siloGroup = new THREE.Group();
            const siloCyl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 14, 20), siloMat);
            siloCyl.position.y = 7;
            siloCyl.castShadow = true;
            const siloDome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), siloMat);
            siloDome.position.y = 14;
            siloGroup.add(siloCyl, siloDome);
            siloGroup.position.set(side * 8 + (side > 0 ? -9 : 9), 0, -8);
            group.add(siloGroup);

            // Golden Hay Bales (Round rolls & Rectangular stacks)
            const addHayBale = (x, z, isRound = true) => {
                if (isRound) {
                    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 16), hayMat);
                    bale.rotation.z = Math.PI / 2;
                    bale.position.set(x, 0.9, z);
                    bale.castShadow = true;
                    group.add(bale);
                } else {
                    const bale = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.9), hayMat);
                    bale.position.set(x, 0.4, z);
                    bale.castShadow = true;
                    group.add(bale);
                }
            };
            addHayBale(-4, 6, true);
            addHayBale(-1.8, 6, true);
            addHayBale(-2.9, 7.5, true);
            addHayBale(8, 12, false);
            addHayBale(8, 13.8, false);

            // Wooden Water & Feed Troughs
            const trough = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 3.2), woodMat);
            trough.position.set(-6, 0.28, -2);
            group.add(trough);

            // Populate Pasture with Realistic Animals:
            // 1. Cows (spotted, grazing and standing)
            const cow1 = createRealisticCow(true);
            cow1.position.set(-6, 0, 4);
            cow1.rotation.y = 0.8;
            group.add(cow1);

            const cow2 = createRealisticCow(false);
            cow2.position.set(2, 0, 8);
            cow2.rotation.y = -1.2;
            group.add(cow2);

            // 2. Goats
            const goat1 = createRealisticGoat();
            goat1.position.set(-8, 0, 10);
            goat1.rotation.y = 1.6;
            group.add(goat1);

            const goat2 = createRealisticGoat();
            goat2.position.set(-4, 0, 14);
            goat2.rotation.y = -0.5;
            group.add(goat2);

            // 3. Horses
            const horse1 = createRealisticHorse();
            horse1.position.set(6, 0, 4);
            horse1.rotation.y = 2.4;
            group.add(horse1);

            const horse2 = createRealisticHorse();
            horse2.position.set(-2, 0, -12);
            horse2.rotation.y = 0.3;
            group.add(horse2);

            // 4. Hens / Chickens pecking around yard
            for (let i = 0; i < 4; i++) {
                const hen = createRealisticHen();
                hen.position.set(1 + Math.random() * 4, 0, 12 + Math.random() * 6);
                hen.rotation.y = Math.random() * Math.PI * 2;
                group.add(hen);
            }

            group.userData.sceneryBounds = { xRadius: farmWidth / 2, zRadius: farmDepth / 2 };
            return group;
        }

        // ═════════════════════════════════════════════════════════════════════
        // ARCHITECTURE: SCHOOLS, HOSPITALS, APARTMENTS
        // ═════════════════════════════════════════════════════════════════════

        function createSchoolBuilding() {
            const group = new THREE.Group();
            const width = 28, height = 15, depth = 22;

            const brickMat = new THREE.MeshStandardMaterial({ color: 0x9e3d2b, roughness: 0.85 });
            const roofMat = new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.7 });
            const stoneMat = new THREE.MeshStandardMaterial({ color: 0xded8ce, roughness: 0.75 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f2033, roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.85 });
            const signMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });

            // Main school academy building
            const mainWing = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), brickMat);
            mainWing.position.y = height / 2;
            mainWing.castShadow = true;
            group.add(mainWing);

            // Pitched Academy Roof
            const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.75, 5, 4), roofMat);
            roof.rotation.y = Math.PI / 4;
            roof.position.set(0, height + 2.5, 0);
            roof.scale.set(1.0, 1.0, depth / width);
            group.add(roof);

            // Central Clock Tower with illuminated clock face
            const tower = new THREE.Mesh(new THREE.BoxGeometry(5.5, 9, 5.5), stoneMat);
            tower.position.set(0, height + 4.5, depth / 2 - 2.8);
            const spire = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5.5, 4), roofMat);
            spire.rotation.y = Math.PI / 4;
            spire.position.set(0, height + 11.5, depth / 2 - 2.8);
            group.add(tower, spire);

            // Glowing Clock Face
            const clock = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 24), new THREE.MeshBasicMaterial({ color: 0xfffaea }));
            clock.rotation.x = Math.PI / 2;
            clock.position.set(0, height + 6.2, depth / 2 + 0.1);
            group.add(clock);

            // School illuminated signage
            const signBar = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 0.4), new THREE.MeshBasicMaterial({ color: 0x111116 }));
            signBar.position.set(0, height - 1.2, depth / 2 + 0.25);
            const signText = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 0.5), signMat);
            signText.position.set(0, height - 1.2, depth / 2 + 0.28);
            group.add(signBar, signText);

            // Large window grids
            for (let f = 1; f <= 3; f++) {
                for (let c = -4; c <= 4; c++) {
                    if (Math.abs(c) < 1 && f === 1) continue; // entrance door below
                    const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.1), glassMat);
                    win.position.set(c * 2.8, f * 3.8 - 0.5, depth / 2 + 0.08);
                    group.add(win);
                }
            }

            // School yard: Basketball court with hoop & flagpole
            const courtMat = new THREE.MeshStandardMaterial({ color: 0x2e6b4d, roughness: 0.85 });
            const court = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), courtMat);
            court.rotation.x = -Math.PI / 2;
            court.position.set(width / 2 + 9, 0.04, 0);
            group.add(court);

            // Basketball Hoop
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.8, 8), stoneMat);
            pole.position.set(width / 2 + 16, 1.9, 0);
            const backboard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.8), whiteTrimMat);
            backboard.position.set(width / 2 + 15.8, 3.4, 0);
            const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 8, 16), new THREE.MeshBasicMaterial({ color: 0xff4400 }));
            hoop.rotation.x = Math.PI / 2;
            hoop.position.set(width / 2 + 15.2, 3.0, 0);
            group.add(pole, backboard, hoop);

            // Flagpole with fluttering flag
            const fPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 8.5, 8), stoneMat);
            fPole.position.set(0, 4.25, depth / 2 + 5.5);
            const flag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 1.8), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
            flag.position.set(0.9, 7.8, depth / 2 + 5.5);
            group.add(fPole, flag);

            // Yellow School Bus parked at school drop-off
            const bus = createSchoolBus();
            bus.scale.set(0.85, 0.85, 0.85);
            bus.position.set(-width / 2 - 4.5, 0, depth / 2 + 2);
            bus.rotation.y = Math.PI;
            group.add(bus);

            group.userData.sceneryBounds = { xRadius: (width + 20) / 2, zRadius: (depth + 14) / 2 };
            return group;
        }

        function createHospitalBuilding() {
            const group = new THREE.Group();
            const width = 30, height = 24, depth = 22;

            const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.25, metalness: 0.35 });
            const cyanMat = new THREE.MeshStandardMaterial({ color: 0x00c4cc, roughness: 0.3, metalness: 0.5 });
            const redCrossMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a334d, roughness: 0.05, metalness: 0.95, transparent: true, opacity: 0.85 });

            // Main Modern Hospital Complex (Tiered multi-wing)
            const mainTower = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), whiteMat);
            mainTower.position.y = height / 2;
            mainTower.castShadow = true;
            group.add(mainTower);

            // Cyan architectural accent bands
            const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 1.5, depth + 0.2), cyanMat);
            band.position.y = height * 0.75;
            group.add(band);

            // Glowing 3D Red Cross (+) on front facade
            const crossGroup = new THREE.Group();
            crossGroup.position.set(0, height * 0.82, depth / 2 + 0.2);
            const crossV = new THREE.Mesh(new THREE.BoxGeometry(1.6, 5.2, 0.35), redCrossMat);
            const crossH = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 0.35), redCrossMat);
            crossGroup.add(crossV, crossH);
            group.add(crossGroup);

            // Rooftop Helipad with bold 'H' circle and perimeter beacon lights
            const helipad = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.35, 32), new THREE.MeshStandardMaterial({ color: 0x222630 }));
            helipad.position.set(0, height + 0.2, 0);
            const hLetter = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 3.5), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
            hLetter.position.set(0, height + 0.4, 0);
            group.add(helipad, hLetter);

            // Helipad perimeter beacon lights
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
                beacon.position.set(Math.cos(angle) * 5.2, height + 0.4, Math.sin(angle) * 5.2);
                group.add(beacon);
            }

            // Emergency (ER) Ambulance Bay with glowing marquee
            const erBay = new THREE.Mesh(new THREE.BoxGeometry(12, 4.5, 7.5), whiteMat);
            erBay.position.set(0, 2.25, depth / 2 + 3.75);
            const erSign = new THREE.Mesh(new THREE.BoxGeometry(10, 0.9, 0.2), redCrossMat);
            erSign.position.set(0, 4.0, depth / 2 + 7.55);
            group.add(erBay, erSign);

            // Parked Ambulance outside the ER Bay
            const amb = createAmbulance();
            amb.scale.set(0.9, 0.9, 0.9);
            amb.position.set(0, 0, depth / 2 + 5.5);
            group.add(amb);

            // Window Arrays
            for (let r = 1; r <= 5; r++) {
                for (let c = -4; c <= 4; c++) {
                    const win = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.0, 0.1), glassMat);
                    win.position.set(c * 3.1, r * 3.8, depth / 2 + 0.08);
                    group.add(win);
                }
            }

            group.userData.sceneryBounds = { xRadius: width / 2 + 4, zRadius: (depth + 14) / 2 };
            return group;
        }

        function createApartmentBuilding() {
            const group = new THREE.Group();
            const floors = 8 + Math.floor(Math.random() * 4);
            const floorHeight = 3.6;
            const height = floors * floorHeight;
            const width = 18;
            const depth = 18;

            const concreteMat = new THREE.MeshStandardMaterial({ color: 0x232732, roughness: 0.65 });
            const accentWoodMat = new THREE.MeshStandardMaterial({ color: 0x9c6644, roughness: 0.5 });
            const glassBalconyMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.1, transparent: true, opacity: 0.65 });
            const windowLitMat = new THREE.MeshBasicMaterial({ color: 0xfffaea });
            const windowDarkMat = new THREE.MeshStandardMaterial({ color: 0x0d141f, roughness: 0.2 });

            // Main residential tower
            const tower = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), concreteMat);
            tower.position.y = height / 2;
            tower.castShadow = true;
            group.add(tower);

            // Recessed Balconies & Glass Balustrades on every floor
            for (let f = 1; f < floors; f++) {
                const y = f * floorHeight;
                [-1, 1].forEach(side => {
                    const balconySlab = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.35, 2.2), accentWoodMat);
                    balconySlab.position.set(side * 4.2, y, depth / 2 + 1.1);
                    const balustrade = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.95, 0.1), glassBalconyMat);
                    balustrade.position.set(side * 4.2, y + 0.55, depth / 2 + 2.15);
                    group.add(balconySlab, balustrade);

                    // Potted green plants on balconies
                    if (Math.random() > 0.4) {
                        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.4, 8), accentWoodMat);
                        pot.position.set(side * 4.2 + 2.2, y + 0.35, depth / 2 + 1.6);
                        const plant = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2e8b57 }));
                        plant.position.set(side * 4.2 + 2.2, y + 0.68, depth / 2 + 1.6);
                        group.add(pot, plant);
                    }
                });

                // Window illumination
                [-6, 0, 6].forEach(x => {
                    const isLit = Math.random() > 0.4;
                    const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.08), isLit ? windowLitMat : windowDarkMat);
                    win.position.set(x, y + 1.2, depth / 2 + 0.06);
                    group.add(win);
                });
            }

            // Rooftop Architecture: Elevator penthouse, dual water tanks, satellite dishes
            const penthouse = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.2, 6.5), concreteMat);
            penthouse.position.set(0, height + 1.6, 0);
            group.add(penthouse);

            // Water storage tanks
            [-3.5, 3.5].forEach(x => {
                const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.8, 16), new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.7 }));
                tank.position.set(x, height + 1.4, -4.5);
                group.add(tank);
            });

            // Red Aviation Warning Beacon on top
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0022 }));
            beacon.position.set(0, height + 4.2, 0);
            group.add(beacon);

            group.userData.sceneryBounds = { xRadius: width / 2 + 3, zRadius: depth / 2 + 3 };
            return group;
        }

        function createCyberBuilding() {
            const height = 25 + Math.random() * 55;
            const width = 14 + Math.random() * 8;
            const depth = 14 + Math.random() * 8;

            const group = new THREE.Group();

            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#090c14';
            ctx.fillRect(0, 0, 128, 128);

            const rows = 4;
            const cols = 3;
            const w = 128 / cols;
            const h = 128 / rows;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (Math.random() > 0.4) {
                        const windowColors = ['#fffaed', '#fff5e6', '#fef3c7', '#e2e8f0'];
                        ctx.fillStyle = windowColors[Math.floor(Math.random() * windowColors.length)];
                        ctx.fillRect(c * w + 8, r * h + 8, w - 16, h - 16);
                    }
                }
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(width / 6, height / 12);

            const bGeo = new THREE.BoxGeometry(width, height, depth);
            const bMat = new THREE.MeshStandardMaterial({
                color: 0x141824,
                roughness: 0.4,
                metalness: 0.8,
                emissiveMap: texture,
                emissive: 0xffffff,
                emissiveIntensity: 0.85
            });

            const building = new THREE.Mesh(bGeo, bMat);
            building.position.y = height / 2;
            building.castShadow = true;
            building.receiveShadow = true;
            group.add(building);
            group.userData.sceneryBounds = { xRadius: width / 2, zRadius: depth / 2 };

            return group;
        }

        // Maximum NPC vehicles allowed on road at once (prevents overcrowding)
        const MAX_TRAFFIC_CARS = 6;

        function spawnTraffic() {
            // In multiplayer mode the CLIENT never spawns its own traffic.
            // Only the HOST spawns NPCs; the client mirrors them via network.
            if (typeof isMultiplayerMode !== 'undefined' && isMultiplayerMode &&
                typeof myPlayerSlot !== 'undefined' && myPlayerSlot === 'client') return;

            if (currentSpeed > 0.05 && Math.random() < 0.025 && trafficCars.length < MAX_TRAFFIC_CARS) {
                const randomLane = laneXPositions[Math.floor(Math.random() * laneXPositions.length)];
                const spawnZ = -160;
                const exists = trafficCars.some(car => car.position.z < -130
                    && Math.abs(car.position.x - randomLane) < 1.5
                    && Math.abs(car.position.z + 160) < minimumVehicleCenterDistance);

                // Prevent all 3 lanes being occupied near the same Z (road blocking check):
                // Count how many distinct lanes are already occupied within 30 units of spawn point
                if (!exists) {
                    const lanesOccupiedNearSpawn = new Set(
                        trafficCars
                            .filter(car => Math.abs(car.position.z - spawnZ) < 30)
                            .map(car => laneXPositions.reduce((closest, lx) =>
                                Math.abs(lx - car.position.x) < Math.abs(closest - car.position.x) ? lx : closest,
                                laneXPositions[0]
                            ))
                    );
                    // Block spawn if it would fill all 3 lanes at approximately the same depth
                    const wouldBlockAllLanes = lanesOccupiedNearSpawn.size >= (laneXPositions.length - 1)
                        && lanesOccupiedNearSpawn.has(randomLane);

                    if (!wouldBlockAllLanes) {
                        const vehicleTypes = ['car', 'truck', 'schoolbus', 'thar', 'bike', 'police', 'ambulance'];
                        const chosenType = vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];

                        let trafficCar;
                        if (chosenType === 'truck') trafficCar = createTataTruck();
                        else if (chosenType === 'schoolbus') trafficCar = createSchoolBus();
                        else if (chosenType === 'thar') trafficCar = createMahindraThar();
                        else if (chosenType === 'bike') trafficCar = createMotorcycle();
                        else if (chosenType === 'police') trafficCar = createPoliceCar();
                        else if (chosenType === 'ambulance') trafficCar = createAmbulance();
                        else trafficCar = createRealisticCar(0x1e90ff);

                        trafficCar.userData = {
                            laneX: randomLane,
                            targetX: randomLane,
                            speedBoost: 0,
                            cruiseSpeed: 0.09 + Math.random() * 0.07,
                            isYielding: false,
                            stoppedForLight: false,
                            npcType: chosenType   // used for client-side spawning
                        };

                        trafficCar.position.set(randomLane, 0, spawnZ);
                        scene.add(trafficCar);
                        trafficCars.push(trafficCar);
                    }
                }
            }

            if (trafficLightState === 'RED') {
                signalSections.forEach(signalSection => {
                    const signalVisible = signalSection.position.z > -260 && signalSection.position.z < 20;
                    const hasCrossingPeople = junctionPedestrians.some(person => person.userData.signalSection === signalSection);
                    const pedestrianCycleUntil = signalSection.userData.pedestrianCycleUntil || 0;
                    if (!signalVisible) return;

                    if (!hasCrossingPeople && gameTime >= pedestrianCycleUntil) {
                        for (let index = 0; index < 3; index++) {
                            const forwardPerson = createPedestrian(-10 - index * 0.55, signalSection.position.z + index * 0.7, 1, true);
                            forwardPerson.userData.isJunctionCrossing = true;
                            forwardPerson.userData.signalSection = signalSection;
                            junctionPedestrians.push(forwardPerson);

                            const returnPerson = createPedestrian(10 + index * 0.55, signalSection.position.z - index * 0.7, -1, true);
                            returnPerson.userData.isJunctionCrossing = true;
                            returnPerson.userData.signalSection = signalSection;
                            junctionPedestrians.push(returnPerson);
                        }
                        signalSection.userData.pedestrianCycleUntil = gameTime + 8;
                    }
                });
            }
        }

        function updateJunctionPedestrians(delta) {
            for (let index = junctionPedestrians.length - 1; index >= 0; index--) {
                const person = junctionPedestrians[index];
                const playerDistance = playerCar.position.z - person.position.z;
                const playerApproachingCrossing = currentSpeed > 0.05
                    && playerDistance > -2
                    && playerDistance < 8
                    && Math.abs(playerCar.position.x - person.position.x) < 2.4;
                if (playerApproachingCrossing) continue;

                person.position.x += person.userData.walkDirection * delta * 4.2;
                const step = Math.sin(person.userData.walkPhase) * 0.45;
                person.userData.walkPhase += delta * 7;
                person.userData.leftLeg.rotation.x = step;
                person.userData.rightLeg.rotation.x = -step;
                person.userData.leftArm.rotation.x = -step * 0.7;
                person.userData.rightArm.rotation.x = step * 0.7;

                if (Math.abs(person.position.x) > 9.5) {
                    scene.remove(person);
                    junctionPedestrians.splice(index, 1);
                    const pedestrianIndex = pedestrians.indexOf(person);
                    if (pedestrianIndex !== -1) pedestrians.splice(pedestrianIndex, 1);
                }
            }
        }

        function keepTrafficSeparated() {
            const minimumGap = minimumVehicleCenterDistance;

            for (let firstIndex = 0; firstIndex < trafficCars.length; firstIndex++) {
                const firstCar = trafficCars[firstIndex];
                for (let secondIndex = firstIndex + 1; secondIndex < trafficCars.length; secondIndex++) {
                    const secondCar = trafficCars[secondIndex];
                    if (Math.abs(firstCar.position.x - secondCar.position.x) > 2.2) continue;

                    const distance = Math.abs(firstCar.position.z - secondCar.position.z);
                    if (distance >= minimumGap) continue;

                    if (firstCar.position.z > secondCar.position.z) {
                        secondCar.position.z = firstCar.position.z - minimumGap;
                    } else {
                        firstCar.position.z = secondCar.position.z - minimumGap;
                    }
                }
            }

            // Anti-road-block: prevent 3 NPCs from filling all 3 lanes at the same Z position.
            // Find clusters of cars within a 15-unit Z window that cover all 3 lanes,
            // then push the rearmost car back to break the blockade.
            if (trafficCars.length >= laneXPositions.length) {
                for (let fi = 0; fi < trafficCars.length; fi++) {
                    const anchor = trafficCars[fi];
                    const cluster = trafficCars.filter(c =>
                        Math.abs(c.position.z - anchor.position.z) < 15
                    );
                    if (cluster.length < laneXPositions.length) continue;

                    // Check if all lanes are covered by this cluster
                    const coveredLanes = new Set(
                        cluster.map(c => laneXPositions.reduce((best, lx) =>
                            Math.abs(lx - c.position.x) < Math.abs(best - c.position.x) ? lx : best,
                            laneXPositions[0]
                        ))
                    );
                    if (coveredLanes.size >= laneXPositions.length) {
                        // Stagger the rearmost car (lowest Z) further back by 20 units
                        const rearmost = cluster.reduce((r, c) => c.position.z < r.position.z ? c : r, cluster[0]);
                        if (!rearmost.userData.stoppedForLight) {
                            rearmost.position.z -= 20;
                        }
                        break; // Only fix one cluster per frame to avoid jitter
                    }
                }
            }

            for (let firstIndex = 0; firstIndex < crossTrafficCars.length; firstIndex++) {
                const firstCar = crossTrafficCars[firstIndex];
                for (let secondIndex = firstIndex + 1; secondIndex < crossTrafficCars.length; secondIndex++) {
                    const secondCar = crossTrafficCars[secondIndex];
                    if (Math.abs(firstCar.position.z - secondCar.position.z) > 2.2) continue;

                    const distance = Math.abs(firstCar.position.x - secondCar.position.x);
                    if (distance >= minimumGap) continue;

                    if (firstCar.position.x > secondCar.position.x) {
                        secondCar.position.x = firstCar.position.x - minimumGap;
                    } else {
                        firstCar.position.x = secondCar.position.x - minimumGap;
                    }
                }
            }
        }

        // --- CONTROLS LISTENERS ---
        window.addEventListener('keydown', (e) => {
            if (isPaused) return;
            const code = e.code;
            const key = e.key.toLowerCase();

            pressedKeys[code] = true;
            pressedKeys[key] = true;

            if ((key === 'h' || code === 'Space') && isGameRunning) {
                triggerSmartHornAI();
            }

            if ((code === 'ShiftLeft' || code === 'ShiftRight' || key === 'shift') && !e.repeat) {
                if (isGameRunning) {
                    isSuperBoostActive = !isSuperBoostActive;
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            const code = e.code;
            const key = e.key.toLowerCase();

            delete pressedKeys[code];
            delete pressedKeys[key];
        });

        function isKeyPressed(keyName, codeName) {
            return !!(pressedKeys[keyName] || pressedKeys[codeName]);
        }

        function clearPressedKeys() {
            Object.keys(pressedKeys).forEach(key => delete pressedKeys[key]);
            document.querySelectorAll('.t-btn.pressed').forEach(button => button.classList.remove('pressed'));
        }

        window.addEventListener('blur', clearPressedKeys);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) clearPressedKeys();
        });

        function setupTouchListeners() {
            const bindTouch = (id, keyName, codeName) => {
                const el = document.getElementById(id);
                if (!el) return;
                const pressOn = (e) => { e.preventDefault(); pressedKeys[keyName] = true; pressedKeys[codeName] = true; el.classList.add('pressed'); };
                const pressOff = (e) => { e.preventDefault(); delete pressedKeys[keyName]; delete pressedKeys[codeName]; el.classList.remove('pressed'); };

                el.addEventListener('pointerdown', pressOn, { passive: false });
                el.addEventListener('pointerup', pressOff, { passive: false });
                el.addEventListener('pointercancel', pressOff, { passive: false });
                el.addEventListener('pointerleave', pressOff, { passive: false });
            };

            bindTouch('btnLeft', 'a', 'KeyA');
            bindTouch('btnRight', 'd', 'KeyD');
            bindTouch('btnBrake', 's', 'KeyS');
            bindTouch('btnBoost', 'w', 'KeyW');

            const btnBoostLock = document.getElementById('btnBoostLock');
            if (btnBoostLock) {
                btnBoostLock.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (isGameRunning) {
                        isSuperBoostActive = !isSuperBoostActive;
                    }
                });
            }

            document.getElementById('btnHorn').addEventListener('click', (e) => {
                e.preventDefault();
                if (isGameRunning) triggerSmartHornAI();
            });
        }


        function resetWorldTrack() {
            if (Array.isArray(trafficCars)) {
                trafficCars.forEach(car => {
                    if (car && scene) scene.remove(car);
                });
                trafficCars = [];
            }
            if (Array.isArray(crossTrafficCars)) {
                crossTrafficCars.forEach(car => {
                    if (car && scene) scene.remove(car);
                });
                crossTrafficCars = [];
            }
            if (Array.isArray(roadSegments) && roadSegments.length > 0) {
                roadSegments.forEach((seg, idx) => {
                    if (seg) seg.position.z = -idx * 20;
                });
            }
            if (typeof playerCar !== 'undefined' && playerCar) {
                const defaultX = (typeof myPlayerSlot !== 'undefined' && myPlayerSlot === 'host') ? 2.5 : (typeof myPlayerSlot !== 'undefined' && myPlayerSlot === 'client') ? -2.5 : 0;
                playerCar.position.set(defaultX, 0, 0);
                playerCar.rotation.set(0, 0, 0);
            }
            if (typeof camera !== 'undefined' && camera) {
                camera.position.set(0, 3.5, 7);
                camera.lookAt(0, 1, -10);
            }
            if (typeof spawnTraffic === 'function') {
                spawnTraffic();
            }
        }

        async function requestScoresApi(options = {}) {
            const endpoints = ['/api/scores'];
            if (window.location.hostname !== 'localhost' || window.location.port !== '3001') {
                endpoints.push('http://localhost:3001/api/scores');
            }

            let lastError = null;
            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, options);
                    if (response.ok) return response;
                    lastError = new Error(`Leaderboard request failed: ${response.status}`);
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error('Leaderboard server unavailable');
        }

        async function submitOfflineScore(finalScore) {
            if (offlineScoreSubmitted || isMultiplayerMode || finalScore < 1) return;
            const name = getPilotName();
            if (!name) return;
            offlineScoreSubmitted = true;

            try {
                await requestScoresApi({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ player: name, score: finalScore })
                });
                if (submitMessage) {
                    submitMessage.style.display = 'block';
                    submitMessage.style.color = '#00ff88';
                    submitMessage.textContent = 'Score added to the global leaderboard.';
                }
            } catch (error) {
                offlineScoreSubmitted = false;
                if (submitMessage) {
                    submitMessage.style.display = 'block';
                    submitMessage.style.color = '#ff3366';
                    submitMessage.textContent = 'Score could not be saved. Start the backend server and try again.';
                }
                console.error('Offline score submission failed:', error);
            }
        }

        async function openLeaderboard() {
            const lbModal = document.getElementById('leaderboardModal');
            if (!lbModal) return;
            lbModal.classList.remove('hidden');
            if (screenOverlay) screenOverlay.classList.add('hidden');
            if (mainMenuModal) mainMenuModal.classList.add('hidden');

            const lbLoading = document.getElementById('leaderboardLoading');
            const lbTable = document.getElementById('leaderboardTable');
            const lbTbody = document.getElementById('leaderboardTbody');

            if (lbLoading) lbLoading.style.display = 'block';
            if (lbTable) lbTable.style.display = 'none';
            if (lbTbody) lbTbody.innerHTML = '';

            try {
                const res = await requestScoresApi();
                const scores = await res.json();

                if (lbLoading) lbLoading.style.display = 'none';
                if (lbTable) lbTable.style.display = 'block';

                if (lbTbody) {
                    lbTbody.innerHTML = '';
                    if (!scores || scores.length === 0) {
                        lbTbody.innerHTML = '<tr><td colspan="4" style="padding:16px; text-align:center; color:#8fa7c4;">No high scores recorded yet!</td></tr>';
                    } else {
                        scores.forEach((entry, idx) => {
                            const tr = document.createElement('tr');
                            tr.style.cssText = 'border-bottom: 1px solid rgba(255,255,255,0.05); color: #e0e0e0;';
                            const dateStr = entry.date ? new Date(entry.date).toLocaleDateString() : 'N/A';
                            const rankColor = idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : 'var(--cyan)';
                            const cells = [
                                `#${idx + 1}`,
                                entry.player || 'ANONYMOUS',
                                (entry.score || 0).toLocaleString(),
                                dateStr
                            ];
                            cells.forEach((value, cellIndex) => {
                                const td = document.createElement('td');
                                td.textContent = value;
                                td.style.cssText = cellIndex === 0
                                    ? `padding: 10px 14px; font-weight: bold; color: ${rankColor}`
                                    : cellIndex === 2
                                        ? 'padding: 10px 14px; color: #00ff88; font-weight: bold;'
                                        : cellIndex === 3
                                            ? 'padding: 10px 14px; color: #8fa7c4; font-size: 11px;'
                                            : 'padding: 10px 14px; font-weight: bold;';
                                tr.appendChild(td);
                            });
                            lbTbody.appendChild(tr);
                        });
                    }
                }
            } catch (err) {
                console.error('Leaderboard fetch error:', err);
                if (lbLoading) {
                    lbLoading.textContent = 'Unable to load leaderboard data.';
                    lbLoading.style.display = 'block';
                }
            }
        }

        function setupMenuListeners() {

            // FPV Toggle Button listener & keybindings
            const fpvToggleBtn = document.getElementById('fpvToggleBtn');
            if (fpvToggleBtn) {
                fpvToggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleFirstPersonView();
                });
            }
            window.addEventListener('keydown', (e) => {
                if (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V') {
                    toggleFirstPersonView();
                }
            });

            startBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                initAudio();
                startGame();
            });

            menuSettingsBtn.addEventListener('click', () => {
                mainMenuModal.classList.add('hidden');
                settingsModal.classList.remove('hidden');
            });

            const vehicleCardCar = document.getElementById('vehicleCardCar');
            const vehicleCardBike = document.getElementById('vehicleCardBike');
            const statSpeed = document.getElementById('statSpeed');
            const statAgility = document.getElementById('statAgility');
            const statAccel = document.getElementById('statAccel');
            const statSpeedVal = document.getElementById('statSpeedVal');
            const statAgilityVal = document.getElementById('statAgilityVal');
            const statAccelVal = document.getElementById('statAccelVal');
            const vehiclePerkText = document.getElementById('vehiclePerkText');

            if (vehicleCardCar && vehicleCardBike) {
                vehicleCardCar.addEventListener('click', () => {
                    selectedVehicleType = 'car';
                    vehicleCardCar.classList.add('active');
                    vehicleCardCar.style.borderColor = '#00f0ff';
                    vehicleCardBike.classList.remove('active');
                    vehicleCardBike.style.borderColor = 'rgba(255,255,255,0.1)';

                    if (statSpeed) statSpeed.style.width = '85%';
                    if (statAgility) statAgility.style.width = '65%';
                    if (statAccel) statAccel.style.width = '75%';
                    if (statSpeedVal) statSpeedVal.innerText = '280 KM/H';
                    if (statAgilityVal) statAgilityVal.innerText = '65%';
                    if (statAccelVal) statAccelVal.innerText = '75%';
                    if (vehiclePerkText) {
                        vehiclePerkText.innerHTML = '<strong>AERO SHIELD ACTIVE</strong>: Heavy body provides high downforce & collision stability.';
                    }

                    spawnSelectedPlayerVehicle();
                });

                vehicleCardBike.addEventListener('click', () => {
                    selectedVehicleType = 'bike';
                    vehicleCardBike.classList.add('active');
                    vehicleCardBike.style.borderColor = '#ff0055';
                    vehicleCardCar.classList.remove('active');
                    vehicleCardCar.style.borderColor = 'rgba(255,255,255,0.1)';

                    if (statSpeed) statSpeed.style.width = '98%';
                    if (statAgility) statAgility.style.width = '95%';
                    if (statAccel) statAccel.style.width = '90%';
                    if (statSpeedVal) statSpeedVal.innerText = '320 KM/H';
                    if (statAgilityVal) statAgilityVal.innerText = '95%';
                    if (statAccelVal) statAccelVal.innerText = '90%';
                    if (vehiclePerkText) {
                        vehiclePerkText.innerHTML = '<strong>HYPER AGILITY ACTIVE</strong>: Maximum lean angle & razor-sharp traffic slalom.';
                    }

                    spawnSelectedPlayerVehicle();
                });
            }

            // Chassis Paint & Underglow Swatches
            document.querySelectorAll('.color-swatch').forEach(swatch => {
                swatch.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                    swatch.classList.add('active');
                    const rawVal = swatch.getAttribute('data-color');
                    const colorVal = Number(rawVal);
                    spawnSelectedPlayerVehicle(colorVal);
                });
            });

            // Sync Mobile Touch Assist Toggle in Lobby
            const lobbyToggleTouch = document.getElementById('lobbyToggleTouch');
            if (lobbyToggleTouch && toggleTouch) {
                lobbyToggleTouch.addEventListener('change', (e) => {
                    toggleTouch.checked = e.target.checked;
                    toggleTouch.dispatchEvent(new Event('change'));
                });
                toggleTouch.addEventListener('change', (e) => {
                    lobbyToggleTouch.checked = e.target.checked;
                });
            }

            // Fullscreen Toggle Button with full vendor prefix & icon update support
            const fullscreenBtn = document.getElementById('fullscreenBtn');
            if (fullscreenBtn) {
                const updateFsBtnUI = () => {
                    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                    fullscreenBtn.innerHTML = isFs ? '🗗' : '⛶';
                    fullscreenBtn.title = isFs ? 'Exit Fullscreen' : 'Enter Fullscreen';
                };
                fullscreenBtn.addEventListener('click', () => {
                    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                    if (!isFs) {
                        const elem = document.documentElement;
                        const req = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
                        if (req) {
                            req.call(elem).catch(() => { });
                        }
                    } else {
                        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
                        if (exit) {
                            exit.call(document).catch(() => { });
                        }
                    }
                    setTimeout(updateFsBtnUI, 100);
                });
                document.addEventListener('fullscreenchange', updateFsBtnUI);
                document.addEventListener('webkitfullscreenchange', updateFsBtnUI);
            }

            // Audio Prompt Click Handler
            const audioPromptEl = document.getElementById('audio-prompt');
            if (audioPromptEl) {
                audioPromptEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    initAudio();
                    startLobbyMusic();
                    audioPromptEl.innerHTML = '<span class="audio-icon">🔊</span><span class="audio-text">AUDIO ACTIVE</span><div class="audio-equalizer"><span></span><span></span><span></span><span></span></div>';
                });
            }

            // Dedicated Pause / Crash Modal Listeners
            const pauseCrashModal = document.getElementById('pauseCrashModal');
            const pauseCrashTitle = document.getElementById('pauseCrashTitle');
            const pauseCrashText = document.getElementById('pauseCrashText');
            const pauseResumeBtn = document.getElementById('pauseResumeBtn');
            const pauseSettingsBtn = document.getElementById('pauseSettingsBtn');
            const pauseQuitBtn = document.getElementById('pauseQuitBtn');

            if (pauseResumeBtn) {
                pauseResumeBtn.addEventListener('click', () => {
                    pauseCrashModal.classList.add('hidden');
                    screenOverlay.classList.add('hidden');
                    if (isGameRunning && isPaused) {
                        resumeGame();
                    } else {
                        startGame();
                    }
                });
            }
            if (pauseSettingsBtn) {
                pauseSettingsBtn.addEventListener('click', () => {
                    pauseCrashModal.classList.add('hidden');
                    settingsModal.classList.remove('hidden');
                });
            }
            if (pauseQuitBtn) {
                pauseQuitBtn.addEventListener('click', () => {
                    pauseCrashModal.classList.add('hidden');
                    quitToMainMenu();
                });
            }

            if (menuLeaderboardBtn) {
                menuLeaderboardBtn.addEventListener('click', () => {
                    openLeaderboard();
                });
            }

            if (leaderboardBtn) {
                leaderboardBtn.addEventListener('click', () => {
                    pauseGame();
                    openLeaderboard();
                });
            }

            if (closeLeaderboardBtn) {
                closeLeaderboardBtn.addEventListener('click', () => {
                    leaderboardModal.classList.add('hidden');
                    if (isGameRunning) {
                        screenOverlay.classList.add('hidden');
                        isPaused = false;
                    } else {
                        screenOverlay.classList.remove('hidden');
                        mainMenuModal.classList.remove('hidden');
                    }
                });
            }

            if (submitScoreBtn) {
                submitScoreBtn.addEventListener('click', async () => {
                    const name = getPilotName();
                    if (!name) {
                        requestPilotName();
                        return;
                    }
                    submitScoreBtn.disabled = true;
                    submitScoreBtn.innerText = 'SAVING...';
                    try {
                        await submitOfflineScore(Math.floor(score));
                        setTimeout(() => {
                            playerInputContainer.classList.add('hidden');
                            openLeaderboard();
                        }, 800);
                    } catch (err) {
                        submitMessage.style.display = 'block';
                        submitMessage.style.color = '#ff3366';
                        submitMessage.innerText = 'Failed to submit score';
                    } finally {
                        submitScoreBtn.disabled = false;
                        submitScoreBtn.innerText = 'SUBMIT 🏆';
                    }
                });
            }

            settingsBtn.addEventListener('click', () => {
                pauseGame();
                mainMenuModal.classList.add('hidden');
                settingsModal.classList.remove('hidden');
                screenOverlay.classList.remove('hidden');
            });

            backToMenuBtn.addEventListener('click', () => {
                settingsModal.classList.add('hidden');
                if (isGameRunning) {
                    screenOverlay.classList.add('hidden');
                    isPaused = false;
                } else {
                    mainMenuModal.classList.remove('hidden');
                }
            });

            quitGameBtn.addEventListener('click', () => {
                quitToMainMenu();
            });

            pauseBtn.addEventListener('click', () => {
                if (!isGameRunning) return;
                if (!isPaused) {
                    pauseGame();
                    mainMenuModal.classList.add('hidden');
                    if (pauseCrashModal) {
                        pauseCrashModal.classList.remove('hidden');
                        pauseCrashModal.classList.remove('crashed');
                        pauseCrashTitle.innerText = "SYSTEM PAUSED";
                        pauseCrashText.innerHTML = "Telemetry and physics on standby.";
                        pauseResumeBtn.innerText = "RESUME RACE";
                    }
                    settingsModal.classList.add('hidden');
                    screenOverlay.classList.remove('hidden');
                } else {
                    resumeGame();
                }
            });

            toggleTouch.addEventListener('change', (e) => {
                if (e.target.checked) {
                    touchControlsEl.classList.remove('hidden');
                } else {
                    touchControlsEl.classList.add('hidden');
                }
            });

            btnSizeSlider.addEventListener('input', (e) => {
                const size = e.target.value + 'px';
                document.querySelectorAll('.t-btn').forEach(btn => {
                    btn.style.width = size;
                    btn.style.height = size;
                    btn.style.fontSize = (e.target.value * 0.35) + 'px';
                });
            });

            btnBottomSlider.addEventListener('input', (e) => {
                touchControlsEl.style.bottom = e.target.value + 'px';
            });
        }

        function triggerSmartHornAI() {
            playHornSound();

            if (trafficLightState === 'RED') return;

            const isNearJunction = junctions.some(junction =>
                Math.abs(playerCar.position.z - junction.position.z) <= 20
            );
            if (isNearJunction) {
                hornTrafficFreezeTimer = 0.65;
                return;
            }

            const playerX = playerCar.position.x;
            const playerZ = playerCar.position.z;

            let targetCar = null;
            let minDistance = 999;

            trafficCars.forEach(car => {
                const distZ = playerZ - car.position.z;
                if (distZ > 0 && distZ < 28 && Math.abs(car.position.x - playerX) < 2.5) {
                    if (distZ < minDistance) {
                        minDistance = distZ;
                        targetCar = car;
                    }
                }
            });

            if (!targetCar) return;

            const currentLaneX = targetCar.userData.targetX;
            let potentialLanes = [];

            if (currentLaneX > -4) potentialLanes.push(currentLaneX - 5.0);
            if (currentLaneX < 4) potentialLanes.push(currentLaneX + 5.0);

            let safeLane = null;

            for (let laneCandidateX of potentialLanes) {
                const laneBlocked = trafficCars.some(otherCar => {
                    if (otherCar === targetCar) return false;
                    const sameLane = Math.abs(otherCar.position.x - laneCandidateX) < 2.2;
                    const closeZ = Math.abs(otherCar.position.z - targetCar.position.z) < 8.0;
                    return sameLane && closeZ;
                });

                if (!laneBlocked) {
                    safeLane = laneCandidateX;
                    break;
                }
            }

            if (safeLane !== null) {
                targetCar.userData.targetX = safeLane;
                targetCar.userData.isYielding = true;
            } else {
                targetCar.userData.speedBoost = 25.0;
            }
        }

        function startGame() {
            if (animFrameId) cancelAnimationFrame(animFrameId);

            stopLobbyMusic();
            startEngineSound();

            trafficCars.forEach(car => scene.remove(car));
            trafficCars = [];
            crossTrafficCars.forEach(car => scene.remove(car));
            crossTrafficCars = [];
            junctionPedestrians.forEach(person => scene.remove(person));
            junctionPedestrians = [];
            pedestrians = pedestrians.filter(person => !person.userData.isJunctionCrossing);
            signalSections.forEach(signalSection => delete signalSection.userData.pedestrianCycleUntil);

            smokeParticles.forEach(sp => scene.remove(sp.mesh));
            smokeParticles = [];

            isCrashing = false;
            opponentCrashing = false;
            crashParticles.forEach(cp => {
                scene.remove(cp.mesh);
                if (cp.mesh.geometry) cp.mesh.geometry.dispose();
                if (cp.mesh.material) cp.mesh.material.dispose();
            });
            crashParticles = [];

            spawnSelectedPlayerVehicle();
            playerCar.position.set(0, 0, 0);
            playerCar.rotation.set(0, 0, 0);

            // Restore racing camera angle and sun light target
            camera.position.set(0, 3.8, 8.5);
            camera.rotation.set(-0.22, 0, 0);
            camera.fov = 60;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();

            if (sunLight) {
                sunLight.position.set(0, 60, -50);
                sunLight.target = playerCar;
            }

            gameTime = 0;
            score = 0;
            offlineScoreSubmitted = false;
            weatherTimer = 0;
            trafficLightTimer = 0;
            trafficLightState = 'GREEN';
            isSuperBoostActive = false;
            hornTrafficFreezeTimer = 0;

            resetWorldTrack();
            setWeatherEnvironment(Math.floor(Math.random() * 2));

            currentSpeed = baseSpeed;
            isGameRunning = true;
            isPaused = false;

            screenOverlay.classList.add('hidden');
            lastFrameTime = performance.now();
            gameLoop();
        }

        function pauseGame() {
            isPaused = true;
            clearPressedKeys();
            stopEngineSound();
            stopRainSound();
        }

        function resumeGame() {
            isPaused = false;
            startEngineSound();
            if (weatherParticlesVisible()) startRainSound();
            screenOverlay.classList.add('hidden');
            startBtn.innerText = "START ENGINE";
            lastFrameTime = performance.now();
            gameLoop();
        }

        function weatherParticlesVisible() {
            return rainParticles && rainParticles.visible;
        }

        function quitToMainMenu() {
            isGameRunning = false;
            isPaused = false;
            isCrashing = false;
            opponentCrashing = false;
            crashParticles.forEach(cp => {
                scene.remove(cp.mesh);
                if (cp.mesh.geometry) cp.mesh.geometry.dispose();
                if (cp.mesh.material) cp.mesh.material.dispose();
            });
            crashParticles = [];

            clearPressedKeys();
            trafficCars.forEach(car => scene.remove(car));
            trafficCars = [];
            crossTrafficCars.forEach(car => scene.remove(car));
            crossTrafficCars = [];
            junctionPedestrians.forEach(person => scene.remove(person));
            junctionPedestrians = [];
            pedestrians = pedestrians.filter(person => !person.userData.isJunctionCrossing);
            stopEngineSound();
            stopRainSound();
            startLobbyMusic();

            if (playerCar) {
                playerCar.position.set(0, 0, 0);
                playerCar.rotation.set(0, 0, 0);
            }
            camera.position.set(0, 3.8, 8.5);
            camera.rotation.set(-0.22, 0, 0);
            camera.fov = 60;
            camera.updateProjectionMatrix();

            if (pauseCrashModal) pauseCrashModal.classList.add('hidden');
            settingsModal.classList.add('hidden');
            mainMenuModal.classList.remove('hidden');
            screenOverlay.classList.remove('hidden');
        }

        function gameOver() {
            triggerPlayerCrash();
        }

        function playSignalAlert(state) {
            if (!audioCtx || audioCtx.state !== 'running' || !masterGainNode) return;

            try {
                const oscillator = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                const frequency = state === 'RED' ? 520 : (state === 'YELLOW' ? 680 : 820);
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
                oscillator.connect(gain);
                gain.connect(masterGainNode);
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.22);
            } catch (error) { }
        }

        function updateSignalAlert() {
            if (!isGameRunning || !playerCar) {
                signalAlert.classList.add('hidden');
                return;
            }

            const nextSignal = signalSections
                .filter(signalSection => signalSection.position.z < playerCar.position.z - 5 && signalSection.position.z > playerCar.position.z - 125)
                .sort((a, b) => b.position.z - a.position.z)[0];

            if (!nextSignal) {
                signalAlert.classList.add('hidden');
                lastAlertJunction = null;
                return;
            }

            const distance = Math.round(playerCar.position.z - nextSignal.position.z);
            const stateText = trafficLightState === 'RED'
                ? 'RED - STOP'
                : trafficLightState === 'YELLOW'
                    ? 'YELLOW - SLOW DOWN'
                    : 'GREEN - PROCEED';

            signalAlert.classList.remove('hidden', 'signal-red', 'signal-yellow', 'signal-green');
            signalAlert.classList.add(`signal-${trafficLightState.toLowerCase()}`);
            signalAlertState.innerText = stateText;
            signalAlertDistance.innerText = `SIGNAL IN ${Math.max(1, distance)} M`;

            if (lastAlertJunction !== nextSignal || lastAlertState !== trafficLightState) {
                playSignalAlert(trafficLightState);
                lastAlertJunction = nextSignal;
                lastAlertState = trafficLightState;
            }
        }

        let lastFrameTime = performance.now();

        function updateTrafficLights(delta) {
            trafficLightTimer += delta;
            if (trafficLightState === 'GREEN' && trafficLightTimer > 7.0) {
                trafficLightState = 'YELLOW';
                trafficLightTimer = 0;
            } else if (trafficLightState === 'YELLOW' && trafficLightTimer > 2.0) {
                trafficLightState = 'RED';
                trafficLightTimer = 0;
            } else if (
                trafficLightState === 'RED'
                && trafficLightTimer > 6.0
                && junctionPedestrians.length === 0
                && !crossTrafficCars.some(car => car.userData.hasEnteredJunction && car.position.x <= 12)
            ) {
                trafficLightState = 'GREEN';
                trafficLightTimer = 0;
            }

            roadSegments.forEach(junc => {
                junc.children.forEach(child => {
                    if (child.userData.signalLights) {
                        const displayedState = child.userData.signalAxis === 'cross'
                            ? (trafficLightState === 'RED' ? 'GREEN' : 'RED')
                            : trafficLightState;
                        const [redM, yellowM, greenM] = child.userData.signalLights;

                        redM.material.color.setHex(displayedState === 'RED' ? redM.userData.onColor : redM.userData.offColor);
                        yellowM.material.color.setHex(displayedState === 'YELLOW' ? yellowM.userData.onColor : yellowM.userData.offColor);
                        greenM.material.color.setHex(displayedState === 'GREEN' ? greenM.userData.onColor : greenM.userData.offColor);
                    }
                });
            });
        }

        function update() {
            if (!isGameRunning || isPaused) return;

            const now = performance.now();
            const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
            lastFrameTime = now;
            hornTrafficFreezeTimer = Math.max(0, hornTrafficFreezeTimer - delta);
            const trafficFrozenByHorn = hornTrafficFreezeTimer > 0;

            // ── Crash Animation State Handling ──
            if (isCrashing) {
                // Tumbling physics for playerCar
                crashVelocity.y -= 26 * delta;
                if (playerCar) {
                    playerCar.position.x += crashVelocity.x * delta;
                    playerCar.position.y += crashVelocity.y * delta;
                    playerCar.position.z += crashVelocity.z * delta;

                    if (playerCar.position.y < 0.25) {
                        playerCar.position.y = 0.25;
                        crashVelocity.y = -crashVelocity.y * 0.42;
                        crashVelocity.x *= 0.65;
                        crashVelocity.z *= 0.65;
                        if (Math.abs(crashVelocity.y) > 2) {
                            spawnCrashExplosion(playerCar.position, 18);
                        }
                    }

                    playerCar.rotation.x += crashAngularVel.x * delta;
                    playerCar.rotation.y += crashAngularVel.y * delta;
                    playerCar.rotation.z += crashAngularVel.z * delta;
                }

                // Dynamic camera screen shake
                if (crashShakeIntensity > 0.01) {
                    camera.position.x += (Math.random() - 0.5) * crashShakeIntensity * 0.7;
                    camera.position.y += (Math.random() - 0.5) * crashShakeIntensity * 0.5;
                    crashShakeIntensity = THREE.MathUtils.lerp(crashShakeIntensity, 0, delta * 3.5);
                }

                updateCrashParticles(delta);

                crashTimer -= delta;
                if (crashTimer <= 0) {
                    finalizeGameOver();
                }
                return;
            }

            if (opponentCrashing && opponentCar) {
                oppCrashVelocity.y -= 26 * delta;
                opponentCar.position.x += oppCrashVelocity.x * delta;
                opponentCar.position.y += oppCrashVelocity.y * delta;
                opponentCar.position.z += oppCrashVelocity.z * delta;

                if (opponentCar.position.y < 0.25) {
                    opponentCar.position.y = 0.25;
                    oppCrashVelocity.y = -oppCrashVelocity.y * 0.42;
                    oppCrashVelocity.x *= 0.65;
                    oppCrashVelocity.z *= 0.65;
                }

                opponentCar.rotation.x += oppCrashAngularVel.x * delta;
                opponentCar.rotation.y += oppCrashAngularVel.y * delta;
                opponentCar.rotation.z += oppCrashAngularVel.z * delta;

                oppCrashTimer -= delta;
                if (oppCrashTimer <= 0) {
                    opponentCrashing = false;
                }
            }

            if (crashParticles.length > 0) {
                updateCrashParticles(delta);
            }

            if (currentSpeed > 0.05) {
                gameTime += delta;
                weatherTimer += delta;
            }

            // Host: stamp NPC IDs so client can track them
            if (typeof isMultiplayerMode !== 'undefined' && isMultiplayerMode &&
                typeof myPlayerSlot !== 'undefined' && myPlayerSlot === 'host') {
                _tagTrafficIds();
            }

            if (weatherTimer > 30) {
                weatherTimer = 0;
                const nextMode = (weatherMode + 1) % 2;
                setWeatherEnvironment(nextMode);
            }

            updateEnvironmentBlending(delta);
            updateRainAndLightning(delta);
            updateCelestialPositions();
            updateTrafficLights(delta);

            const pressUp = isKeyPressed('w', 'KeyW') || isKeyPressed('arrowup', 'ArrowUp');
            const pressDown = isKeyPressed('s', 'KeyS') || isKeyPressed('arrowdown', 'ArrowDown');
            const pressLeft = isKeyPressed('a', 'KeyA') || isKeyPressed('arrowleft', 'ArrowLeft');
            const pressRight = isKeyPressed('d', 'KeyD') || isKeyPressed('arrowright', 'ArrowRight');

            const difficultyScoreThreshold = 4000;
            let targetBaseSpeed = baseSpeed;
            if (score <= difficultyScoreThreshold) {
                const remainingScore = Math.max(0, Math.ceil(difficultyScoreThreshold - score));
                speedPhaseEl.innerText = isSuperBoostActive ? "🚀 CONSTANT BOOST LOCK 🚀" : `CRUISE MODE (${remainingScore} PTS)`;
                speedPhaseEl.style.color = isSuperBoostActive ? "#00ff88" : "#00f0ff";
            } else {
                const overScore = score - difficultyScoreThreshold;
                targetBaseSpeed = Math.min(baseSpeed + (overScore * 0.00006), baseSpeed * 2.2);
                speedPhaseEl.innerText = isSuperBoostActive ? "🚀 CONSTANT BOOST LOCK 🚀" : `HYPER DRIVE (+${Math.floor(overScore)} PTS)`;
                speedPhaseEl.style.color = isSuperBoostActive ? "#00ff88" : "#ff0055";
            }

            let isBoosting = false;
            let targetSpeed = targetBaseSpeed;

            if (isSuperBoostActive) {
                targetSpeed = targetBaseSpeed * 5.5;
                isBoosting = true;
            } else if (pressUp) {
                targetSpeed = targetBaseSpeed * 2.8;
                isBoosting = true;
            } else if (pressDown) {
                targetSpeed = 0.0;
                isBoosting = false;
            }

            if (isBoosting) {
                exhaustFlamesGroup.visible = true;
                const flameMult = isSuperBoostActive ? 2.2 : 1.3;
                exhaustFlamesGroup.scale.set((1 + Math.random() * 0.3) * flameMult, (1 + Math.random() * 0.4) * flameMult, (1 + Math.random() * 0.3) * flameMult);
            } else {
                exhaustFlamesGroup.visible = false;
            }

            const lerpFactor = isSuperBoostActive ? 0.08 : (pressDown ? 0.08 : 0.05);
            currentSpeed = THREE.MathUtils.lerp(currentSpeed, targetSpeed, lerpFactor);
            if (currentSpeed < 0.005) currentSpeed = 0;

            updateEnginePitch(currentSpeed, isBoosting);

            score += currentSpeed * delta * 250;
            scoreDisplay.innerText = Math.floor(score);
            speedDisplay.innerText = Math.floor(currentSpeed * 220);

            const steerSpeed = 14 * delta;
            let targetRoll = 0;
            let targetPitch = 0;

            if (isBoosting) targetPitch = -0.06;
            if (pressDown && currentSpeed > 0.05) targetPitch = 0.08;

            if (pressLeft && playerCar.position.x > -mainRoadVehicleLimit) {
                playerCar.position.x -= steerSpeed * (selectedVehicleType === 'bike' ? 1.25 : 1.0);
                targetRoll = selectedVehicleType === 'bike' ? 0.38 : 0.18;
            } else if (pressRight && playerCar.position.x < mainRoadVehicleLimit) {
                playerCar.position.x += steerSpeed * (selectedVehicleType === 'bike' ? 1.25 : 1.0);
                targetRoll = selectedVehicleType === 'bike' ? -0.38 : -0.18;
            }
            playerCar.position.x = THREE.MathUtils.clamp(
                playerCar.position.x,
                -mainRoadVehicleLimit,
                mainRoadVehicleLimit
            );

            playerCar.rotation.z = THREE.MathUtils.lerp(playerCar.rotation.z, targetRoll, 0.15);
            playerCar.rotation.x = THREE.MathUtils.lerp(playerCar.rotation.x, targetPitch, 0.15);
            playerCar.rotation.y = THREE.MathUtils.lerp(playerCar.rotation.y, targetRoll * 0.5, 0.15);

            const moveDist = currentSpeed * delta * 90;

            if (currentSpeed > 0.05) {
                emitSmokeParticle(playerCar.position.x + 0.5, 0.32, playerCar.position.z + 2.1, isBoosting, false);
            }

            updateSmokeParticles(delta, moveDist);

            roadSegments.forEach(segment => {
                segment.position.z += moveDist;
                if (segment.position.z > 80) {
                    let minZ = Math.min(...roadSegments.map(s => s.position.z));
                    segment.position.z = minZ - segmentLength;
                }
            });

            streetLights.forEach(light => {
                light.position.z += moveDist;
                if (light.position.z > 50) {
                    let minZ = Math.min(...streetLights.map(l => l.position.z));
                    const bounds = light.userData.sceneryBounds;
                    light.position.z = getSafeSceneryPlacement(light.position.x, minZ - 40, bounds.xRadius, bounds.zRadius, light);
                }
            });

            roadBridges.forEach(bridge => {
                bridge.position.z += moveDist;
                if (bridge.position.z > 80) {
                    bridge.position.z -= 600;
                }
            });

            roadTrees.forEach(tree => {
                tree.position.z += moveDist;
                if (tree.position.z > 70) {
                    const minZ = Math.min(...roadTrees.map(item => item.position.z));
                    const bounds = tree.userData.sceneryBounds;
                    tree.position.z = getSafeSceneryPlacement(tree.position.x, minZ - 32 - Math.random() * 28, bounds.xRadius, bounds.zRadius, tree);
                }
            });

            pedestrians.forEach(person => {
                const isStanding = person.userData.isStanding;
                const isCrossing = person.userData.isJunctionCrossing;
                person.position.z += moveDist + (!isStanding && !isCrossing ? person.userData.walkDirection * delta * 1.4 : 0);

                if (!isStanding) {
                    person.userData.walkPhase += delta * 7;
                    const step = Math.sin(person.userData.walkPhase) * 0.45;
                    person.userData.leftLeg.rotation.x = step;
                    person.userData.rightLeg.rotation.x = -step;
                    person.userData.leftArm.rotation.x = -step * 0.7;
                    person.userData.rightArm.rotation.x = step * 0.7;
                }

                if (isCrossing) return;

                if (person.position.z > 70) {
                    const minZ = Math.min(...pedestrians.map(item => item.position.z));
                    const bounds = person.userData.sceneryBounds;
                    person.position.x = (Math.random() > 0.5 ? -1 : 1) * (9.5 + Math.random() * 1.2);
                    person.position.z = getSafeSceneryPlacement(person.position.x, minZ - 38 - Math.random() * 26, bounds.xRadius, bounds.zRadius, person);
                    person.userData.walkDirection = person.position.x > 0 ? 1 : -1;
                    person.rotation.y = person.userData.walkDirection > 0 ? 0 : Math.PI;
                }
            });

            sideBuildings.forEach(building => {
                building.position.z += moveDist;
                if (building.position.z > 50) {
                    let minZ = Math.min(...sideBuildings.map(b => b.position.z));
                    const bounds = building.userData.sceneryBounds;
                    building.position.z = getSafeSceneryPlacement(
                        building.position.x,
                        minZ - 35,
                        bounds.xRadius,
                        bounds.zRadius,
                        building
                    );
                }
            });

            updateSignalAlert();

            spawnTraffic();
            updateJunctionPedestrians(delta);
            const trafficFrozenForSafety = trafficFrozenByHorn;
            playerBox.setFromObject(playerCar);

            for (let i = trafficCars.length - 1; i >= 0; i--) {
                const car = trafficCars[i];
                const carHalfLength = car.userData.halfLength || 2.2;
                const carFrontZ = car.position.z - carHalfLength;
                const isPreAllowed = !!(car.userData.isPreAllowed || car.userData.isPolice || car.userData.isEmergency);

                let shouldStop = false;
                let stopJunction = null;
                let targetCarCenterZ = 0;
                let closestStopDist = Infinity;

                if (!isPreAllowed && (trafficLightState === 'RED' || trafficLightState === 'YELLOW')) {
                    signalSections.forEach(signalSection => {
                        const crossingHalfDepth = signalSection.userData.crossingHalfDepth || (5 * 0.65 + 0.21);
                        const npcStopBuffer = signalSection.userData.npcStopBeforeCrossing || 10;
                        // Near edge of zebra crossing facing approaching traffic (+Z side):
                        const zebraNearEdgeZ = signalSection.position.z + crossingHalfDepth;
                        // Stop line for front of car is 10m before zebra crossing:
                        const stopLineFrontZ = zebraNearEdgeZ + npcStopBuffer;
                        const stopCenterZ = stopLineFrontZ + carHalfLength;

                        // Distance from car to target stop point (car approaches from +Z towards -Z):
                        const distToStop = car.position.z - stopCenterZ;

                        if (distToStop >= -1.0 && distToStop < 60 && distToStop < closestStopDist) {
                            if (!car.userData.clearedJunction) {
                                shouldStop = true;
                                stopJunction = signalSection;
                                targetCarCenterZ = stopCenterZ;
                                closestStopDist = distToStop;
                            }
                        }
                    });
                }

                // If car was already past 10m stop line when light turned RED, let it clear safely
                if (trafficLightState === 'GREEN') {
                    car.userData.clearedJunction = false;
                } else if (trafficLightState === 'RED' && !shouldStop && !isPreAllowed) {
                    signalSections.forEach(signalSection => {
                        const zebraNearEdgeZ = signalSection.position.z + (signalSection.userData.crossingHalfDepth || 3.46);
                        if (carFrontZ < zebraNearEdgeZ + 9.5 && carFrontZ > signalSection.position.z - 20) {
                            car.userData.clearedJunction = true;
                        }
                    });
                }

                const extraForwardMovement = trafficFrozenForSafety ? 0 : (car.userData.speedBoost || 0) * delta;

                let carSpeedMult = car.userData.cruiseSpeed * delta * 90;
                if (shouldStop) {
                    if (closestStopDist <= 0.05 || car.position.z <= targetCarCenterZ) {
                        carSpeedMult = 0.0;
                        car.position.z = targetCarCenterZ;
                        car.userData.stoppedForLight = true;
                    } else if (trafficLightState === 'RED') {
                        // Smooth deceleration all the way to the 10m stop mark
                        const decelFactor = THREE.MathUtils.clamp(closestStopDist / 10.0, 0.18, 1.0);
                        carSpeedMult = Math.min(carSpeedMult * decelFactor, closestStopDist);
                    } else if (trafficLightState === 'YELLOW') {
                        const decelFactor = THREE.MathUtils.clamp(closestStopDist / 20.0, 0.35, 1.0);
                        carSpeedMult *= decelFactor;
                    }
                } else {
                    car.userData.stoppedForLight = false;
                }

                if (car.userData.stoppedForLight && closestStopDist <= 0.05) {
                    carSpeedMult = 0.0;
                }

                if (!trafficFrozenForSafety) {
                    car.position.z += moveDist - carSpeedMult - extraForwardMovement;
                }

                if (shouldStop && stopJunction) {
                    if (closestStopDist <= 0.05 || car.position.z <= targetCarCenterZ) {
                        car.position.z = Math.max(car.position.z, targetCarCenterZ);
                    }
                }

                if (Math.random() < 0.45 && !shouldStop) {
                    const isHeavy = !!car.userData.isHeavyTruck;
                    const isBike = !!car.userData.isBike;
                    const silencerPos = isBike ? car.position.clone().add(car.userData.silencerOffset) : new THREE.Vector3(car.position.x + 0.5, isHeavy ? 2.2 : 0.35, car.position.z + 2.0);
                    emitSmokeParticle(silencerPos.x, silencerPos.y, silencerPos.z, false, isHeavy);
                }

                if (!trafficFrozenForSafety && car.userData.speedBoost > 0) {
                    car.userData.speedBoost = Math.max(0, car.userData.speedBoost - delta * 20);
                }

                if (!trafficFrozenForSafety && car.userData.isYielding) {
                    car.position.x = THREE.MathUtils.lerp(car.position.x, car.userData.targetX, 0.1);
                }
                car.position.x = THREE.MathUtils.clamp(
                    car.position.x,
                    -mainRoadVehicleLimit,
                    mainRoadVehicleLimit
                );

                const trafficBox = new THREE.Box3().setFromObject(car);
                if (playerBox.intersectsBox(trafficBox)) {
                    triggerPlayerCrash();
                    return;
                }

                if (car.position.z > 15 || car.position.z < -350) {
                    scene.remove(car);
                    trafficCars.splice(i, 1);
                }
            }

            for (let i = crossTrafficCars.length - 1; i >= 0; i--) {
                const crossCar = crossTrafficCars[i];
                const junctionEntryX = -junctionLineOffset + vehicleLength / 2;
                const junctionExitX = 12;
                const hasEnteredJunction = crossCar.position.x >= junctionEntryX;
                crossCar.userData.hasEnteredJunction = crossCar.userData.hasEnteredJunction || hasEnteredJunction;

                if (!crossCar.userData.hasEnteredJunction && trafficLightState === 'RED') {
                    crossCar.userData.crossing = true;
                }

                const mayEnterCrossRoad = trafficLightState === 'RED';
                if (!trafficFrozenForSafety && (crossCar.userData.hasEnteredJunction || (crossCar.userData.crossing && mayEnterCrossRoad))) {
                    crossCar.position.x += delta * 38;
                } else if (!trafficFrozenForSafety) {
                    crossCar.userData.crossing = false;
                    crossCar.position.x = Math.min(crossCar.position.x, crossCar.userData.stopLineX);
                }
                crossCar.position.x = THREE.MathUtils.clamp(
                    crossCar.position.x,
                    -crossRoadVehicleLimit,
                    crossRoadVehicleLimit
                );
                if (!trafficFrozenForSafety) crossCar.position.z += moveDist;

                if (crossCar.userData.hasEnteredJunction && crossCar.position.x > junctionExitX) {
                    crossCar.userData.crossing = false;
                }

                const crossBox = new THREE.Box3().setFromObject(crossCar);
                if (playerBox.intersectsBox(crossBox)) {
                    triggerPlayerCrash();
                    return;
                }

                if (crossCar.position.x >= crossRoadVehicleLimit) {
                    scene.remove(crossCar);
                    crossTrafficCars.splice(i, 1);
                }
            }

            if (!trafficFrozenForSafety) {
                keepTrafficSeparated();
            }

            // ── LIVE STEERING WHEEL & HANDLEBAR MOVEMENT ────────────
            const steerInput = (pressLeft ? -1 : 0) + (pressRight ? 1 : 0);
            steerAngleSmoothed = THREE.MathUtils.lerp(steerAngleSmoothed, steerInput, 0.18);

            if (playerCar && playerCar.userData.steeringWheel) {
                // Steer left: wheel rotates counter-clockwise; Steer right: wheel rotates clockwise
                playerCar.userData.steeringWheel.rotation.z = -steerAngleSmoothed * 1.55;
            }
            if (playerCar && playerCar.userData.handlebars) {
                // Bike handlebars swivel smoothly left and right
                playerCar.userData.handlebars.rotation.y = -steerAngleSmoothed * 0.42;
            }

            // ── EMERGENCY LIGHTBAR STROBES (POLICE & AMBULANCE) ─────
            const strobeStep = Math.floor(gameTime * 12) % 2 === 0;
            trafficCars.forEach(car => {
                if (car.userData.isEmergency) {
                    if (car.userData.redStrobe && car.userData.blueStrobe) {
                        car.userData.redStrobe.visible = strobeStep;
                        car.userData.blueStrobe.visible = !strobeStep;
                    }
                    if (car.userData.strobeLight) {
                        car.userData.strobeLight.color.setHex(strobeStep ? 0xff0022 : 0x0066ff);
                    }
                }
            });

            // ── FARM ANIMALS ANIMATIONS (HENS PECKING, TAIL SWISHING)
            if (typeof animalAnimatedObjects !== 'undefined') {
                animalAnimatedObjects.forEach(animObj => {
                    animObj.userData.animPhase += delta * 4;
                    if (animObj.userData.tail) {
                        animObj.userData.tail.rotation.z = Math.sin(animObj.userData.animPhase * 0.8) * 0.35;
                    }
                    if (animObj.userData.neck) {
                        animObj.userData.neck.rotation.x = Math.max(0, Math.sin(animObj.userData.animPhase * 1.6)) * 0.75;
                    }
                });
            }

            // ── CONNECTED MOVING BRIDGE VEHICLES ────────────────────
            if (typeof movingBridgeVehicles !== 'undefined') {
                movingBridgeVehicles.forEach(veh => {
                    veh.position.x += veh.userData.speed * delta;
                    if (veh.userData.speed > 0 && veh.position.x > 18) {
                        veh.position.x = -18;
                    } else if (veh.userData.speed < 0 && veh.position.x < -18) {
                        veh.position.x = 18;
                    }
                });
            }

            // ── CAMERA CONTROLLER: FIRST PERSON (COCKPIT) VS THIRD PERSON ──
            if (isFirstPersonView) {
                if (selectedVehicleType === 'car') {
                    const eyeX = playerCar.position.x - 0.35;
                    const eyeY = 0.94 + (currentSpeed > 0.05 ? Math.sin(gameTime * 28) * 0.012 * (currentSpeed / 1.5) : 0);
                    const eyeZ = playerCar.position.z + 0.04;
                    camera.position.x = THREE.MathUtils.lerp(camera.position.x, eyeX, 0.35);
                    camera.position.y = THREE.MathUtils.lerp(camera.position.y, eyeY, 0.35);
                    camera.position.z = THREE.MathUtils.lerp(camera.position.z, eyeZ, 0.35);

                    const targetPitch = -0.04 + (pressDown ? 0.05 : (isBoosting ? -0.06 : 0));
                    const targetYaw = playerCar.rotation.y * 0.75;
                    const targetRoll = playerCar.rotation.z * 0.55;
                    camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, targetPitch, 0.2);
                    camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, targetYaw, 0.2);
                    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, targetRoll, 0.2);
                    camera.fov = THREE.MathUtils.lerp(camera.fov, isSuperBoostActive ? 86 : (pressUp ? 78 : 74), 0.1);
                } else {
                    const eyeX = playerCar.position.x;
                    const eyeY = 1.28 + (currentSpeed > 0.05 ? Math.sin(gameTime * 32) * 0.015 * (currentSpeed / 1.5) : 0);
                    const eyeZ = playerCar.position.z + 0.12;
                    camera.position.x = THREE.MathUtils.lerp(camera.position.x, eyeX, 0.35);
                    camera.position.y = THREE.MathUtils.lerp(camera.position.y, eyeY, 0.35);
                    camera.position.z = THREE.MathUtils.lerp(camera.position.z, eyeZ, 0.35);

                    const targetPitch = -0.07 + (pressDown ? 0.06 : (isBoosting ? -0.08 : 0));
                    const targetYaw = playerCar.rotation.y * 0.9;
                    const targetRoll = playerCar.rotation.z * 0.88;
                    camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, targetPitch, 0.2);
                    camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, targetYaw, 0.2);
                    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, targetRoll, 0.2);
                    camera.fov = THREE.MathUtils.lerp(camera.fov, isSuperBoostActive ? 90 : (pressUp ? 82 : 78), 0.1);
                }
            } else {
                camera.position.x = playerCar.position.x * 0.3;
                camera.position.y = 3.8;
                if (isSuperBoostActive) {
                    camera.fov = THREE.MathUtils.lerp(camera.fov, 88, 0.12);
                    camera.position.z = 8.5 + (Math.random() - 0.5) * 0.18;
                } else if (pressUp) {
                    camera.fov = THREE.MathUtils.lerp(camera.fov, 72, 0.1);
                    camera.position.z = 8.5;
                } else {
                    camera.fov = THREE.MathUtils.lerp(camera.fov, 60, 0.1);
                    camera.position.z = 8.5;
                }
                camera.rotation.set(-0.22, 0, 0);
            }
            camera.updateProjectionMatrix();

            // Direct call to opponent vehicle sync every frame
            if (typeof isMultiplayerMode !== 'undefined' && isMultiplayerMode && opponentCar && !isPaused) {
                updateOpponentCar(delta);
            }

            // Client: advance ghost NPCs with dead reckoning and check collisions
            if (typeof isMultiplayerMode !== 'undefined' && isMultiplayerMode &&
                typeof myPlayerSlot !== 'undefined' && myPlayerSlot === 'client') {
                _advanceClientNpcs(delta, currentSpeed);

                const ghostMeshes = Object.values(_clientNpcMeshes);
                for (let i = 0; i < ghostMeshes.length; i++) {
                    const gMesh = ghostMeshes[i];
                    if (Math.abs(gMesh.position.z - playerCar.position.z) < 4.5 &&
                        Math.abs(gMesh.position.x - playerCar.position.x) < 2.2) {
                        const gBox = new THREE.Box3().setFromObject(gMesh);
                        if (playerBox.intersectsBox(gBox)) {
                            triggerPlayerCrash();
                            return;
                        }
                    }
                }
            }
        }

        function gameLoop() {
            animFrameId = requestAnimationFrame(gameLoop);
            if (isGameRunning && !isPaused) {
                update();
                renderer.render(scene, camera);
            } else if (isGameRunning && isPaused) {
                // Keep rendering during countdown or pause so side-by-side cars and world are visible!
                if (typeof isMultiplayerMode !== 'undefined' && isMultiplayerMode && opponentCar) {
                    updateOpponentCar(0);
                }
                renderer.render(scene, camera);
            } else if (!isGameRunning) {
                // In lobby: vehicle sits stationary facing forward on the highway, ready to race
                if (playerCar) {
                    playerCar.position.set(0, 0, 0);
                    playerCar.rotation.set(0, 0, 0);
                }
                camera.position.set(0, 3.8, 8.5);
                camera.rotation.set(-0.22, 0, 0);
                renderer.render(scene, camera);
            }
        }

        function onWindowResize() {
            if (!camera || !renderer) return;
            const w = window.innerWidth;
            const h = window.innerHeight;
            if (w <= 0 || h <= 0) return;

            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);

            if (!isGameRunning) {
                camera.position.set(0, 3.8, 8.5);
                camera.rotation.set(-0.22, 0, 0);
                renderer.render(scene, camera);
            }
        }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(() => { });
            });
        }

        init();
        gameLoop();

        // ═══════════════════════════════════════════════════════════════════
        // ██████████████  MULTIPLAYER SYSTEM (PeerJS WebRTC)  ██████████████
        // ═══════════════════════════════════════════════════════════════════

        // ────────── STATE ──────────────────────────────────────────────────────
        let isMultiplayerMode = false;
        let peer = null;
        let conn = null;
        let myPlayerSlot = null;    // 'host' | 'client'
        let opponentCar = null;    // ghost mesh (blue)
        let syncInterval = null;
        let envSyncInterval = null;    // environment sync (host → client)
        let opponentAlive = true;
        let currentRoomCode = null;
        let fallbackTriggered = false;

        // Latest opponent network state
        let oppNetX = 0;            // lane X position from peer
        let oppNetScore = 0;
        let oppNetSpeed = 0;
        let oppRawSpeed = 0.28;         // local speed unit for relative Z physics
        let oppVehicleType = 'car';       // 'car' or 'bike' selected by opponent in lobby
        let oppPilotName = 'OPPONENT';
        let oppVehicleColor = 0x0044ff;
        let oppPrevX = 0;            // previous X for tilt calculation

        // moveDist captured from within the original update() each frame
        let _lastMoveDist = 0;

        // Expose key state to window so single-player gameOver() can read them
        Object.defineProperty(window, 'isMultiplayerMode', { get: () => isMultiplayerMode, configurable: true });
        Object.defineProperty(window, 'conn', { get: () => conn, configurable: true });
        Object.defineProperty(window, 'oppNetScore', { get: () => oppNetScore, configurable: true });


        // ────────── DOM ────────────────────────────────────────────────────────
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

        // ────────── PIN SLOT LOGIC & SYNC ─────────────────────────────────────
        function updateMpSlots() {
            const val = mpRoomInput.value.replace(/[^0-9]/g, '').slice(0, 5);
            mpRoomInput.value = val;
            const slots = document.querySelectorAll('.mp-slot');
            slots.forEach((slot, idx) => {
                const digitEl = slot.querySelector('.mp-digit');
                if (idx < val.length) {
                    digitEl.textContent = val[idx];
                    slot.classList.add('filled');
                    slot.classList.remove('active');
                } else {
                    digitEl.textContent = '';
                    slot.classList.remove('filled');
                    if (idx === val.length) {
                        slot.classList.add('active');
                    } else {
                        slot.classList.remove('active');
                    }
                }
            });
        }

        // ────────── OPEN ROOM MODAL ────────────────────────────────────────────
        multiplayerBtn.addEventListener('click', () => {
            initAudio();
            mpRoomInput.value = '';
            updateMpSlots();
            mpWaitingMsg.classList.add('hidden');
            mpJoinBtn.disabled = false;
            mpJoinBtn.textContent = 'JOIN ROOM \uD83D\uDE80';
            screenOverlay.classList.add('hidden');
            mpRoomModal.classList.remove('hidden');
            setTimeout(() => {
                mpRoomInput.focus();
                updateMpSlots();
            }, 100);
        });

        // Digits only, max 5, real-time slot update
        mpRoomInput.addEventListener('input', () => {
            updateMpSlots();
        });
        mpRoomInput.addEventListener('keydown', e => { if (e.key === 'Enter') mpJoinBtn.click(); });

        // Cancel → back to main menu
        mpCancelBtn.addEventListener('click', () => {
            abortRoomConnection();
            mpRoomModal.classList.add('hidden');
            screenOverlay.classList.remove('hidden');
            mainMenuModal.classList.remove('hidden');
        });

        mpNotFoundClose.addEventListener('click', () => { mpNotFound.classList.add('hidden'); });

        // ────────── JOIN BUTTON ────────────────────────────────────────────────
        mpJoinBtn.addEventListener('click', () => {
            const code = mpRoomInput.value.trim();
            if (code.length !== 5) {
                const pinBox = document.getElementById('mp-pin-container');
                if (pinBox) {
                    pinBox.style.borderColor = '#ff0055';
                    pinBox.style.boxShadow = '0 0 28px rgba(255,0,85,0.5)';
                    setTimeout(() => { pinBox.style.borderColor = ''; pinBox.style.boxShadow = ''; }, 1000);
                }
                return;
            }
            mpJoinBtn.disabled = true;
            mpJoinBtn.textContent = 'Connecting\u2026';
            enterRoom(code);
        });

        // ────────── ROOM ENTRY ─────────────────────────────────────────────────
        // Strategy: first try to CONNECT to the room (become client).
        // If nothing answers in 2 s, become HOST and wait.
        function enterRoom(code) {
            currentRoomCode = code;
            fallbackTriggered = false;
            const roomId = 'cyberracer-' + code;

            peer = new Peer();   // random ephemeral ID

            peer.on('open', () => {
                conn = peer.connect(roomId, { reliable: false, serialization: 'json' });

                conn.on('open', () => {
                    if (myPlayerSlot) return;       // race condition guard
                    myPlayerSlot = 'client';
                    setupConnection(conn);
                    try {
                        conn.send({
                            type: 'client_ready',
                            vehicleType: selectedVehicleType,
                            vehicleColor: playerCustomColor
                        });
                    } catch (e) { }
                    beginCountdown();
                });

                // Give the host 2 seconds to respond
                setTimeout(() => {
                    if (!myPlayerSlot) fallbackToHost(roomId);
                }, 2000);
            });

            peer.on('error', err => {
                // peer-unavailable = room doesn't exist yet → become host
                if (err.type === 'peer-unavailable' || err.type === 'unavailable-id') {
                    if (!myPlayerSlot) fallbackToHost(roomId);
                } else {
                    showRoomNotFound();
                    abortRoomConnection();
                }
            });
        }

        // ────────── BECOME HOST ────────────────────────────────────────────────
        function fallbackToHost(roomId) {
            if (fallbackTriggered) return;
            fallbackTriggered = true;

            peer.destroy();
            peer = new Peer(roomId);

            peer.on('open', () => {
                myPlayerSlot = 'host';
                mpWaitingMsg.classList.remove('hidden');
                mpWaitingMsg.textContent = '\uD83D\uDD17 Room ready! Waiting for opponent\u2026';
            });

            peer.on('connection', inConn => {
                conn = inConn;
                setupConnection(conn);
                beginCountdown();
            });

            peer.on('error', err => {
                if (err.type === 'unavailable-id') {
                    // Race condition: someone else became host first → be client
                    peer.destroy();
                    peer = new Peer();
                    peer.on('open', () => {
                        conn = peer.connect(roomId, { reliable: false, serialization: 'json' });
                        conn.on('open', () => {
                            if (myPlayerSlot) return;
                            myPlayerSlot = 'client';
                            setupConnection(conn);
                            beginCountdown();
                        });
                    });
                } else {
                    showRoomNotFound();
                    abortRoomConnection();
                }
            });
        }

        // ────────── DATA HANDLER ───────────────────────────────────────────────
        // Each message type is handled independently.
        // Controls are keyboard-driven locally — network data ONLY moves the
        // opponent ghost car and syncs the environment. Your own car is NEVER
        // affected by network data.
        // Rematch state tracking
        window.myRematchRequested = false;
        window.oppRematchRequested = false;
        window.isRematchStarting = false;

        window.triggerRematchRace = function () {
            window.myRematchRequested = false;
            window.oppRematchRequested = false;
            window.isRematchStarting = false;
            opponentAlive = true;

            // Reset scores & speeds
            score = 0;
            oppNetScore = 0;
            oppNetSpeed = 0;
            currentSpeed = 0;

            // Clear any ghost NPCs
            Object.keys(_clientNpcMeshes).forEach(id => {
                scene.remove(_clientNpcMeshes[id]);
                delete _clientNpcMeshes[id];
            });

            // Re-align track
            resetWorldTrack();

            // Hide any result modals
            const resModal = document.getElementById('mp-result-modal');
            if (resModal) resModal.classList.add('hidden');

            // Run the countdown and restart the multiplayer race!
            runCountdown();
        };

        function updateOpponentColor(color) {
            if (color === undefined || color === oppVehicleColor) return;
            oppVehicleColor = color;
            const curX = opponentCar ? opponentCar.position.x : null;
            const curZ = opponentCar ? opponentCar.position.z : null;
            spawnOpponentCar();
            if (opponentCar && curX !== null) {
                opponentCar.position.x = curX;
                opponentCar.position.z = curZ;
            }
        }

        function setupConnection(connection) {
            connection.on('data', data => {
                if (!data || !data.type) return;

                // ── Regular position/score sync (20 Hz) ──
                if (data.type === 'sync') {
                    updateOpponentColor(data.vehicleColor);
                    oppPrevX = oppNetX;
                    oppNetX = data.x !== undefined ? data.x : oppNetX;
                    oppNetScore = data.score !== undefined ? data.score : oppNetScore;
                    oppNetSpeed = data.speed !== undefined ? data.speed : oppNetSpeed;
                    if (data.pilotName) {
                        oppPilotName = data.pilotName;
                        const marker = document.getElementById('opponent-marker');
                        if (marker) marker.textContent = oppPilotName;
                    }
                    if (data.rawSpeed !== undefined) {
                        oppRawSpeed = data.rawSpeed;
                    } else if (data.speed !== undefined) {
                        oppRawSpeed = data.speed / 220;
                    }

                    // Dynamically adapt to opponent's chosen vehicle from lobby (car or bike)
                    if (data.vehicleType && data.vehicleType !== oppVehicleType) {
                        oppVehicleType = data.vehicleType;
                        if (opponentCar) {
                            const curX = opponentCar.position.x;
                            const curZ = opponentCar.position.z;
                            spawnOpponentCar();
                            if (opponentCar) {
                                opponentCar.position.x = curX;
                                opponentCar.position.z = curZ;
                            }
                        }
                    }

                    // Update opponent HUD — never touches playerCar or controls
                    oppScoreEl.textContent = oppNetScore;
                    oppSpeedEl.textContent = oppNetSpeed;

                    if (!data.alive && isGameRunning) handleOpponentDisconnect();

                    // ── CLIENT: sync NPC targets from host ──
                    if (myPlayerSlot === 'client') {
                        if (data.npcs) {
                            _applyHostNpcs(data.npcs);
                        }
                        if (data.lightState) {
                            trafficLightState = data.lightState;
                            trafficLightTimer = data.lightTimer || trafficLightTimer;
                        }
                    }
                }

                // ── Client ready with vehicle type ──
                else if (data.type === 'client_ready') {
                    updateOpponentColor(data.vehicleColor);
                    if (data.vehicleType && data.vehicleType !== oppVehicleType) {
                        oppVehicleType = data.vehicleType;
                        if (opponentCar) {
                            const curX = opponentCar.position.x;
                            const curZ = opponentCar.position.z;
                            spawnOpponentCar();
                            if (opponentCar) {
                                opponentCar.position.x = curX;
                                opponentCar.position.z = curZ;
                            }
                        }
                    }
                }

                // ── Host → Client: initial environment setup ──
                else if (data.type === 'env_init') {
                    updateOpponentColor(data.vehicleColor);
                    // Apply the SAME weather and light state the host has
                    setWeatherEnvironment(data.weather);
                    trafficLightState = data.lightState;
                    trafficLightTimer = data.lightTimer;
                    if (data.vehicleType && data.vehicleType !== oppVehicleType) {
                        oppVehicleType = data.vehicleType;
                        if (opponentCar) {
                            const curX = opponentCar.position.x;
                            const curZ = opponentCar.position.z;
                            spawnOpponentCar();
                            if (opponentCar) {
                                opponentCar.position.x = curX;
                                opponentCar.position.z = curZ;
                            }
                        }
                    }
                }

                // ── Host → Client: periodic environment sync ──
                else if (data.type === 'env_sync') {
                    // Keep weather and traffic lights in lock-step
                    if (weatherMode !== data.weather) {
                        setWeatherEnvironment(data.weather);
                    }
                    trafficLightState = data.lightState;
                    trafficLightTimer = data.lightTimer;
                }

                // ── Countdown trigger (host → client) ──
                else if (data.type === 'countdown_go') {
                    if (myPlayerSlot === 'client') {
                        const resModal = document.getElementById('mp-result-modal');
                        if (resModal) resModal.classList.add('hidden');
                        runCountdown();
                    }
                }

                // ── Rematch request from opponent ──
                else if (data.type === 'rematch_request') {
                    window.oppRematchRequested = true;
                    const rBtn = document.querySelector('#mp-result-modal #mpr-rematch-btn');
                    const rStatus = document.querySelector('#mp-result-modal #mpr-rematch-status');

                    if (window.myRematchRequested) {
                        // Both players have requested rematch!
                        window.isRematchStarting = true;
                        if (rStatus) {
                            rStatus.classList.remove('hidden');
                            rStatus.textContent = "BOTH PLAYERS READY! STARTING...";
                        }
                        try { window.conn.send({ type: 'rematch_accept' }); } catch (e) { }

                        setTimeout(() => {
                            const resModal = document.getElementById('mp-result-modal');
                            if (resModal) resModal.classList.add('hidden');
                            if (myPlayerSlot === 'host') {
                                try { window.conn.send({ type: 'countdown_go' }); } catch (e) { }
                            }
                            window.triggerRematchRace();
                        }, 600);
                    } else {
                        // Opponent wants rematch, we haven't clicked yet
                        if (rBtn) {
                            rBtn.textContent = 'ACCEPT REMATCH! ⚡';
                            rBtn.classList.add('pulse-ready');
                        }
                        if (rStatus) {
                            rStatus.classList.remove('hidden');
                            rStatus.textContent = 'Opponent requested a rematch! Tap to accept.';
                        }
                    }
                }

                // ── Rematch accepted by opponent ──
                else if (data.type === 'rematch_accept') {
                    window.isRematchStarting = true;
                    const rStatus = document.querySelector('#mp-result-modal #mpr-rematch-status');
                    if (rStatus) {
                        rStatus.classList.remove('hidden');
                        rStatus.textContent = "REMATCH ACCEPTED! STARTING...";
                    }
                    setTimeout(() => {
                        const resModal = document.getElementById('mp-result-modal');
                        if (resModal) resModal.classList.add('hidden');
                        if (myPlayerSlot === 'host') {
                            try { window.conn.send({ type: 'countdown_go' }); } catch (e) { }
                        }
                        window.triggerRematchRace();
                    }, 600);
                }

                // ── Graceful disconnect ──
                else if (data.type === 'disconnect') {
                    handleOpponentDisconnect();
                }

                // ── Opponent crashed → we win! ──
                else if (data.type === 'opponent_crashed') {
                    if (!isMultiplayerMode || !opponentAlive) return;
                    opponentAlive = false;
                    // Update final opponent score before showing result
                    if (data.score !== undefined) {
                        oppNetScore = data.score;
                        if (oppScoreEl) oppScoreEl.textContent = oppNetScore;
                    }
                    // Trigger explosive crash on opponent vehicle so winner sees it flip & explode!
                    triggerOpponentCrash();

                    // Allow dramatic explosion before showing winner screen
                    setTimeout(() => {
                        isGameRunning = false;
                        clearPressedKeys();
                        stopEngineSound();
                        stopRainSound();
                        window.showMpResult('winner', Math.floor(score), oppNetScore);
                    }, 1250);
                }
            });

            connection.on('close', () => { handleOpponentDisconnect(); });
            connection.on('error', () => { handleOpponentDisconnect(); });
        }

        // ────────── COUNTDOWN ─────────────────────────────────────────────────
        function beginCountdown() {
            // Host initiates env_init + countdown_go to client
            if (myPlayerSlot === 'host') {
                // Pick a shared random weather seed (Morning or Night)
                const sharedWeather = Math.floor(Math.random() * 2);
                setWeatherEnvironment(sharedWeather);
                trafficLightState = 'GREEN';
                trafficLightTimer = 0;

                if (conn && conn.open) {
                    conn.send({
                        type: 'env_init',
                        weather: sharedWeather,
                        lightState: 'GREEN',
                        lightTimer: 0,
                        vehicleType: selectedVehicleType,
                        vehicleColor: playerCustomColor
                    });
                    setTimeout(() => {
                        if (conn && conn.open) conn.send({ type: 'countdown_go' });
                    }, 200);
                }
            }
            runCountdown();
        }

        let isCountdownRunning = false;
        function runCountdown() {
            if (isCountdownRunning) return;
            isCountdownRunning = true;

            // Launch game engine (spawns cars, road, etc.) but freeze controls
            startMultiplayerGame();

            // Inject keyframe CSS once
            if (!document.getElementById('mp-count-style')) {
                const st = document.createElement('style');
                st.id = 'mp-count-style';
                st.textContent = `
                    @keyframes mpCountPop {
                        0%   { transform: scale(0.2) rotate(-5deg); opacity: 0; }
                        65%  { transform: scale(1.2) rotate(2deg);  opacity: 1; }
                        100% { transform: scale(1)   rotate(0deg);  opacity: 1; }
                    }
                    @keyframes mpCountFade { to { opacity: 0; transform: scale(1.4); } }
                `;
                document.head.appendChild(st);
            }

            const overlay = document.createElement('div');
            overlay.id = 'mp-countdown';
            overlay.style.cssText = `
                position:absolute; top:0; left:0; width:100%; height:100%;
                display:flex; flex-direction:column;
                justify-content:center; align-items:center;
                z-index:70; pointer-events:none;
            `;
            document.body.appendChild(overlay);

            const nums = ['3', '2', '1', 'GO!'];
            let idx = 0;

            function showNum() {
                overlay.innerHTML = '';
                const label = nums[idx];
                const isGo = label === 'GO!';

                const n = document.createElement('div');
                n.textContent = label;
                n.style.cssText = `
                    font-size: ${isGo ? 96 : 130}px;
                    font-weight: 900;
                    font-family: 'Courier New', monospace;
                    color: ${isGo ? '#00ff88' : '#ffffff'};
                    text-shadow: 0 0 50px ${isGo ? '#00ff88' : '#00f0ff'},
                                 0 0 100px rgba(0,240,255,0.3);
                    animation: mpCountPop 0.45s cubic-bezier(.175,.885,.32,1.275) forwards;
                    letter-spacing: 6px;
                `;
                overlay.appendChild(n);
                idx++;

                if (idx < nums.length) {
                    setTimeout(showNum, 850);
                } else {
                    // "GO!" fades out, then controls unlock
                    setTimeout(() => {
                        n.style.animation = 'mpCountFade 0.4s ease-out forwards';
                        setTimeout(() => {
                            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                            isCountdownRunning = false;
                            currentSpeed = baseSpeed;
                            isPaused = false;   // ← controls and speed unlocked here
                        }, 400);
                    }, 600);
                }
            }

            isPaused = true;   // freeze controls during countdown
            currentSpeed = 0;  // cars are stationary before race starts
            if (speedDisplay) speedDisplay.innerText = "0";
            showNum();
        }

        // ────────── POPUPS ─────────────────────────────────────────────────────
        function showRoomNotFound() {
            mpWaitingMsg.classList.add('hidden');
            mpNotFound.classList.remove('hidden');
            setTimeout(() => { mpNotFound.classList.add('hidden'); }, 4000);
            mpJoinBtn.disabled = false;
            mpJoinBtn.textContent = 'JOIN ROOM \uD83D\uDE80';
        }

        function abortRoomConnection() {
            fallbackTriggered = false;
            isCountdownRunning = false;
            if (conn) { try { conn.close(); } catch (e) { } conn = null; }
            if (peer) { try { peer.destroy(); } catch (e) { } peer = null; }
            if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
            if (envSyncInterval) { clearInterval(envSyncInterval); envSyncInterval = null; }
            currentRoomCode = null;
            myPlayerSlot = null;
        }

        // ────────── START MULTIPLAYER SESSION ──────────────────────────────────
        function startMultiplayerGame() {
            isMultiplayerMode = true;
            mpRoomModal.classList.add('hidden');
            oppHud.classList.remove('hidden');
            mpStatusBadge.classList.remove('hidden');

            // Reset scores, speeds, and state
            score = 0;
            oppNetScore = 0;
            oppNetSpeed = 0;
            currentSpeed = 0;
            _npcIdCounter = 0;

            // Clear any ghost NPCs
            Object.keys(_clientNpcMeshes).forEach(id => {
                scene.remove(_clientNpcMeshes[id]);
                delete _clientNpcMeshes[id];
            });

            // Start normal single-player engine
            startGame();

            // Re-align track so road segments, bridges, and signals are 100% in phase
            resetWorldTrack();

            // Keep cars stationary during countdown
            currentSpeed = 0;
            if (speedDisplay) speedDisplay.innerText = "0";

            // Player 1 (Host) on RIGHT side (+2.5), Player 2 (Client) on LEFT side (-2.5) of center white dotted line
            if (playerCar) {
                const startX = (myPlayerSlot === 'host') ? 2.5 : -2.5;
                playerCar.position.set(startX, 0, 0);
                playerCar.rotation.set(0, 0, 0);
                camera.position.x = startX * 0.3;
            }

            // Spawn the opponent ghost car on the opposite lane
            spawnOpponentCar();

            // Begin position sync (~20 Hz)
            startPositionSync();

            // Host: also start environment sync (every 3 seconds)
            if (myPlayerSlot === 'host') {
                startEnvSync();
            }
        }

        // ────────── GHOST OPPONENT CAR ─────────────────────────────────────────
        function spawnOpponentCar() {
            if (opponentCar) { scene.remove(opponentCar); opponentCar = null; }

            // Render the vehicle type (Car or Bike) chosen by the opponent in the lobby
            const isBike = (oppVehicleType === 'bike');
            const colorHex = oppVehicleColor;
            if (isBike) {
                opponentCar = createRealisticBike(colorHex, false);
            } else {
                opponentCar = createRealisticCar(colorHex, false);
            }
            opponentCar.userData.isOpponentGhost = true;   // safety tag

            // Blue neon under-glow
            const glow = new THREE.PointLight(colorHex, 4, 12);
            glow.position.set(0, -0.15, 0);
            opponentCar.add(glow);

            // Opponent sits on the opposite side of the center line:
            // Host sees Client on LEFT (-2.5), Client sees Host on RIGHT (+2.5)
            const oppStartX = (myPlayerSlot === 'host') ? -2.5 : 2.5;
            opponentCar.position.set(oppStartX, 0, 0);
            oppNetX = oppStartX;
            oppPrevX = oppStartX;

            // Add Opponent Marker UI
            let marker = document.getElementById('opponent-marker');
            if (!marker) {
                marker = document.createElement('div');
                marker.id = 'opponent-marker';
                marker.style.cssText = `
                    position: absolute;
                    top: -1000px; left: -1000px;
                    transform: translate(-50%, -100%);
                    color: #00f0ff;
                    font-size: 14px;
                    font-weight: bold;
                    font-family: 'Courier New', monospace;
                    text-shadow: 0 0 5px #00f0ff, 0 0 10px #00f0ff;
                    pointer-events: none;
                    z-index: 10;
                    background: rgba(0, 20, 40, 0.6);
                    padding: 2px 8px;
                    border: 1px solid #00f0ff;
                    border-radius: 4px;
                `;
                marker.textContent = oppPilotName;
                document.body.appendChild(marker);
            }

            scene.add(opponentCar);
            opponentAlive = true;
        }

        // ────────── OPPONENT CAR FRAME UPDATE ──────────────────────────────────
        function updateOpponentCar(delta) {
            if (!opponentCar || !isMultiplayerMode) return;

            // ── X: smoothly lerp to the latest network X ──
            const xLerp = THREE.MathUtils.lerp(opponentCar.position.x, oppNetX, 0.22);
            const xDelta = xLerp - opponentCar.position.x;
            opponentCar.position.x = THREE.MathUtils.clamp(
                xLerp, -mainRoadVehicleLimit, mainRoadVehicleLimit
            );

            // ── Z: Relative motion physics & smooth network distance ──
            const frameDelta = (typeof delta === 'number' && delta > 0) ? delta : (1 / 60);
            if (isGameRunning && !isPaused) {
                // If local player brakes (currentSpeed drops to 0), opponent zooms ahead (-Z) at oppRawSpeed!
                // If opponent brakes (oppRawSpeed drops to 0), opponent falls backward (+Z) as local drives ahead!
                const relativeZVelocity = (currentSpeed - oppRawSpeed) * frameDelta * 90;
                opponentCar.position.z += relativeZVelocity;
            }

            // Score acts as total true distance traveled:
            const myDistance = score * 0.36;
            const oppDistance = oppNetScore * 0.36;
            const targetZ = myDistance - oppDistance;
            const clampedTargetZ = THREE.MathUtils.clamp(targetZ, -180, 25);

            // Smoothly anchor to true network target to eliminate accumulation drift:
            opponentCar.position.z = THREE.MathUtils.lerp(
                opponentCar.position.z, clampedTargetZ, 0.08
            );
            opponentCar.position.z = THREE.MathUtils.clamp(opponentCar.position.z, -180, 25);

            // ── Update 2D Marker Position ──
            const marker = document.getElementById('opponent-marker');
            if (marker && camera) {
                const pos = opponentCar.position.clone();
                pos.y += 1.5; // Slightly above the car
                pos.project(camera);

                if (pos.z > 1) {
                    marker.style.display = 'none';
                } else {
                    marker.style.display = 'block';
                    const x = (pos.x * .5 + .5) * window.innerWidth;
                    const y = (pos.y * -.5 + .5) * window.innerHeight;
                    marker.style.left = `${x}px`;
                    marker.style.top = `${y}px`;

                    const dist = Math.abs(opponentCar.position.z);
                    const scale = Math.max(0.3, 1.0 - (dist / 150));
                    marker.style.transform = `translate(-50%, -100%) scale(${scale})`;
                }
            }

            // ── Roll/tilt: tilt left/right based on steering direction ──
            const steerDir = xDelta;   // positive = moving right
            const targetRoll = -steerDir * 1.8;   // tilt into the turn
            opponentCar.rotation.z = THREE.MathUtils.lerp(
                opponentCar.rotation.z, THREE.MathUtils.clamp(targetRoll, -0.25, 0.25), 0.15
            );
        }

        // ────────── POSITION SYNC LOOP (~20 Hz) ───────────────────────────────
        let _lastBgSyncTime = performance.now();
        function startPositionSync() {
            if (syncInterval) clearInterval(syncInterval);
            _lastBgSyncTime = performance.now();
            syncInterval = setInterval(() => {
                if (!isGameRunning || !conn || !conn.open || !playerCar) return;

                // When this tab is in background (requestAnimationFrame throttled by browser),
                // advance score and time using real clock delta so the other player sees active driving
                const now = performance.now();
                if (document.hidden && !isPaused && currentSpeed > 0) {
                    const bgDelta = (now - _lastBgSyncTime) / 1000;
                    if (bgDelta > 0 && bgDelta < 1.0) {
                        score += currentSpeed * bgDelta * 250;
                    }
                }
                _lastBgSyncTime = now;

                const packet = {
                    type: 'sync',
                    x: Math.round(playerCar.position.x * 100) / 100,
                    score: Math.floor(score),
                    speed: Math.floor(currentSpeed * 220),
                    rawSpeed: currentSpeed,
                    vehicleType: selectedVehicleType,
                    vehicleColor: playerCustomColor,
                    pilotName: getPilotName(),
                    alive: true
                };

                // ── HOST: broadcast ALL NPC traffic relative to host car ──
                if (myPlayerSlot === 'host') {
                    packet.npcs = trafficCars.map(car => ({
                        id: car.userData.npcId,
                        t: car.userData.npcType || 'car',
                        x: Math.round(car.position.x * 100) / 100,
                        z: Math.round(car.position.z * 100) / 100,
                        s: Math.round((car.userData.cruiseSpeed || 0.12) * 1000) / 1000
                    }));
                    packet.lightState = trafficLightState;
                    packet.lightTimer = Math.round(trafficLightTimer * 100) / 100;
                }

                conn.send(packet);
            }, 50);
        }

        // ── NPC ID counter and ghost NPC state ──
        var _npcIdCounter = 0;
        var _clientNpcMeshes = {};        // id → Three.js mesh (client-side ghost NPCs)

        function _ensureNpcId(car) {
            if (!car.userData.npcId) {
                car.userData.npcId = ++_npcIdCounter;
            }
        }

        // Called inside update() loop, host-side only — stamps each NPC with a stable ID
        function _tagTrafficIds() {
            trafficCars.forEach(_ensureNpcId);
        }

        // Client: receive NPC data from host and update/spawn ghost meshes.
        // hostZ = opponentCar.position.z (where Host is relative to Client)
        // npc.z = where NPC is relative to Host
        // Therefore in Client's world: targetZ = hostZ + npc.z
        function _applyHostNpcs(npcs) {
            if (!Array.isArray(npcs) || !opponentCar) return;

            const seenIds = new Set();
            const hostZ = opponentCar.position.z;

            npcs.forEach(npc => {
                if (!npc.id) return;
                seenIds.add(npc.id);

                const targetZ = hostZ + npc.z;

                if (_clientNpcMeshes[npc.id]) {
                    const mesh = _clientNpcMeshes[npc.id];
                    mesh.userData.cruiseSpeed = npc.s || 0.12;

                    // Smooth reconciliation
                    const zDrift = targetZ - mesh.position.z;
                    if (Math.abs(zDrift) > 10) {
                        mesh.position.z = targetZ;
                    } else {
                        mesh.position.z += zDrift * 0.45;
                    }
                    mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, npc.x, 0.45);
                } else {
                    let mesh;
                    const t = npc.t;
                    if (t === 'truck') mesh = createTataTruck();
                    else if (t === 'schoolbus') mesh = createSchoolBus();
                    else if (t === 'thar') mesh = createMahindraThar();
                    else if (t === 'bike') mesh = createMotorcycle();
                    else if (t === 'police') mesh = createPoliceCar();
                    else if (t === 'ambulance') mesh = createAmbulance();
                    else mesh = createRealisticCar(0x1e90ff);

                    mesh.userData.npcId = npc.id;
                    mesh.userData.isClientGhostNpc = true;
                    mesh.userData.npcType = t;
                    mesh.userData.cruiseSpeed = npc.s || 0.12;
                    mesh.position.set(npc.x, 0, targetZ);
                    scene.add(mesh);
                    _clientNpcMeshes[npc.id] = mesh;
                }
            });

            // Remove ghost NPCs no longer present on host
            Object.keys(_clientNpcMeshes).forEach(id => {
                if (!seenIds.has(parseInt(id))) {
                    scene.remove(_clientNpcMeshes[id]);
                    delete _clientNpcMeshes[id];
                }
            });
        }

        // Called every frame on client: advance ghost NPCs with dead reckoning
        function _advanceClientNpcs(delta, playerSpeed) {
            const toRemove = [];
            const ghostMeshes = Object.values(_clientNpcMeshes);
            for (let i = 0; i < ghostMeshes.length; i++) {
                const mesh = ghostMeshes[i];
                const cruiseSpeed = mesh.userData.cruiseSpeed || 0.12;
                const frameMove = (playerSpeed - cruiseSpeed) * delta * 90;
                mesh.position.z += frameMove;

                if (mesh.position.z > 25 || mesh.position.z < -380) {
                    toRemove.push(mesh.userData.npcId);
                }
            }
            toRemove.forEach(id => {
                if (_clientNpcMeshes[id]) {
                    scene.remove(_clientNpcMeshes[id]);
                    delete _clientNpcMeshes[id];
                }
            });
        }

        // ────────── ENVIRONMENT SYNC LOOP (host only, every 3 s) ──────────────
        // Host sends current weather and traffic-light state to client.
        // This guarantees both players always see the SAME:
        //   • Sky colour / rain / fog
        //   • Traffic light colour
        function startEnvSync() {
            if (envSyncInterval) clearInterval(envSyncInterval);
            envSyncInterval = setInterval(() => {
                if (!conn || !conn.open) return;
                conn.send({
                    type: 'env_sync',
                    weather: weatherMode,
                    lightState: trafficLightState,
                    lightTimer: trafficLightTimer
                });
            }, 3000);
        }

        // ────────── OPPONENT DISCONNECTED ──────────────────────────────────────
        function handleOpponentDisconnect() {
            const rBtn = document.querySelector('#mp-result-modal #mpr-rematch-btn');
            const rStatus = document.querySelector('#mp-result-modal #mpr-rematch-status');
            if (rStatus) {
                rStatus.classList.remove('hidden');
                rStatus.textContent = 'Opponent left the room.';
            }
            if (rBtn) {
                rBtn.textContent = 'PLAY SOLO';
                rBtn.classList.remove('waiting', 'pulse-ready');
                rBtn.disabled = false;
                rBtn.onclick = () => {
                    const resModal = document.getElementById('mp-result-modal');
                    if (resModal) resModal.classList.add('hidden');
                    cleanupMultiplayer();
                    startGame();
                };
            }

            if (!isMultiplayerMode || !opponentAlive) return;
            opponentAlive = false;
            // Opponent dropped connection without crashing — show as a win by default
            isGameRunning = false;
            clearPressedKeys();
            stopEngineSound();
            stopRainSound();
            window.showMpResult('winner', Math.floor(score), oppNetScore, 'Opponent left the race');
        }

        // ────────── SHOW RESULT MODAL ───────────────────────────────────────────
        // outcome: 'winner' | 'loser'
        window.showMpResult = function (outcome, myScore, oppScore, customSubtitle) {
            const modal = document.getElementById('mp-result-modal');
            const box = document.getElementById('mpr-box');
            const trophy = document.getElementById('mpr-trophy');
            const title = document.getElementById('mpr-title');
            const subtitle = document.getElementById('mpr-subtitle');
            const myEl = document.getElementById('mpr-my-score');
            const oppEl = document.getElementById('mpr-opp-score');
            const leaveBtn = document.getElementById('mpr-leave-btn');
            if (!modal) return;

            box.className = 'mpr-box ' + outcome;  // 'winner' or 'loser'

            if (outcome === 'winner') {
                trophy.textContent = '🏆';
                title.textContent = 'YOU WIN!';
                subtitle.textContent = customSubtitle || 'OPPONENT CRASHED';
            } else {
                trophy.textContent = '💥';
                title.textContent = 'YOU LOSE!';
                subtitle.textContent = customSubtitle || 'YOU CRASHED';
            }

            myEl.textContent = myScore;
            oppEl.textContent = oppScore;

            // Re-trigger animation by cloning the node
            const fresh = modal.cloneNode(true);
            fresh.classList.remove('hidden');
            modal.parentNode.replaceChild(fresh, modal);

            // Reset rematch flags for new result view
            window.isRematchStarting = false;

            const rematchBtn = fresh.querySelector('#mpr-rematch-btn');
            const rematchStatus = fresh.querySelector('#mpr-rematch-status');

            // Check if opponent already requested rematch before result card rendered
            if (rematchBtn) {
                if (window.oppRematchRequested) {
                    rematchBtn.textContent = 'ACCEPT REMATCH! ⚡';
                    rematchBtn.classList.add('pulse-ready');
                    if (rematchStatus) {
                        rematchStatus.classList.remove('hidden');
                        rematchStatus.textContent = 'Opponent requested a rematch! Tap to accept.';
                    }
                } else {
                    rematchBtn.textContent = 'PLAY AGAIN';
                    rematchBtn.classList.remove('waiting', 'pulse-ready');
                    rematchBtn.disabled = false;
                }

                rematchBtn.addEventListener('click', () => {
                    if (window.isRematchStarting) return;

                    // If connected via WebRTC
                    if (window.conn && window.conn.open) {
                        window.myRematchRequested = true;

                        if (window.oppRematchRequested) {
                            // Both players want rematch!
                            window.isRematchStarting = true;
                            rematchBtn.textContent = 'STARTING REMATCH...';
                            rematchBtn.classList.add('waiting');
                            rematchBtn.disabled = true;
                            if (rematchStatus) {
                                rematchStatus.classList.remove('hidden');
                                rematchStatus.textContent = 'Both players ready! Starting in 3, 2, 1...';
                            }
                            try { window.conn.send({ type: 'rematch_accept' }); } catch (e) { }

                            setTimeout(() => {
                                fresh.classList.add('hidden');
                                if (myPlayerSlot === 'host') {
                                    try { window.conn.send({ type: 'countdown_go' }); } catch (e) { }
                                }
                                window.triggerRematchRace();
                            }, 600);
                        } else {
                            // Send rematch request to opponent
                            try { window.conn.send({ type: 'rematch_request' }); } catch (e) { }
                            rematchBtn.textContent = 'WAITING FOR OPPONENT...';
                            rematchBtn.classList.add('waiting');
                            rematchBtn.disabled = true;
                            if (rematchStatus) {
                                rematchStatus.classList.remove('hidden');
                                rematchStatus.textContent = 'Rematch challenge sent! Waiting for opponent...';
                            }
                        }
                    } else {
                        // Connection lost or offline test -> start game directly
                        fresh.classList.add('hidden');
                        cleanupMultiplayer();
                        startGame();
                    }
                });
            }

            // Wire up leave button on the fresh clone
            fresh.querySelector('#mpr-leave-btn').addEventListener('click', () => {
                fresh.classList.add('hidden');
                window.quitToMainMenu();
            });

            startLobbyMusic();
        };

        // ────────── CLEANUP ─────────────────────────────────────────────────────
        function cleanupMultiplayer() {
            if (!isMultiplayerMode) return;
            isMultiplayerMode = false;

            if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
            if (envSyncInterval) { clearInterval(envSyncInterval); envSyncInterval = null; }

            if (conn && conn.open) {
                try { conn.send({ type: 'disconnect', alive: false }); } catch (e) { }
                setTimeout(() => { try { conn.close(); } catch (e) { } }, 150);
            }
            if (peer) {
                setTimeout(() => { try { peer.destroy(); peer = null; } catch (e) { } }, 300);
            }

            if (opponentCar) { scene.remove(opponentCar); opponentCar = null; }
            const marker = document.getElementById('opponent-marker');
            if (marker) marker.remove();
            oppHud.classList.add('hidden');
            mpStatusBadge.classList.add('hidden');

            // Hide result modal if open
            const existingResult = document.getElementById('mp-result-modal');
            if (existingResult) existingResult.classList.add('hidden');

            const cd = document.getElementById('mp-countdown');
            if (cd && cd.parentNode) cd.parentNode.removeChild(cd);

            currentRoomCode = null;
            myPlayerSlot = null;
            opponentAlive = true;   // reset for next race
            fallbackTriggered = false;
            isCountdownRunning = false;
            _lastMoveDist = 0;
            oppNetScore = 0;
            oppNetX = 0;
            oppPrevX = 0;

            // Remove all ghost NPC meshes
            Object.keys(_clientNpcMeshes).forEach(id => {
                scene.remove(_clientNpcMeshes[id]);
                delete _clientNpcMeshes[id];
            });
        }

        // ────────── PATCH gameOver / quitToMainMenu ────────────────────────────
        const _origGameOver = gameOver;
        window.gameOver = function () {
            if (isMultiplayerMode) {
                // Let gameOver() handle the multiplayer crash packet & scorecard
                _origGameOver();
            } else {
                cleanupMultiplayer();
                _origGameOver();
            }
        };

        const _origQuit = quitToMainMenu;
        window.quitToMainMenu = function () {
            cleanupMultiplayer();
            _origQuit();
        };

        quitGameBtn.removeEventListener('click', quitToMainMenu);
        quitGameBtn.addEventListener('click', () => { window.quitToMainMenu(); });




    
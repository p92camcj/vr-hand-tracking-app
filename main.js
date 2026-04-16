const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const loadingScreen = document.getElementById('loading-screen');
const statusDot = document.querySelector('.dot');
const statusText = document.querySelector('.status-text');

// Configuration
const MAX_HANDS = 4;
const CONFIDENCE_LEVEL = 0.9;
const SPARK_INTENSITY = 8;
const PALETTE = ['#00f2ff', '#ff00ff', '#39ff14', '#ffff00', '#ff3131', '#ffffff'];

// State
let drawings = []; 
let particles = [];
let handStates = Array.from({ length: MAX_HANDS }, () => ({
    currentPath: null,
    isDragging: false,
    lastFingerPos: { x: 0, y: 0 },
    selectedDrawing: null
}));
let manualColor = PALETTE[0];
let activeHandsCount = 0;

// HUD Interactivity
document.querySelectorAll('.tool').forEach(tool => {
    tool.addEventListener('click', (e) => {
        document.querySelector('.tool.active').classList.remove('active');
        e.target.classList.add('active');
        manualColor = e.target.getAttribute('data-color');
    });
});

document.getElementById('undo-btn').addEventListener('click', () => {
    drawings.pop();
});

document.getElementById('clear-btn').addEventListener('click', () => {
    if (confirm('¿Limpiar todo el lienzo?')) {
        drawings = [];
        particles = [];
        handStates.forEach(s => {
            s.currentPath = null;
            s.isDragging = false;
            s.selectedDrawing = null;
        });
    }
});

// Canvas Setup
function setupCanvas() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', setupCanvas);
setupCanvas();

// Particle System
class Spark {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const force = Math.random() * 12 + 6;
        this.speedX = Math.cos(angle) * force;
        this.speedY = Math.sin(angle) * force;
        
        this.life = 1.0;
        this.decay = Math.random() * 0.04 + 0.02;
        this.gravity = 0.35;
        this.friction = 0.94; 
    }

    update() {
        this.speedX *= this.friction;
        this.speedY *= this.friction;
        this.speedY += this.gravity;
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
    }

    draw() {
        if (this.life <= 0) return;

        canvasCtx.save();
        canvasCtx.globalAlpha = this.life;
        canvasCtx.strokeStyle = this.color;
        canvasCtx.lineWidth = 3 * this.life;
        canvasCtx.lineCap = 'round';
        
        canvasCtx.shadowBlur = 15 * this.life;
        canvasCtx.shadowColor = this.color;

        canvasCtx.beginPath();
        canvasCtx.moveTo(this.x, this.y);
        const tailX = this.x - this.speedX * 0.7;
        const tailY = this.y - this.speedY * 0.7;
        canvasCtx.lineTo(tailX, tailY);
        canvasCtx.stroke();
        canvasCtx.restore();
    }
}

function createSparkEffect(x, y, color) {
    for (let i = 0; i < SPARK_INTENSITY; i++) {
        particles.push(new Spark(x, y, color));
    }
}

// Utility Functions
function getDistance(p1, p2) {
    return Math.sqrt(
        Math.pow((p1.x - p2.x) * canvasElement.width, 2) + 
        Math.pow((p1.y - p2.y) * canvasElement.height, 2)
    );
}

function isStrictlyIndexUp(lm) {
    const thumbOpen = getDistance(lm[4], lm[17]) > getDistance(lm[3], lm[17]);
    const indexOpen = lm[8].y < lm[6].y;
    const middleOpen = lm[12].y < lm[10].y;
    const ringOpen = lm[16].y < lm[14].y;
    const pinkyOpen = lm[20].y < lm[18].y;
    return indexOpen && !middleOpen && !ringOpen && !pinkyOpen && !thumbOpen;
}

function findDrawingAt(x, y) {
    const padding = 80; 
    for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        for (let p of d.points) {
            if (Math.hypot(x - p.x, y - p.y) < padding) return d;
        }
    }
    return null;
}

// Render Functions
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
}

function drawStoredPaths() {
    canvasCtx.lineCap = 'round';
    canvasCtx.lineJoin = 'round';

    drawings.forEach(d => {
        if (d.points.length < 2) return;
        
        const isBeingDragged = handStates.some(s => s.selectedDrawing === d);
        
        canvasCtx.save();
        canvasCtx.shadowBlur = isBeingDragged ? 30 : 20;
        canvasCtx.shadowColor = isBeingDragged ? '#ffffff' : d.color;
        canvasCtx.strokeStyle = isBeingDragged ? '#ffffff' : d.color;
        canvasCtx.lineWidth = isBeingDragged ? 10 : 6;
        
        canvasCtx.beginPath();
        canvasCtx.moveTo(d.points[0].x, d.points[0].y);
        for (let i = 1; i < d.points.length; i++) {
            canvasCtx.lineTo(d.points[i].x, d.points[i].y);
        }
        canvasCtx.stroke();

        // High Intensity Core
        canvasCtx.shadowBlur = 0;
        canvasCtx.strokeStyle = isBeingDragged ? '#fffde7' : '#ffffff';
        canvasCtx.lineWidth = isBeingDragged ? 4 : 2;
        canvasCtx.stroke();
        
        canvasCtx.restore();
    });
}

function drawNeonSkeleton(landmarks, color) {
    canvasCtx.save();
    canvasCtx.shadowBlur = 15;
    canvasCtx.shadowColor = color;
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 3;

    // Conexiones de la mano (21 puntos)
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], // Pulgar
        [0, 5], [5, 6], [6, 7], [7, 8], // Índice
        [5, 9], [9, 10], [10, 11], [11, 12], // Medio
        [9, 13], [13, 14], [14, 15], [15, 16], // Anular
        [13, 17], [17, 18], [18, 19], [19, 20], // Meñique
        [0, 17] // Palma
    ];

    connections.forEach(([a, b]) => {
        canvasCtx.beginPath();
        canvasCtx.moveTo(landmarks[a].x * canvasElement.width, landmarks[a].y * canvasElement.height);
        canvasCtx.lineTo(landmarks[b].x * canvasElement.width, landmarks[b].y * canvasElement.height);
        canvasCtx.stroke();
    });

    // Puntos/Articulaciones
    canvasCtx.fillStyle = color;
    landmarks.forEach(point => {
        canvasCtx.beginPath();
        canvasCtx.arc(point.x * canvasElement.width, point.y * canvasElement.height, 4, 0, Math.PI * 2);
        canvasCtx.fill();
    });
    canvasCtx.restore();
}

function updateHUDStatus() {
    if (activeHandsCount > 0) {
        statusDot.classList.add('active');
        statusText.textContent = `${activeHandsCount} MANO(S) ACTIVA(S)`;
    } else {
        statusDot.classList.remove('active');
        statusText.textContent = 'ESPERANDO MANO...';
    }
}

// MediaPipe Results Callback
function onResults(results) {
    if (loadingScreen.style.display !== 'none') loadingScreen.style.display = 'none';

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Ambient Dark Background
    canvasCtx.fillStyle = '#030712';
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    drawStoredPaths();
    updateParticles();

    activeHandsCount = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;

    if (results.multiHandLandmarks) {
        results.multiHandLandmarks.forEach((hand, idx) => {
            if (idx >= MAX_HANDS) return;
            
            const state = handStates[idx];
            // Si hay paleta seleccionada manualmente, la primera mano la usa. 
            // Las demás usan colores predefinidos de la paleta.
            const handColor = idx === 0 ? manualColor : PALETTE[idx % PALETTE.length];
            
            const indexTip = hand[8];
            const thumbTip = hand[4];
            const ix = indexTip.x * canvasElement.width;
            const iy = indexTip.y * canvasElement.height;
            const tx = thumbTip.x * canvasElement.width;
            const ty = thumbTip.y * canvasElement.height;
            const pinchDist = getDistance(hand[4], hand[8]);

            // Logic: Draw
            if (isStrictlyIndexUp(hand)) {
                if (!state.currentPath) {
                    state.currentPath = { points: [], id: Date.now() + idx, color: handColor };
                    drawings.push(state.currentPath);
                }
                state.currentPath.points.push({ x: ix, y: iy });
                createSparkEffect(ix, iy, handColor);
                state.isDragging = false;
                state.selectedDrawing = null;
            } 
            // Logic: Move (Pinch)
            else if (pinchDist < 40) {
                const midX = (ix + tx) / 2;
                const midY = (iy + ty) / 2;

                if (!state.isDragging) {
                    state.selectedDrawing = findDrawingAt(midX, midY);
                    if (state.selectedDrawing) {
                        state.isDragging = true;
                        state.lastFingerPos = { x: midX, y: midY };
                    }
                }

                if (state.isDragging && state.selectedDrawing) {
                    const dx = midX - state.lastFingerPos.x;
                    const dy = midY - state.lastFingerPos.y;
                    state.selectedDrawing.points.forEach(p => {
                        p.x += dx;
                        p.y += dy;
                    });
                    state.lastFingerPos = { x: midX, y: midY };
                }
                state.currentPath = null;
            }
            // Logic: Idle
            else {
                state.currentPath = null;
                state.isDragging = false;
                state.selectedDrawing = null;
            }

            // Restore fluid skeleton drawing
            drawNeonSkeleton(hand, handColor);
        });
    } else {
        // Reset states if no hands detected
        handStates.forEach(s => {
            s.currentPath = null;
            s.isDragging = false;
            s.selectedDrawing = null;
        });
    }
    
    updateHUDStatus();
    canvasCtx.restore();
}

// Initialization
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: MAX_HANDS,
    modelComplexity: 1,
    minDetectionConfidence: CONFIDENCE_LEVEL,
    minTrackingConfidence: CONFIDENCE_LEVEL
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 1280, height: 720
});
camera.start();

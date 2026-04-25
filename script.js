import {
    FilesetResolver,
    FaceLandmarker,
    HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const loadingOverlay = document.getElementById("loading");
const statusBadge = document.getElementById("status");
const catsContainer = document.getElementById("cats-container");
const audio = document.getElementById("audio");

let faceLandmarker;
let handLandmarker;
let runningMode = "VIDEO";
let lastVideoTime = -1;
let isEffectActive = false;
let effectTimeout = null;

// Initialize MediaPipe Models
async function initializeModels() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "GPU"
            },
            outputFaceBlendshapes: false,
            runningMode: runningMode,
            numFaces: 1
        });

        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: runningMode,
            numHands: 2
        });

        // Models loaded, setup camera
        setupCamera();
    } catch (error) {
        console.error("Error loading models:", error);
        statusBadge.innerText = "AI Error: " + error.message;
        statusBadge.style.background = "red";
        loadingOverlay.innerHTML = `<p>Failed to load AI: ${error.message}</p>`;
    }
}

// Setup Webcam
async function setupCamera() {
    if (!window.isSecureContext) {
        statusBadge.innerText = "Error: Insecure Connection";
        statusBadge.style.background = "red";
        loadingOverlay.innerHTML = "<p>Camera blocked by browser. Use localhost or HTTPS.</p>";
        return;
    }

    const constraints = {
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user" // Force front camera
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
        loadingOverlay.classList.add("hidden");
        statusBadge.innerText = "Ready! Try covering your nose";
    } catch (err) {
        console.error("Error accessing camera:", err);
        statusBadge.innerText = "Camera Error: " + err.name;
        statusBadge.style.background = "red";
        loadingOverlay.innerHTML = `<p>Failed to access camera: ${err.message || err.name}</p><p>Please ensure you allow camera access.</p>`;
    }
}

// Prediction Loop
async function predictWebcam() {
    canvasElement.style.width = video.videoWidth;
    canvasElement.style.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    
    // We don't draw landmarks to keep the UI clean, 
    // but canvas is there if needed for debugging.
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    let startTimeMs = performance.now();
    
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        
        // Run detection
        const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
        const handResults = handLandmarker.detectForVideo(video, startTimeMs);

        checkInteraction(faceResults, handResults);
    }

    // Call this function again to keep predicting when the browser is ready.
    window.requestAnimationFrame(predictWebcam);
}

// Check if hand covers nose
let coveringTimeout = null;
audio.loop = true; // Ensure audio loops

function checkInteraction(faceResults, handResults) {
    if (faceResults.faceLandmarks.length > 0 && handResults.landmarks.length > 0) {
        // Face Landmark 1 is usually the nose tip
        const nose = faceResults.faceLandmarks[0][1]; 
        
        let isCovering = false;

        // Check all detected hands
        for (const hand of handResults.landmarks) {
            // Calculate a simple bounding box for the hand
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            
            for (const pt of hand) {
                if (pt.x < minX) minX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y > maxY) maxY = pt.y;
            }

            // Expand bounding box slightly for better UX (forgiving hitbox)
            const paddingX = 0.05;
            const paddingY = 0.05;
            
            if (nose.x > (minX - paddingX) && nose.x < (maxX + paddingX) &&
                nose.y > (minY - paddingY) && nose.y < (maxY + paddingY)) {
                isCovering = true;
                break; // Found one hand covering the nose
            }
        }

        if (isCovering) {
            handleCovering();
        } else {
            handleNotCovering();
        }
    } else {
        handleNotCovering();
    }
}

function handleCovering() {
    // Clear any pending timeout that would stop the effect
    if (coveringTimeout) {
        clearTimeout(coveringTimeout);
        coveringTimeout = null;
    }

    if (!isEffectActive) {
        isEffectActive = true;
        
        // Show Cats
        catsContainer.classList.add("active");
        statusBadge.innerText = "KICAU MANIA! 🦅";
        statusBadge.classList.add("active");
        
        // Play Audio
        if (audio.paused) {
            audio.play().catch(e => console.log("Audio play blocked by browser:", e));
        }
    }
}

function handleNotCovering() {
    // If effect is active and we aren't already waiting to turn it off
    if (isEffectActive && !coveringTimeout) {
        // Use a 500ms grace period so it doesn't flicker if tracking blinks
        coveringTimeout = setTimeout(() => {
            isEffectActive = false;
            catsContainer.classList.remove("active");
            statusBadge.innerText = "Ready! Try covering your nose";
            statusBadge.classList.remove("active");
            
            // Stop audio and reset to beginning
            audio.pause();
            audio.currentTime = 0;
            coveringTimeout = null;
        }, 500);
    }
}

// Start
initializeModels();

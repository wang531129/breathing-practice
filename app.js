/* ==========================================================================
   Pneuma - 呼吸練習應用程式核心邏輯 (JavaScript Core Engine - Upgraded)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================================================
    // 1. 狀態與常數定義
    // ==========================================================================
    const STATE_IDLE = 'IDLE';
    const STATE_COUNTDOWN = 'COUNTDOWN';
    const STATE_BREATHING = 'BREATHING';
    const STATE_PAUSED = 'PAUSED';

    const PHASE_PREPARE = 'PREPARE';
    const PHASE_INHALE = 'INHALE';
    const PHASE_HOLD_IN = 'HOLD_IN';
    const PHASE_EXHALE = 'EXHALE';
    const PHASE_HOLD_OUT = 'HOLD_OUT';

    // 呼吸練習法詳細配置
    const METHODS = {
        box: {
            name: "箱式呼吸 (Box Breathing)",
            desc: "<strong>箱式呼吸 (4-4-4-4)</strong>：廣泛應用於特種部隊與運動員。透過均衡的吸氣、憋氣、呼氣、憋氣四個階段，能迅速重置緊繃的神經系統，找回思緒專注力。",
            defaultTimings: { [PHASE_INHALE]: 4, [PHASE_HOLD_IN]: 4, [PHASE_EXHALE]: 4, [PHASE_HOLD_OUT]: 4 },
            presets: [
                { name: "4s 經典減壓", inhale: 4, hold1: 4, exhale: 4, hold2: 4 },
                { name: "5s 深層專注", inhale: 5, hold1: 5, exhale: 5, hold2: 5 },
                { name: "3s 快速平靜", inhale: 3, hold1: 3, exhale: 3, hold2: 3 }
            ]
        },
        resonant: {
            name: "諧振呼吸 (Resonant Breathing)",
            desc: "<strong>諧振呼吸 (5-0-5-0)</strong>：又稱共振呼吸，將呼吸速度降至每分鐘約 5.5 到 6 次。不憋氣，能最大化活化副交感神經，達到穩定自律神經、減緩焦慮與調適心血管系統的極致平靜。",
            defaultTimings: { [PHASE_INHALE]: 5, [PHASE_HOLD_IN]: 0, [PHASE_EXHALE]: 5, [PHASE_HOLD_OUT]: 0 },
            presets: [
                { name: "5s 標準諧振", inhale: 5, hold1: 0, exhale: 5, hold2: 0 },
                { name: "5.5s 黃金共振", inhale: 5.5, hold1: 0, exhale: 5.5, hold2: 0 },
                { name: "6s 深度放鬆", inhale: 6, hold1: 0, exhale: 6, hold2: 0 }
            ]
        },
        478: {
            name: "478 呼吸法 (4-7-8 Breathing)",
            desc: "<strong>478 呼吸法 (4-7-8-0)</strong>：由著名醫學博士 Andrew Weil 推廣。吸氣 4 秒、憋氣 7 秒、呼氣 8 秒。此法專注於強力放鬆，能快速降低心跳並啟動放鬆機制，是公認最強大的<strong>睡前快速助眠</strong>工具。",
            defaultTimings: { [PHASE_INHALE]: 4, [PHASE_HOLD_IN]: 7, [PHASE_EXHALE]: 8, [PHASE_HOLD_OUT]: 0 },
            presets: [
                { name: "4-7-8 經典助眠", inhale: 4, hold1: 7, exhale: 8, hold2: 0 },
                { name: "8-14-16 倍效平靜", inhale: 8, hold1: 14, exhale: 16, hold2: 0 }
            ]
        }
    };

    // 狀態機變數
    let currentMethod = 'box';
    let appState = STATE_IDLE;
    let currentPhase = PHASE_PREPARE;
    let timerInterval = null;
    let countdownInterval = null;
    let animationFrameId = null;

    // 時間設定 (秒)
    let timings = {
        [PHASE_INHALE]: 4,
        [PHASE_HOLD_IN]: 4,
        [PHASE_EXHALE]: 4,
        [PHASE_HOLD_OUT]: 4
    };

    // 高精度計時與進度 (毫秒為單位)
    let currentPhaseTimeLeft = 0; // 剩餘秒數
    let phaseTotalDurationMs = 0; // 當前階段總毫秒數
    let phaseTimeElapsed = 0;     // 當前階段已流逝毫秒數，供動畫繪製
    let phaseStartTime = 0;       // 當前階段起始 timestamp
    
    let completedCycles = 0;
    let targetCycles = 10;
    let activeTheme = 'stellar';
    let visualMode = 'ring'; // 'ring' 或 'box' (幾何軌道)
    let wakeLock = null;
    let noSleepFallback = null;
    let noSleepFallbackEnabled = false;
    let sleepGuideAudio = null;
    let sleepGuideObjectUrl = null;
    let sleepGuideStartedAtCycles = 0;

    function isSleep478Mode() {
        return currentMethod === '478';
    }

    function getGuidanceVolume() {
        if (!isSleep478Mode()) return 1;

        const progress = targetCycles > 0 ? completedCycles / targetCycles : 0;
        return Math.max(0.22, 1 - progress * 0.78);
    }

    function shouldUseSleepGuideAudio() {
        return isSleep478Mode() && voiceToggle.checked;
    }

    // ==========================================================================
    // 2. DOM 元素獲取
    // ==========================================================================
    const body = document.body;
    
    // 主控制與顯示
    const startPauseBtn = document.getElementById('start-pause-btn');
    const resetBtn = document.getElementById('reset-btn');
    const btnText = document.getElementById('btn-text');
    const playIcon = startPauseBtn.querySelector('.icon-play');
    const pauseIcon = startPauseBtn.querySelector('.icon-pause');
    const phaseTitle = document.getElementById('phase-title');
    const timerSeconds = document.getElementById('timer-seconds');
    const phaseDesc = document.getElementById('phase-desc');
    
    // 視覺化容器
    const btnModeRing = document.getElementById('btn-mode-ring');
    const btnModeBox = document.getElementById('btn-mode-box');
    const ringContainer = document.getElementById('ring-container');
    const boxContainer = document.getElementById('box-container');
    
    // SVG 動態幾何軌道元素
    const boxTrackPath = document.getElementById('box-track-path');
    const boxProgressPath = document.getElementById('box-progress-path');
    const boxGlowOrb = document.getElementById('box-glow-orb');
    
    // 進度條
    const sessionProgressArea = document.getElementById('session-progress-area');
    const sessionProgressFill = document.getElementById('session-progress-fill');
    const labelCompletedCycles = document.getElementById('completed-cycles');
    const labelTargetCycles = document.getElementById('target-cycles');

    // 面板控制
    const themeBtn = document.getElementById('theme-btn');
    const themeDropdown = document.getElementById('theme-dropdown');
    const settingsToggleBtn = document.getElementById('settings-toggle-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsCloseBtn = document.getElementById('settings-close-btn');
    const settingsDoneBtn = document.getElementById('settings-done-btn');
    
    const statsToggleBtn = document.getElementById('stats-toggle-btn');
    const statsPanel = document.getElementById('stats-panel');
    const statsCloseBtn = document.getElementById('stats-close-btn');
    const statsDoneBtn = document.getElementById('stats-done-btn');
    
    // 呼吸法與描述
    const methodSelect = document.getElementById('method-select');
    const methodDescText = document.getElementById('method-desc-text');
    const presetContainer = document.getElementById('preset-container');

    // 自訂滑桿與數值容器
    const sliderInhale = document.getElementById('slider-inhale');
    const sliderHold1 = document.getElementById('slider-hold1');
    const sliderExhale = document.getElementById('slider-exhale');
    const sliderHold2 = document.getElementById('slider-hold2');
    const sliderCycles = document.getElementById('slider-cycles');
    
    const wrapperInhale = document.getElementById('wrapper-inhale');
    const wrapperHold1 = document.getElementById('wrapper-hold1');
    const wrapperExhale = document.getElementById('wrapper-exhale');
    const wrapperHold2 = document.getElementById('wrapper-hold2');

    const valInhale = document.getElementById('val-inhale');
    const valHold1 = document.getElementById('val-hold1');
    const valExhale = document.getElementById('val-exhale');
    const valHold2 = document.getElementById('val-hold2');
    const valCycles = document.getElementById('val-cycles');
    
    // 音訊控制
    const ambientSelect = document.getElementById('ambient-select');
    const chimeToggle = document.getElementById('chime-toggle');
    const voiceToggle = document.getElementById('voice-toggle');

    // 數據統計顯示
    const statStreak = document.getElementById('stat-streak');
    const statTotalTime = document.getElementById('stat-total-time');
    const statTotalCycles = document.getElementById('stat-total-cycles');
    const clearStatsBtn = document.getElementById('clear-stats-btn');
    const svgChart = document.getElementById('svg-chart');

    // ==========================================================================
    // 3. Web Audio API 音效合成引擎
    // ==========================================================================
    let audioCtx = null;
    let ambientGain = null;
    let binoOscL = null;
    let binoOscR = null;
    let waveNoiseNode = null;
    let waveFilterNode = null;
    let waveGainNode = null;
    
    function initAudio() {
        if (audioCtx) return;
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        
        ambientGain = audioCtx.createGain();
        ambientGain.gain.setValueAtTime(0.0, audioCtx.currentTime); // 預設靜音，平滑淡入
        ambientGain.connect(audioCtx.destination);
    }

    // 啟動環境音音樂
    function playAmbientSound() {
        initAudio();
        
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const type = ambientSelect.value;
        stopAmbientSound(); // 清除舊音源

        if (type === 'binaural') {
            createBinauralBeats();
        } else if (type === 'ocean') {
            createOceanWaves();
        }
    }

    // 停止環境音音樂
    function stopAmbientSound() {
        if (ambientGain) {
            ambientGain.gain.setValueAtTime(ambientGain.gain.value, audioCtx.currentTime);
            ambientGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        }

        setTimeout(() => {
            if (binoOscL) { binoOscL.stop(); binoOscL.disconnect(); binoOscL = null; }
            if (binoOscR) { binoOscR.stop(); binoOscR.disconnect(); binoOscR = null; }
            if (waveNoiseNode) { waveNoiseNode.stop(); waveNoiseNode.disconnect(); waveNoiseNode = null; }
            if (waveFilterNode) { waveFilterNode.disconnect(); waveFilterNode = null; }
            if (waveGainNode) { waveGainNode.disconnect(); waveGainNode = null; }
        }, 600);
    }

    // A. 合成雙耳波頻 (Theta Binaural Beats)
    function createBinauralBeats() {
        if (!audioCtx) return;

        const merger = audioCtx.createChannelMerger(2);
        
        binoOscL = audioCtx.createOscillator();
        binoOscL.type = 'sine';
        binoOscL.frequency.value = 100;
        
        binoOscR = audioCtx.createOscillator();
        binoOscR.type = 'sine';
        binoOscR.frequency.value = 104; // 產生 4Hz Theta 波

        const subOscL = audioCtx.createOscillator();
        subOscL.type = 'sine';
        subOscL.frequency.value = 200;
        
        const subOscR = audioCtx.createOscillator();
        subOscR.type = 'sine';
        subOscR.frequency.value = 204.5;
        
        const lowpass = audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 150;

        const subGain = audioCtx.createGain();
        subGain.gain.value = 0.4;

        binoOscL.connect(merger, 0, 0);
        binoOscR.connect(merger, 0, 1);
        
        subOscL.connect(subGain);
        subOscR.connect(subGain);
        subGain.connect(merger);

        merger.connect(lowpass);
        lowpass.connect(ambientGain);

        binoOscL.start();
        binoOscR.start();
        subOscL.start();
        subOscR.start();

        binoOscL.onended = () => {
            subOscL.stop(); subOscL.disconnect();
            subOscR.stop(); subOscR.disconnect();
            subGain.disconnect();
            lowpass.disconnect();
            merger.disconnect();
        };

        ambientGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
        ambientGain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 1.5);
    }

    // B. 合成海洋潮汐白噪音
    function createOceanWaves() {
        if (!audioCtx) return;

        const bufferSize = 2 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        waveNoiseNode = audioCtx.createBufferSource();
        waveNoiseNode.buffer = noiseBuffer;
        waveNoiseNode.loop = true;

        waveFilterNode = audioCtx.createBiquadFilter();
        waveFilterNode.type = 'bandpass';
        waveFilterNode.Q.value = 1.2;
        waveFilterNode.frequency.value = 350;

        waveGainNode = audioCtx.createGain();
        waveGainNode.gain.value = 0.5;

        waveNoiseNode.connect(waveFilterNode);
        waveFilterNode.connect(waveGainNode);
        waveGainNode.connect(ambientGain);

        waveNoiseNode.start();

        ambientGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
        ambientGain.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + 2.0);
        
        modulateOceanWaves();
    }

    // C. 依據呼吸階段調製海洋音效 (Ocean Wave Dynamic Modulation)
    function modulateOceanWaves() {
        if (!audioCtx || !waveFilterNode || !waveGainNode || ambientSelect.value !== 'ocean') return;

        const now = audioCtx.currentTime;
        let targetFreq = 300;
        let targetVolume = 0.2;
        let transitionDuration = 4.0;

        if (appState === STATE_BREATHING) {
            transitionDuration = timings[currentPhase];
            
            switch (currentPhase) {
                case PHASE_INHALE:
                    targetFreq = 750;
                    targetVolume = 0.6;
                    break;
                case PHASE_HOLD_IN:
                    targetFreq = 680;
                    targetVolume = 0.5;
                    break;
                case PHASE_EXHALE:
                    targetFreq = 250;
                    targetVolume = 0.15;
                    break;
                case PHASE_HOLD_OUT:
                    targetFreq = 200;
                    targetVolume = 0.08;
                    break;
            }
        } else {
            targetFreq = 350 + Math.sin(Date.now() / 1500) * 100;
            targetVolume = 0.2;
            transitionDuration = 1.5;
        }

        waveFilterNode.frequency.setValueAtTime(waveFilterNode.frequency.value, now);
        waveFilterNode.frequency.exponentialRampToValueAtTime(Math.max(10, targetFreq), now + transitionDuration);
        
        waveGainNode.gain.setValueAtTime(waveGainNode.gain.value, now);
        waveGainNode.gain.linearRampToValueAtTime(targetVolume, now + transitionDuration);
    }

    // D. 合成頌缽音效
    function playChimeBell() {
        if (!chimeToggle.checked) return;
        
        initAudio();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;
        const guidanceVolume = getGuidanceVolume();
        const fundamental = 293.66; // D4 基頻
        const harmonics = [1, 1.5, 2.0, 2.61, 3.0, 3.82, 4.2];
        const gains = [0.6, 0.35, 0.25, 0.15, 0.1, 0.05, 0.03];
        
        const mainGain = audioCtx.createGain();
        mainGain.gain.setValueAtTime(0.001, now);
        mainGain.gain.linearRampToValueAtTime(0.4 * guidanceVolume, now + 0.02);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
        mainGain.connect(audioCtx.destination);

        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 600;
        bp.Q.value = 0.8;
        bp.connect(mainGain);

        harmonics.forEach((ratio, idx) => {
            const osc = audioCtx.createOscillator();
            const oscGain = audioCtx.createGain();
            
            osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
            osc.frequency.value = fundamental * ratio;
            
            oscGain.gain.value = gains[idx];
            
            osc.connect(oscGain);
            oscGain.connect(bp);
            
            osc.start(now);
            osc.stop(now + 5.0);
            
            oscGain.gain.setValueAtTime(gains[idx], now);
            oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0 + ratio);
        });
    }

    // ==========================================================================
    // 4. Web Speech API 語音導引
    // ==========================================================================
    function speakPhasePrompt(text) {
        if (!voiceToggle.checked) return;
        
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW';
        utterance.rate = isSleep478Mode() ? 0.82 : 0.9;
        utterance.pitch = isSleep478Mode() ? 0.9 : 0.95;
        utterance.volume = getGuidanceVolume();

        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.includes('zh-TW') || v.lang.includes('zh-CN'));
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        window.speechSynthesis.speak(utterance);
    }

    // ==========================================================================
    // 4A. 478 鎖屏音訊引導：產生整段可背景播放的提示音
    // ==========================================================================
    function addToneToSamples(samples, sampleRate, startTime, duration, frequency, volume, fadeRatio = 0.2) {
        const startSample = Math.max(0, Math.floor(startTime * sampleRate));
        const endSample = Math.min(samples.length, Math.floor((startTime + duration) * sampleRate));
        const fadeSamples = Math.max(1, Math.floor(duration * sampleRate * fadeRatio));

        for (let i = startSample; i < endSample; i++) {
            const localIndex = i - startSample;
            const localLength = endSample - startSample;
            const elapsed = localIndex / sampleRate;
            const fadeIn = Math.min(1, localIndex / fadeSamples);
            const fadeOut = Math.min(1, (localLength - localIndex) / fadeSamples);
            const envelope = Math.min(fadeIn, fadeOut);
            const mixedSample = samples[i] + Math.sin(2 * Math.PI * frequency * elapsed) * volume * envelope * 0x7fff;
            samples[i] = Math.max(-0x8000, Math.min(0x7fff, mixedSample));
        }
    }

    function addGuideCue(samples, sampleRate, startTime, frequency, volume) {
        addToneToSamples(samples, sampleRate, startTime, 0.42, frequency, volume);
        addToneToSamples(samples, sampleRate, startTime + 0.08, 0.55, frequency * 1.5, volume * 0.35);
    }

    function createWavObjectUrl(samples, sampleRate) {
        const dataSize = samples.length * 2;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        const writeString = (offset, value) => {
            for (let i = 0; i < value.length; i++) {
                view.setUint8(offset + i, value.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            view.setInt16(offset, samples[i], true);
            offset += 2;
        }

        return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    }

    function buildSleepGuideAudioUrl() {
        const sampleRate = 12000;
        const countdownSeconds = 3;
        const cycleSeconds = timings[PHASE_INHALE] + timings[PHASE_HOLD_IN] + timings[PHASE_EXHALE] + timings[PHASE_HOLD_OUT];
        const totalSeconds = countdownSeconds + targetCycles * cycleSeconds + 3;
        const samples = new Int16Array(Math.ceil(totalSeconds * sampleRate));

        addGuideCue(samples, sampleRate, 0, 660, 0.24);
        addGuideCue(samples, sampleRate, 1, 660, 0.22);
        addGuideCue(samples, sampleRate, 2, 660, 0.2);

        for (let cycle = 0; cycle < targetCycles; cycle++) {
            const progress = targetCycles > 1 ? cycle / (targetCycles - 1) : 0;
            const volume = Math.max(0.07, 0.22 - progress * 0.14);
            let cursor = countdownSeconds + cycle * cycleSeconds;

            addGuideCue(samples, sampleRate, cursor, 523.25, volume);
            cursor += timings[PHASE_INHALE];

            if (timings[PHASE_HOLD_IN] > 0) {
                addGuideCue(samples, sampleRate, cursor, 392.0, volume * 0.88);
                cursor += timings[PHASE_HOLD_IN];
            }

            addGuideCue(samples, sampleRate, cursor, 293.66, volume * 0.82);
            cursor += timings[PHASE_EXHALE];

            if (timings[PHASE_HOLD_OUT] > 0) {
                addGuideCue(samples, sampleRate, cursor, 246.94, volume * 0.7);
            }
        }

        const finishTime = countdownSeconds + targetCycles * cycleSeconds;
        addGuideCue(samples, sampleRate, finishTime, 440, 0.08);
        addGuideCue(samples, sampleRate, finishTime + 1.0, 330, 0.06);

        return createWavObjectUrl(samples, sampleRate);
    }

    function stopSleepGuideAudio() {
        if (sleepGuideAudio) {
            sleepGuideAudio.pause();
            sleepGuideAudio.removeAttribute('src');
            sleepGuideAudio.load();
            sleepGuideAudio = null;
        }

        if (sleepGuideObjectUrl) {
            URL.revokeObjectURL(sleepGuideObjectUrl);
            sleepGuideObjectUrl = null;
        }
    }

    function pauseSleepGuideAudio() {
        if (sleepGuideAudio && !sleepGuideAudio.paused) {
            sleepGuideAudio.pause();
        }
    }

    function resumeSleepGuideAudio() {
        if (sleepGuideAudio && sleepGuideAudio.paused) {
            sleepGuideAudio.play().catch(() => {});
        }
    }

    function saveRemainingSleepGuideProgress() {
        const missingCycles = Math.max(0, targetCycles - completedCycles);
        if (missingCycles === 0) return;

        const singleCycleSeconds = timings[PHASE_INHALE] + timings[PHASE_HOLD_IN] + timings[PHASE_EXHALE] + timings[PHASE_HOLD_OUT];
        saveSessionProgress(missingCycles, singleCycleSeconds * missingCycles);
        completedCycles = targetCycles;
        updateProgressUI();
    }

    function startSleepGuideAudio() {
        if (!shouldUseSleepGuideAudio()) return;

        stopSleepGuideAudio();
        sleepGuideStartedAtCycles = completedCycles;
        sleepGuideObjectUrl = buildSleepGuideAudioUrl();
        sleepGuideAudio = new Audio(sleepGuideObjectUrl);
        sleepGuideAudio.preload = 'auto';
        sleepGuideAudio.setAttribute('playsinline', '');
        sleepGuideAudio.addEventListener('ended', () => {
            if (isSleep478Mode() && (appState === STATE_COUNTDOWN || appState === STATE_BREATHING || appState === STATE_PAUSED)) {
                saveRemainingSleepGuideProgress();
                finishPractice();
            }
        }, { once: true });
        sleepGuideAudio.play().catch(() => {
            stopSleepGuideAudio();
        });
    }

    // ==========================================================================
    // 4B. 螢幕喚醒鎖：練習時避免手機自動休眠
    // ==========================================================================
    function requestNoSleepFallback() {
        if (!window.NoSleep || noSleepFallbackEnabled) return;

        try {
            if (!noSleepFallback) {
                noSleepFallback = new window.NoSleep();
            }
            noSleepFallback.enable();
            noSleepFallbackEnabled = true;
        } catch (error) {
            noSleepFallbackEnabled = false;
        }
    }

    function releaseNoSleepFallback() {
        if (!noSleepFallback || !noSleepFallbackEnabled) return;

        try {
            noSleepFallback.disable();
        } catch (error) {
            // 備援防休眠可能已經被瀏覽器釋放。
        }
        noSleepFallbackEnabled = false;
    }

    async function requestWakeLock() {
        requestNoSleepFallback();

        if (!('wakeLock' in navigator) || wakeLock) return;

        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                wakeLock = null;
            });
        } catch (error) {
            wakeLock = null;
        }
    }

    async function releaseWakeLock() {
        releaseNoSleepFallback();

        if (!wakeLock) return;

        const lockToRelease = wakeLock;
        wakeLock = null;
        try {
            await lockToRelease.release();
        } catch (error) {
            // Wake Lock 可能已被瀏覽器自動釋放，這裡不需要額外處理。
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && (appState === STATE_COUNTDOWN || appState === STATE_BREATHING)) {
            requestWakeLock();
        }
    });

    function enableSleepDisplayMode() {
        if (isSleep478Mode()) {
            body.classList.add('sleep-session');
        }
    }

    function disableSleepDisplayMode() {
        body.classList.remove('sleep-session');
    }

    // ==========================================================================
    // 5. 呼吸狀態機與邏輯引擎
    // ==========================================================================
    
    // 初始化或重置計時器狀態
    function clearCountdownTimer() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    function showCountdownValue(value) {
        phaseTitle.textContent = '準備';
        timerSeconds.textContent = value;
        phaseDesc.textContent = '請放鬆身體，跟著倒數準備開始。';
        speakPhasePrompt(String(value));
    }

    function beginBreathingAfterCountdown() {
        if (appState !== STATE_COUNTDOWN) return;

        clearCountdownTimer();
        appState = STATE_BREATHING;
        transitionToPhase(PHASE_INHALE);
        updateControlsUI();
    }

    function startCountdown() {
        let countdownValue = 3;

        currentPhase = PHASE_PREPARE;
        phaseTotalDurationMs = 3000;
        phaseStartTime = Date.now();
        phaseTimeElapsed = 0;
        showCountdownValue(countdownValue);

        clearCountdownTimer();
        countdownInterval = setInterval(() => {
            countdownValue--;

            if (countdownValue > 0) {
                showCountdownValue(countdownValue);
                return;
            }

            timerSeconds.textContent = '開始';
            beginBreathingAfterCountdown();
        }, 1000);
    }

    function startPractice() {
        if (appState === STATE_IDLE) {
            completedCycles = 0;
            updateProgressUI();
            sessionProgressArea.classList.remove('hidden');
            resetBtn.classList.remove('disabled');
            resetBtn.disabled = false;

            appState = STATE_COUNTDOWN;
            startSleepGuideAudio();
            startCountdown();
            
            playAmbientSound();
        } else if (appState === STATE_PAUSED) {
            appState = STATE_BREATHING;
            // 根據已過去的毫秒數重新定位開始時間
            phaseStartTime = Date.now() - phaseTimeElapsed;
            runTimerLoop();
            
            if (ambientSelect.value !== 'none') {
                playAmbientSound();
            }
            resumeSleepGuideAudio();
        }
        
        requestWakeLock();
        enableSleepDisplayMode();
        updateControlsUI();
        runAnimationLoop();
    }

    function pausePractice() {
        appState = STATE_PAUSED;
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        releaseWakeLock();
        disableSleepDisplayMode();
        stopAmbientSound();
        pauseSleepGuideAudio();
        updateControlsUI();
    }

    function resetPractice() {
        appState = STATE_IDLE;
        currentPhase = PHASE_PREPARE;
        
        clearCountdownTimer();
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        
        releaseWakeLock();
        disableSleepDisplayMode();
        stopAmbientSound();
        stopSleepGuideAudio();
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        
        phaseTitle.textContent = '準備開始';
        timerSeconds.textContent = '0';
        phaseDesc.textContent = '點擊下方按鈕以展開練習';
        
        sessionProgressArea.classList.add('hidden');
        resetBtn.classList.add('disabled');
        resetBtn.disabled = true;
        
        updateControlsUI();
        
        document.documentElement.style.setProperty('--ring-scale', '1');
        document.documentElement.style.setProperty('--ring-opacity', '0.8');
        
        // 重設幾何軌道進度與發光球
        const totalLength = boxProgressPath.getTotalLength();
        boxProgressPath.style.strokeDashoffset = totalLength;
        
        // 根據不同軌道形狀將發光球移回對應的起點
        const h1 = timings[PHASE_HOLD_IN];
        const h2 = timings[PHASE_HOLD_OUT];
        if (h1 === 0 && h2 === 0) {
            updateBoxOrbPosition(40, 150); // 直線起點 (左端)
        } else {
            updateBoxOrbPosition(40, 40);   // 正方形或三角形起點 (左上角)
        }
    }

    // 狀態階段切換
    function transitionToPhase(nextPhase) {
        currentPhase = nextPhase;
        phaseTotalDurationMs = timings[nextPhase] * 1000;
        currentPhaseTimeLeft = timings[nextPhase];
        phaseStartTime = Date.now();
        phaseTimeElapsed = 0;

        let titleText = '';
        let descText = '';

        switch (nextPhase) {
            case PHASE_INHALE:
                titleText = '吸氣 (Inhale)';
                descText = '放鬆肩膀，以鼻子深深吸氣，感受腹部隆起。';
                speakPhasePrompt('吸氣');
                break;
                
            case PHASE_HOLD_IN:
                titleText = '屏息 (Hold)';
                descText = '保持平靜，鎖住吸飽的空氣，放鬆全身肌肉。';
                speakPhasePrompt('憋氣');
                break;
                
            case PHASE_EXHALE:
                titleText = '呼氣 (Exhale)';
                descText = '微微張嘴，平緩、徹底地將體內氣體慢慢吐出。';
                speakPhasePrompt('吐氣');
                break;
                
            case PHASE_HOLD_OUT:
                titleText = '屏息 (Hold)';
                descText = '在肺部徹底排空狀態下保持靜止，享受空靈。';
                speakPhasePrompt('憋氣');
                break;
        }

        playChimeBell();
        modulateOceanWaves();

        phaseTitle.textContent = titleText;
        timerSeconds.textContent = Math.ceil(currentPhaseTimeLeft);
        phaseDesc.textContent = descText;

        if (timerInterval) clearInterval(timerInterval);
        runTimerLoop();
    }

    // 高精度計時器迴圈 (毫秒級追蹤)
    function runTimerLoop() {
        timerInterval = setInterval(() => {
            if (appState !== STATE_BREATHING) return;

            const elapsedMs = Date.now() - phaseStartTime;
            currentPhaseTimeLeft = Math.max(0, (phaseTotalDurationMs - elapsedMs) / 1000);
            
            // 向上取整，以呈現 4, 3, 2, 1, 0
            timerSeconds.textContent = Math.ceil(currentPhaseTimeLeft);

            if (elapsedMs >= phaseTotalDurationMs) {
                clearInterval(timerInterval);
                timerInterval = null;
                handlePhaseCompletion();
            }
        }, 100); // 頻率拉高到 100ms 確保精度
    }

    // 當前階段結束
    function handlePhaseCompletion() {
        let nextPhase = PHASE_INHALE;

        switch (currentPhase) {
            case PHASE_INHALE:
                // 如果 Hold In 是 0 秒，則跳過，直接進入 Exhale
                nextPhase = timings[PHASE_HOLD_IN] > 0 ? PHASE_HOLD_IN : PHASE_EXHALE;
                break;
            case PHASE_HOLD_IN:
                nextPhase = PHASE_EXHALE;
                break;
            case PHASE_EXHALE:
                // 如果 Hold Out 是 0 秒，則跳過，直接回到 Inhale
                nextPhase = timings[PHASE_HOLD_OUT] > 0 ? PHASE_HOLD_OUT : PHASE_INHALE;
                if (nextPhase === PHASE_INHALE) {
                    onCycleComplete();
                }
                break;
            case PHASE_HOLD_OUT:
                nextPhase = PHASE_INHALE;
                onCycleComplete();
                break;
        }

        if (appState === STATE_BREATHING) {
            if (completedCycles >= targetCycles && nextPhase === PHASE_INHALE) {
                finishPractice();
            } else {
                transitionToPhase(nextPhase);
            }
        }
    }

    // 完成一個呼吸循環
    function onCycleComplete() {
        completedCycles++;
        updateProgressUI();
        
        const singleCycleSeconds = timings[PHASE_INHALE] + timings[PHASE_HOLD_IN] + timings[PHASE_EXHALE] + timings[PHASE_HOLD_OUT];
        saveSessionProgress(1, singleCycleSeconds);
    }

    // 練習成功結束
    function finishPractice() {
        appState = STATE_IDLE;
        
        playChimeBell();
        setTimeout(playChimeBell, 1000);
        setTimeout(playChimeBell, 2000);
        
        phaseTitle.textContent = '練習圓滿';
        timerSeconds.textContent = '🙏';
        phaseDesc.textContent = `太棒了！您完成了 ${completedCycles} 次完整的${METHODS[currentMethod].name}練習。點擊下方按鈕以重新開始。`;
        
        updateStatsPanel();
        releaseWakeLock();
        disableSleepDisplayMode();
        stopAmbientSound();
        stopSleepGuideAudio();
        updateControlsUI();
        resetBtn.classList.add('disabled');
        resetBtn.disabled = true;
    }

    // ==========================================================================
    // 6. 動態視覺渲染動畫迴圈 (Smooth Animation Loop - 60fps)
    // ==========================================================================
    function runAnimationLoop() {
        if (appState === STATE_IDLE) return;

        if (appState === STATE_COUNTDOWN || appState === STATE_BREATHING) {
            phaseTimeElapsed = Date.now() - phaseStartTime;
        }
        
        const progress = Math.min(1.0, phaseTimeElapsed / phaseTotalDurationMs);

        if (visualMode === 'ring') {
            renderRingAnimation(progress);
        } else {
            renderBoxAnimation(progress);
        }

        animationFrameId = requestAnimationFrame(runAnimationLoop);
    }

    // A. 能量呼吸光圈動畫 (Upgraded)
    function renderRingAnimation(progress) {
        let scale = 1.0;
        let opacity = 0.8;
        let blur = 8;
        let colorDynamic = 'var(--primary-color)';

        switch (currentPhase) {
            case PHASE_INHALE:
                scale = 1.0 + progress * 0.9;
                opacity = 0.6 + progress * 0.4;
                blur = 6 + progress * 4;
                colorDynamic = interpolateColor('var(--primary-color)', 'var(--secondary-color)', progress);
                break;
                
            case PHASE_HOLD_IN:
                scale = 1.9 + Math.sin(Date.now() / 300) * 0.04;
                opacity = 1.0;
                blur = 10;
                colorDynamic = 'var(--secondary-color)';
                break;
                
            case PHASE_EXHALE:
                scale = 1.9 - progress * 0.9;
                opacity = 1.0 - progress * 0.4;
                blur = 10 - progress * 4;
                colorDynamic = interpolateColor('var(--secondary-color)', 'var(--accent-color)', progress);
                break;
                
            case PHASE_HOLD_OUT:
                scale = 1.0 + Math.sin(Date.now() / 500) * 0.02;
                opacity = 0.6;
                blur = 6;
                colorDynamic = 'var(--primary-color)';
                break;
        }

        document.documentElement.style.setProperty('--ring-scale', scale);
        document.documentElement.style.setProperty('--ring-opacity', opacity);
        document.documentElement.style.setProperty('--ring-blur', `${blur}px`);
        document.documentElement.style.setProperty('--ring-color-dynamic', colorDynamic);
    }

    // B. 自適應幾何路徑插值座標算法 (Constant Orb Velocity at Vertices)
    function renderBoxAnimation(progress) {
        const h1 = timings[PHASE_HOLD_IN];
        const h2 = timings[PHASE_HOLD_OUT];

        let cx = 40;
        let cy = 40;

        // 計算當前週期內大於 0 秒的 active 階段累加進度，用於繪製外圍進度條
        const activePhases = [PHASE_INHALE, PHASE_HOLD_IN, PHASE_EXHALE, PHASE_HOLD_OUT].filter(p => timings[p] > 0);
        const totalActiveSeconds = activePhases.reduce((acc, cur) => acc + timings[cur], 0);
        
        let previousActiveSeconds = 0;
        for (let i = 0; i < activePhases.length; i++) {
            if (activePhases[i] === currentPhase) break;
            previousActiveSeconds += timings[activePhases[i]];
        }
        
        const currentElapsedSeconds = previousActiveSeconds + (progress * timings[currentPhase]);
        const cycleProgressFraction = currentElapsedSeconds / totalActiveSeconds;

        const totalLength = boxProgressPath.getTotalLength();
        boxProgressPath.style.strokeDashoffset = totalLength - (cycleProgressFraction * totalLength);

        // 幾何頂點座標定義 (寬高 220 像素之畫布)
        const pLeftTop = { x: 40, y: 40 };
        const pRightTop = { x: 260, y: 40 };
        const pRightBottom = { x: 260, y: 260 };
        const pLeftBottom = { x: 40, y: 260 };
        const pMiddle = 150;

        if (h1 > 0 && h2 > 0) {
            // Case 1: 四個階段全部啟用 -> 正方形 ⬛
            if (currentPhase === PHASE_INHALE) {
                cx = pLeftTop.x + progress * 220;
                cy = pLeftTop.y;
            } else if (currentPhase === PHASE_HOLD_IN) {
                cx = pRightTop.x;
                cy = pRightTop.y + progress * 220;
            } else if (currentPhase === PHASE_EXHALE) {
                cx = pRightBottom.x - progress * 220;
                cy = pRightBottom.y;
            } else if (currentPhase === PHASE_HOLD_OUT) {
                cx = pLeftBottom.x;
                cy = pLeftBottom.y - progress * 220;
            }
        } else if (h1 > 0 && h2 === 0) {
            // Case 2: 僅啟用三階段且 Hold Out 為 0 (如 478) -> 直角三角形 A 🔺 (順時針斜邊返回)
            if (currentPhase === PHASE_INHALE) {
                cx = pLeftTop.x + progress * 220;
                cy = pLeftTop.y;
            } else if (currentPhase === PHASE_HOLD_IN) {
                cx = pRightTop.x;
                cy = pRightTop.y + progress * 220;
            } else if (currentPhase === PHASE_EXHALE) {
                // 從 (260,260) 平滑沿斜邊返回起點 (40,40)
                cx = pRightBottom.x - progress * 220;
                cy = pRightBottom.y - progress * 220;
            }
        } else if (h1 === 0 && h2 > 0) {
            // Case 3: 僅啟用三階段且 Hold In 為 0 -> 直角三角形 B 🔺 (斜邊下落，左邊上升)
            if (currentPhase === PHASE_INHALE) {
                cx = pLeftTop.x + progress * 220;
                cy = pLeftTop.y;
            } else if (currentPhase === PHASE_EXHALE) {
                // 從 (260,40) 沿斜邊下滑到 (40,260)
                cx = pRightTop.x - progress * 220;
                cy = pRightTop.y + progress * 220;
            } else if (currentPhase === PHASE_HOLD_OUT) {
                cx = pLeftBottom.x;
                cy = pLeftBottom.y - progress * 220;
            }
        } else {
            // Case 4: 憋氣皆為 0，僅啟用二階段 (如諧振呼吸) -> 水平直線來回 ➖
            if (currentPhase === PHASE_INHALE) {
                // 由左 (40) 往右 (260)
                cx = 40 + progress * 220;
                cy = pMiddle;
            } else if (currentPhase === PHASE_EXHALE) {
                // 由右 (260) 往左 (40)
                cx = 260 - progress * 220;
                cy = pMiddle;
            }
        }

        updateBoxOrbPosition(cx, cy);
    }

    function updateBoxOrbPosition(x, y) {
        boxGlowOrb.setAttribute('cx', x);
        boxGlowOrb.setAttribute('cy', y);
    }

    // 幾何軌道動態重繪引擎
    function updateBreathingPath() {
        const h1 = timings[PHASE_HOLD_IN];
        const h2 = timings[PHASE_HOLD_OUT];

        let d = "";
        
        if (h1 > 0 && h2 > 0) {
            // 正方形
            d = "M 40,40 L 260,40 L 260,260 L 40,260 Z";
        } else if (h1 > 0 && h2 === 0) {
            // 三角形 A (順時針)
            d = "M 40,40 L 260,40 L 260,260 Z";
        } else if (h1 === 0 && h2 > 0) {
            // 三角形 B (逆向斜邊)
            d = "M 40,40 L 260,40 L 40,260 Z";
        } else {
            // 直線
            d = "M 40,150 L 260,150";
        }

        // Morph SVG Path (自帶平滑變形 CSS 漸變)
        boxTrackPath.setAttribute('d', d);
        boxProgressPath.setAttribute('d', d);

        // 重算路徑長度
        const totalLength = boxProgressPath.getTotalLength();
        boxProgressPath.style.strokeDasharray = totalLength;
        boxProgressPath.style.strokeDashoffset = totalLength;
        
        // 如果處於停止狀態，將 Orb 平移至正確起點
        if (appState === STATE_IDLE) {
            if (h1 === 0 && h2 === 0) {
                updateBoxOrbPosition(40, 150); // 直線起點 (左端)
            } else {
                updateBoxOrbPosition(40, 40);   // 方形/三角形起點 (左上)
            }
        }
    }

    // CSS HSL 顏色漸變插值輔助函式
    function interpolateColor(color1, color2, factor) {
        return factor < 0.5 ? color1 : color2;
    }

    // ==========================================================================
    // 7. UI 更新與控制面板事件 (Upgraded)
    // ==========================================================================
    
    function updateControlsUI() {
        if (appState === STATE_BREATHING) {
            startPauseBtn.disabled = false;
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            btnText.textContent = '暫停';
            startPauseBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            startPauseBtn.style.border = '1px solid var(--glass-border-focus)';
            startPauseBtn.style.boxShadow = 'none';
        } else if (appState === STATE_COUNTDOWN) {
            startPauseBtn.disabled = true;
            playIcon.classList.add('hidden');
            pauseIcon.classList.add('hidden');
            btnText.textContent = '準備中';
            startPauseBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            startPauseBtn.style.border = '1px solid var(--glass-border-focus)';
            startPauseBtn.style.boxShadow = 'none';
        } else {
            startPauseBtn.disabled = false;
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            btnText.textContent = appState === STATE_IDLE ? '開始練習' : '繼續練習';
            startPauseBtn.style.background = 'linear-gradient(135deg, var(--gradient-start) 0%, var(--gradient-end) 100%)';
            startPauseBtn.style.border = 'none';
            startPauseBtn.style.boxShadow = '0 8px 30px var(--primary-glow)';
        }
    }

    function updateProgressUI() {
        labelCompletedCycles.textContent = completedCycles;
        labelTargetCycles.textContent = targetCycles;
        const progressPercent = Math.min(100, (completedCycles / targetCycles) * 100);
        sessionProgressFill.style.width = `${progressPercent}%`;
    }

    // 切換視覺模式 (光圈 vs 箱型)
    function switchVisualMode(mode) {
        visualMode = mode;
        if (mode === 'ring') {
            btnModeRing.classList.add('active');
            btnModeBox.classList.remove('active');
            ringContainer.classList.remove('hidden');
            boxContainer.classList.add('hidden');
        } else {
            btnModeRing.classList.remove('active');
            btnModeBox.classList.add('active');
            ringContainer.classList.add('hidden');
            boxContainer.classList.remove('hidden');
            
            updateBreathingPath();
        }
    }

    // 根據選擇的呼吸練習法動態渲染預設模式與界面配置
    function setupMethodConfig(methodKey) {
        currentMethod = methodKey;
        const methodData = METHODS[methodKey];

        // 1. 更新說明文字
        methodDescText.innerHTML = methodData.desc;

        // 2. 更新滑桿可用狀態 (有些呼吸法沒有憋氣)
        const defaults = methodData.defaultTimings;
        timings[PHASE_INHALE] = defaults[PHASE_INHALE];
        timings[PHASE_HOLD_IN] = defaults[PHASE_HOLD_IN];
        timings[PHASE_EXHALE] = defaults[PHASE_EXHALE];
        timings[PHASE_HOLD_OUT] = defaults[PHASE_HOLD_OUT];

        sliderInhale.value = timings[PHASE_INHALE];
        sliderHold1.value = timings[PHASE_HOLD_IN];
        sliderExhale.value = timings[PHASE_EXHALE];
        sliderHold2.value = timings[PHASE_HOLD_OUT];

        valInhale.textContent = `${timings[PHASE_INHALE]} 秒`;
        valHold1.textContent = `${timings[PHASE_HOLD_IN]} 秒`;
        valExhale.textContent = `${timings[PHASE_EXHALE]} 秒`;
        valHold2.textContent = `${timings[PHASE_HOLD_OUT]} 秒`;

        if (isSleep478Mode()) {
            targetCycles = 30;
            sliderCycles.min = 10;
            sliderCycles.max = 60;
            sliderCycles.value = 30;
            valCycles.textContent = '30 次';
            chimeToggle.checked = true;
            voiceToggle.checked = true;
            chimeToggle.disabled = true;
            voiceToggle.disabled = true;
        } else {
            sliderCycles.min = 3;
            sliderCycles.max = 30;
            if (parseInt(sliderCycles.value) > 30) {
                sliderCycles.value = 30;
                targetCycles = 30;
                valCycles.textContent = '30 次';
            }
            chimeToggle.disabled = false;
            voiceToggle.disabled = false;
        }

        // 判定哪些滑桿在當前呼吸法下不需要，予以半透明禁用，提高 UX
        if (defaults[PHASE_HOLD_IN] === 0) {
            wrapperHold1.classList.add('disabled');
        } else {
            wrapperHold1.classList.remove('disabled');
        }

        if (defaults[PHASE_HOLD_OUT] === 0) {
            wrapperHold2.classList.add('disabled');
        } else {
            wrapperHold2.classList.remove('disabled');
        }

        // 3. 動態充填預設按鈕
        presetContainer.innerHTML = '';
        methodData.presets.forEach((preset, idx) => {
            const btn = document.createElement('button');
            btn.className = `preset-btn ${idx === 0 ? 'active' : ''}`;
            btn.textContent = preset.name;
            btn.dataset.inhale = preset.inhale;
            btn.dataset.hold1 = preset.hold1;
            btn.dataset.exhale = preset.exhale;
            btn.dataset.hold2 = preset.hold2;
            
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const inh = parseFloat(btn.dataset.inhale);
                const h1 = parseFloat(btn.dataset.hold1);
                const exh = parseFloat(btn.dataset.exhale);
                const h2 = parseFloat(btn.dataset.hold2);

                sliderInhale.value = inh;
                sliderHold1.value = h1;
                sliderExhale.value = exh;
                sliderHold2.value = h2;

                timings[PHASE_INHALE] = inh;
                timings[PHASE_HOLD_IN] = h1;
                timings[PHASE_EXHALE] = exh;
                timings[PHASE_HOLD_OUT] = h2;

                valInhale.textContent = `${inh} 秒`;
                valHold1.textContent = `${h1} 秒`;
                valExhale.textContent = `${exh} 秒`;
                valHold2.textContent = `${h2} 秒`;

                updateBreathingPath();
            });

            presetContainer.appendChild(btn);
        });

        // 4. 重繪幾何軌道線條
        updateBreathingPath();
    }

    // 滑桿事件綁定與值同步
    function setupSliders() {
        const updateSliderValues = () => {
            timings[PHASE_INHALE] = parseFloat(sliderInhale.value);
            timings[PHASE_HOLD_IN] = parseFloat(sliderHold1.value);
            timings[PHASE_EXHALE] = parseFloat(sliderExhale.value);
            timings[PHASE_HOLD_OUT] = parseFloat(sliderHold2.value);
            targetCycles = parseInt(sliderCycles.value);

            valInhale.textContent = `${timings[PHASE_INHALE]} 秒`;
            valHold1.textContent = `${timings[PHASE_HOLD_IN]} 秒`;
            valExhale.textContent = `${timings[PHASE_EXHALE]} 秒`;
            valHold2.textContent = `${timings[PHASE_HOLD_OUT]} 秒`;
            valCycles.textContent = `${targetCycles} 次`;

            updateProgressUI();
            updateBreathingPath();
            
            // 取消預設按鈕選中
            document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        };

        sliderInhale.addEventListener('input', updateSliderValues);
        sliderHold1.addEventListener('input', updateSliderValues);
        sliderExhale.addEventListener('input', updateSliderValues);
        sliderHold2.addEventListener('input', updateSliderValues);
        sliderCycles.addEventListener('input', updateSliderValues);
    }

    // 呼吸練習法選擇事件
    methodSelect.addEventListener('change', (e) => {
        if (appState !== STATE_IDLE) {
            if (confirm('切換呼吸法將重置當前的練習，是否確定切換？')) {
                resetPractice();
            } else {
                // 還原下拉選單
                methodSelect.value = currentMethod;
                return;
            }
        }
        setupMethodConfig(methodSelect.value);
    });

    // 主題選擇
    themeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        themeDropdown.classList.toggle('show');
    });

    document.querySelectorAll('.theme-dropdown-content button').forEach(button => {
        button.addEventListener('click', () => {
            const theme = button.dataset.theme;
            activeTheme = theme;
            body.setAttribute('data-theme-active', theme);
            themeDropdown.classList.remove('show');
            localStorage.setItem('pneuma-theme', theme);
        });
    });

    window.addEventListener('click', () => {
        themeDropdown.classList.remove('show');
    });

    // 面板滑動展示控制
    function openPanel(panelToOpen, panelToClose) {
        panelToClose.classList.remove('show');
        panelToClose.classList.add('hidden');
        panelToOpen.classList.remove('hidden');
        requestAnimationFrame(() => panelToOpen.classList.add('show'));
    }

    function closePanel(panel) {
        panel.classList.remove('show');
        panel.addEventListener('transitionend', () => {
            if (!panel.classList.contains('show')) {
                panel.classList.add('hidden');
            }
        }, { once: true });
    }

    settingsToggleBtn.addEventListener('click', () => {
        if (settingsPanel.classList.contains('show')) {
            closePanel(settingsPanel);
        } else {
            openPanel(settingsPanel, statsPanel);
        }
    });

    settingsCloseBtn.addEventListener('click', () => {
        closePanel(settingsPanel);
    });

    settingsDoneBtn.addEventListener('click', () => {
        closePanel(settingsPanel);
    });

    statsToggleBtn.addEventListener('click', () => {
        if (statsPanel.classList.contains('show')) {
            closePanel(statsPanel);
        } else {
            openPanel(statsPanel, settingsPanel);
            updateStatsPanel();
        }
    });

    statsCloseBtn.addEventListener('click', () => {
        closePanel(statsPanel);
    });

    statsDoneBtn.addEventListener('click', () => {
        closePanel(statsPanel);
    });

    // ==========================================================================
    // 8. LocalStorage 練習統計與 SVG 趨勢折線圖
    // ==========================================================================
    
    function loadStatsData() {
        const defaultData = {
            streak: 0,
            lastPracticeDate: null,
            totalMinutes: 0.0,
            totalCycles: 0,
            dailyLog: {}
        };

        const stored = localStorage.getItem('pneuma-stats');
        return stored ? JSON.parse(stored) : defaultData;
    }

    function saveSessionProgress(cycles, seconds) {
        const stats = loadStatsData();
        const todayStr = getTodayString();
        const minutesPracticed = seconds / 60;

        stats.totalCycles += cycles;
        stats.totalMinutes = parseFloat((stats.totalMinutes + minutesPracticed).toFixed(2));

        if (!stats.dailyLog[todayStr]) {
            stats.dailyLog[todayStr] = 0;
        }
        stats.dailyLog[todayStr] = parseFloat((stats.dailyLog[todayStr] + minutesPracticed).toFixed(2));

        const yesterdayStr = getRelativeDateString(-1);
        if (stats.lastPracticeDate === yesterdayStr) {
            stats.streak += 1;
        } else if (stats.lastPracticeDate !== todayStr) {
            stats.streak = 1;
        }
        stats.lastPracticeDate = todayStr;

        localStorage.setItem('pneuma-stats', JSON.stringify(stats));
    }

    function updateStatsPanel() {
        const stats = loadStatsData();
        const todayStr = getTodayString();
        const yesterdayStr = getRelativeDateString(-1);
        
        if (stats.lastPracticeDate && stats.lastPracticeDate !== todayStr && stats.lastPracticeDate !== yesterdayStr) {
            stats.streak = 0;
            localStorage.setItem('pneuma-stats', JSON.stringify(stats));
        }

        statStreak.textContent = stats.streak;
        statTotalTime.textContent = Math.round(stats.totalMinutes);
        statTotalCycles.textContent = stats.totalCycles;

        renderSVGChart(stats.dailyLog);
    }

    function renderSVGChart(dailyLog) {
        svgChart.innerHTML = '';

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <linearGradient id="chart-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="var(--gradient-start)" />
                <stop offset="100%" stop-color="var(--gradient-end)" />
            </linearGradient>
            <linearGradient id="chart-area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="var(--primary-color)" stop-opacity="0.25" />
                <stop offset="100%" stop-color="var(--primary-color)" stop-opacity="0" />
            </linearGradient>
        `;
        svgChart.appendChild(defs);

        const past7Days = [];
        for (let i = 6; i >= 0; i--) {
            past7Days.push({
                dateStr: getRelativeDateString(-i),
                label: getRelativeDateLabel(-i)
            });
        }

        const values = past7Days.map(d => dailyLog[d.dateStr] || 0);
        const maxVal = Math.max(5, ...values) * 1.15;

        const chartW = 280;
        const chartH = 120;
        const paddingLeft = 45;
        const paddingTop = 20;

        const gridLines = 4;
        for (let i = 0; i <= gridLines; i++) {
            const y = paddingTop + (chartH / gridLines) * i;
            const val = maxVal - (maxVal / gridLines) * i;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('class', 'chart-grid-line');
            line.setAttribute('x1', paddingLeft);
            line.setAttribute('y1', y);
            line.setAttribute('x2', paddingLeft + chartW);
            line.setAttribute('y2', y);
            svgChart.appendChild(line);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('class', 'chart-text');
            text.setAttribute('x', paddingLeft - 8);
            text.setAttribute('y', y + 3);
            text.setAttribute('text-anchor', 'end');
            text.textContent = `${Math.round(val)}`;
            svgChart.appendChild(text);
        }

        const axisX = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        axisX.setAttribute('class', 'chart-axis-line');
        axisX.setAttribute('x1', paddingLeft);
        axisX.setAttribute('y1', paddingTop + chartH);
        axisX.setAttribute('x2', paddingLeft + chartW);
        axisX.setAttribute('y2', paddingTop + chartH);
        svgChart.appendChild(axisX);

        const points = [];
        const colW = chartW / 6;

        past7Days.forEach((day, idx) => {
            const x = paddingLeft + colW * idx;
            const val = dailyLog[day.dateStr] || 0;
            const y = paddingTop + chartH - (val / maxVal) * chartH;
            points.push({ x, y, val, label: day.label });

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('class', 'chart-text');
            text.setAttribute('x', x);
            text.setAttribute('y', paddingTop + chartH + 16);
            text.setAttribute('text-anchor', 'middle');
            text.textContent = day.label;
            svgChart.appendChild(text);
        });

        let dPath = '';
        let dArea = `M ${points[0].x} ${paddingTop + chartH} `;

        points.forEach((pt, idx) => {
            if (idx === 0) {
                dPath += `M ${pt.x} ${pt.y} `;
                dArea += `L ${pt.x} ${pt.y} `;
            } else {
                const prev = points[idx - 1];
                const cpX1 = prev.x + colW / 2;
                const cpY1 = prev.y;
                const cpX2 = pt.x - colW / 2;
                const cpY2 = pt.y;
                dPath += `C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${pt.x} ${pt.y} `;
                dArea += `C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${pt.x} ${pt.y} `;
            }
        });
        dArea += `L ${points[points.length - 1].x} ${paddingTop + chartH} Z`;

        const areaPathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        areaPathNode.setAttribute('class', 'chart-area');
        areaPathNode.setAttribute('d', dArea);
        svgChart.appendChild(areaPathNode);

        const linePathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        linePathNode.setAttribute('class', 'chart-line');
        linePathNode.setAttribute('d', dPath);
        svgChart.appendChild(linePathNode);

        points.forEach(pt => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('class', 'chart-point');
            circle.setAttribute('cx', pt.x);
            circle.setAttribute('cy', pt.y);
            circle.setAttribute('r', '4');
            
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = `${pt.label}: ${pt.val} 分鐘`;
            circle.appendChild(title);

            svgChart.appendChild(circle);
        });
    }

    clearStatsBtn.addEventListener('click', () => {
        if (confirm('確定要清除所有練習歷史紀錄嗎？此動作無法復原。')) {
            localStorage.removeItem('pneuma-stats');
            updateStatsPanel();
        }
    });

    function getTodayString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function getRelativeDateString(offset) {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function getRelativeDateLabel(offset) {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        
        if (offset === 0) return '今天';
        return `${d.getMonth() + 1}/${d.getDate()}(${dayNames[d.getDay()]})`;
    }

    // ==========================================================================
    // 9. 初始化設定載入與事件繫結
    // ==========================================================================
    
    // 載入儲存的主題
    const savedTheme = localStorage.getItem('pneuma-theme');
    if (savedTheme) {
        activeTheme = savedTheme;
        body.setAttribute('data-theme-active', savedTheme);
    } else {
        body.setAttribute('data-theme-active', 'stellar');
    }

    btnModeRing.addEventListener('click', () => switchVisualMode('ring'));
    btnModeBox.addEventListener('click', () => switchVisualMode('box'));

    // 主開始/暫停與結束按鈕
    startPauseBtn.addEventListener('click', () => {
        if (appState === STATE_BREATHING) {
            pausePractice();
        } else {
            startPractice();
        }
    });

    resetBtn.addEventListener('click', () => {
        if (confirm('確定要提前結束本次呼吸練習嗎？')) {
            resetPractice();
        }
    });

    ambientSelect.addEventListener('change', () => {
        if (appState === STATE_BREATHING) {
            playAmbientSound();
        }
    });

    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
        }
    }

    // 初始化載入
    setupSliders();
    setupMethodConfig('box'); // 預設載入箱式呼吸法
    updateStatsPanel();
});

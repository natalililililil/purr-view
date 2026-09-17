(() => {
  "use strict";

  // ---------- persistence ----------
  const STORAGE_KEY = "eyeTrainer.v1";
  const defaultState = {
    sound: false,
    vibrate: true,
    duration: { blink: 60, updown: 60, leftright: 60, circular: 60, focus: 120 },
    speed: { updown: "medium", leftright: "medium", circular: "medium" },
  };
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return {
        sound: parsed.sound ?? defaultState.sound,
        vibrate: parsed.vibrate ?? defaultState.vibrate,
        duration: { ...defaultState.duration, ...(parsed.duration || {}) },
        speed: { ...defaultState.speed, ...(parsed.speed || {}) },
      };
    } catch {
      return structuredClone(defaultState);
    }
  }
  function savePrefs() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }
  const prefs = loadPrefs();

  // ---------- audio / haptics ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }
  function beep(freq = 660, dur = 0.12) {
    if (!prefs.sound) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }
  function buzz(ms = 40) {
    if (!prefs.vibrate) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // ---------- icons ----------
  const ICONS = {
    blink: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 6c-5 0-9 3.6-10 6 .5 1.2 2 3 4.2 4.4L4.6 18l1.4 1.4 1.8-1.8C9 18.4 10.4 18.8 12 18.8s3-.4 4.2-1.2l1.8 1.8 1.4-1.4-1.6-1.6C20 14.6 21.5 12.8 22 11.6 21 9.2 17 6 12 6Zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/></svg>`,
    updown: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 8 7h3v10H8l4 5 4-5h-3V7h3z"/></svg>`,
    leftright: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2 12l5-4v3h10V8l5 4-5 4v-3H7v3z"/></svg>`,
    circular: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4a8 8 0 1 0 7.75 6h-2.1A6 6 0 1 1 12 6V3.2L16 7l-4 3.8V8a4 4 0 1 0 0 8"/></svg>`,
    focus: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM11 1h2v2h-2zm0 20h2v2h-2zM1 11h2v2H1zm20 0h2v2h-2z"/></svg>`,
  };
  document.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = ICONS[el.dataset.icon] || "";
  });

  // ---------- exercise definitions ----------
  const EXERCISES = {
    blink: {
      title: "Моргание",
      hasSpeed: false,
      prompts: ["Моргните", "Ещё раз", "Моргните", "Расслабьте веки"],
      cadence: 4000,
      build(playArea) {
        playArea.innerHTML = `
          <div class="blink-video-wrap">
            <video class="blink-video" src="assets/cat.mp4" autoplay loop muted playsinline></video>
            <div class="blink-flash" id="blinkFlash"></div>
            <div class="blink-counter" id="blinkCounter">Моргания: 0</div>
          </div>`;
      },
      onTick(ctx) {
        if (ctx.elapsedMs % ctx.def.cadence < ctx.tickMs) {
          ctx.blinkCount = (ctx.blinkCount || 0) + 1;
          const flash = document.getElementById("blinkFlash");
          const counter = document.getElementById("blinkCounter");
          if (flash) {
            flash.classList.remove("go");
            void flash.offsetWidth;
            flash.classList.add("go");
          }
          if (counter) counter.textContent = `Моргания: ${ctx.blinkCount}`;
          setPrompt(pick(ctx.def.prompts));
          beep(660);
          buzz(35);
        }
      },
    },
    updown: {
      title: "Вверх-вниз",
      hasSpeed: true,
      prompts: [],
      build(playArea) {
        playArea.innerHTML = `
          <div class="track-line track-vert"></div>
          <div class="end-marker" style="left:50%;top:10%;transform:translate(-50%,-50%)"></div>
          <div class="end-marker" style="left:50%;top:90%;transform:translate(-50%,-50%)"></div>
          <div class="mover" id="mover"></div>`;
      },
      startMotion(playArea, speed) {
        const mover = document.getElementById("mover");
        const period = { slow: 4200, medium: 2800, fast: 1700 }[speed] || 2800;
        let lastPhase = null;
        return (t) => {
          const rect = playArea.getBoundingClientRect();
          const usableH = rect.height * 0.8;
          const top = rect.height * 0.1;
          const phase = (t % period) / period;
          const y = top + (Math.sin(phase * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) * usableH;
          const x = rect.width / 2;
          mover.style.transform = `translate(${x - 17}px, ${y - 17}px)`;
          const dir = Math.sin(phase * Math.PI * 2) >= 0 ? "down" : "up";
          if (dir !== lastPhase) {
            lastPhase = dir;
            setPrompt(dir === "down" ? "Вниз ↓" : "Вверх ↑");
          }
        };
      },
    },
    leftright: {
      title: "Влево-вправо",
      hasSpeed: true,
      prompts: [],
      build(playArea) {
        playArea.innerHTML = `
          <div class="track-line track-horiz"></div>
          <div class="end-marker" style="top:50%;left:10%;transform:translate(-50%,-50%)"></div>
          <div class="end-marker" style="top:50%;left:90%;transform:translate(-50%,-50%)"></div>
          <div class="mover" id="mover"></div>`;
      },
      startMotion(playArea, speed) {
        const mover = document.getElementById("mover");
        const period = { slow: 4200, medium: 2800, fast: 1700 }[speed] || 2800;
        let lastPhase = null;
        return (t) => {
          const rect = playArea.getBoundingClientRect();
          const usableW = rect.width * 0.8;
          const left = rect.width * 0.1;
          const phase = (t % period) / period;
          const x = left + (Math.sin(phase * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) * usableW;
          const y = rect.height / 2;
          mover.style.transform = `translate(${x - 17}px, ${y - 17}px)`;
          const dir = Math.sin(phase * Math.PI * 2) >= 0 ? "right" : "left";
          if (dir !== lastPhase) {
            lastPhase = dir;
            setPrompt(dir === "right" ? "Вправо →" : "← Влево");
          }
        };
      },
    },
    circular: {
      title: "Вращение",
      hasSpeed: true,
      prompts: [],
      build(playArea) {
        playArea.innerHTML = `
          <div class="track-line track-circle"></div>
          <div class="mover" id="mover"></div>`;
      },
      startMotion(playArea, speed) {
        const mover = document.getElementById("mover");
        const period = { slow: 6000, medium: 4000, fast: 2500 }[speed] || 4000;
        let announced = false;
        return (t) => {
          const rect = playArea.getBoundingClientRect();
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          const r = Math.min(rect.width, rect.height) * 0.34;
          const angle = (t % period) / period * Math.PI * 2 - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          mover.style.transform = `translate(${x - 17}px, ${y - 17}px)`;
          if (!announced) {
            announced = true;
            setPrompt("Следите по кругу");
          }
        };
      },
    },
    focus: {
      title: "Фокус 20-20-20",
      hasSpeed: false,
      build(playArea) {
        playArea.innerHTML = `
          <div class="focus-area">
            <div class="focus-label">Смотрите на точку</div>
            <div class="focus-far" id="focusFar"></div>
            <div class="focus-near" id="focusNear"></div>
          </div>`;
      },
      cadenceFar: 8000,
      cadenceNear: 4000,
      onTick(ctx) {
        const cycle = ctx.def.cadenceFar + ctx.def.cadenceNear;
        const pos = ctx.elapsedMs % cycle;
        const far = document.getElementById("focusFar");
        const near = document.getElementById("focusNear");
        const isFar = pos < ctx.def.cadenceFar;
        if (isFar !== ctx.wasFar) {
          ctx.wasFar = isFar;
          far.classList.toggle("active", isFar);
          near.classList.toggle("active", !isFar);
          setPrompt(isFar ? "Смотрите вдаль" : "Смотрите на близкую точку");
          beep(isFar ? 520 : 780);
          buzz(30);
        }
      },
    },
  };

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---------- DOM refs ----------
  const screens = {
    home: document.getElementById("screen-home"),
    exercise: document.getElementById("screen-exercise"),
  };
  const exTitle = document.getElementById("exTitle");
  const playArea = document.getElementById("playArea");
  const promptLabel = document.getElementById("promptLabel");
  const timeLabel = document.getElementById("timeLabel");
  const ringFg = document.getElementById("ringFg");
  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
  ringFg.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;

  const setupControls = document.getElementById("setupControls");
  const runControls = document.getElementById("runControls");
  const doneControls = document.getElementById("doneControls");
  const durationChips = document.getElementById("durationChips");
  const speedRow = document.getElementById("speedRow");
  const speedChips = document.getElementById("speedChips");
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const stopBtn = document.getElementById("stopBtn");
  const repeatBtn = document.getElementById("repeatBtn");
  const homeBtn = document.getElementById("homeBtn");

  function setPrompt(text) {
    promptLabel.textContent = text;
    promptLabel.classList.remove("pulse");
    void promptLabel.offsetWidth;
    promptLabel.classList.add("pulse");
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ---------- run state ----------
  let current = null;
  let def = null;
  let totalMs = 0;
  let elapsedMs = 0;
  let lastTs = null;
  let rafId = null;
  let running = false;
  let paused = false;
  let motionFn = null;
  let runCtx = null;

  function formatTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function setupExercise(key) {
    current = key;
    def = EXERCISES[key];
    exTitle.textContent = def.title;
    speedRow.style.display = def.hasSpeed ? "" : "none";

    const savedDur = prefs.duration[key] || 60;
    [...durationChips.children].forEach((c) => {
      c.classList.toggle("selected", Number(c.dataset.value) === savedDur);
    });
    const savedSpeed = prefs.speed[key] || "medium";
    [...speedChips.children].forEach((c) => {
      c.classList.toggle("selected", c.dataset.value === savedSpeed);
    });

    setupControls.classList.remove("hidden");
    runControls.classList.add("hidden");
    doneControls.classList.add("hidden");

    showScreen("exercise");

    def.build(playArea);
    if (def.hasSpeed) {
      def.startMotion(playArea, savedSpeed)(0);
      promptLabel.classList.remove("pulse");
    }
    promptLabel.textContent = "Готовы начать?";
    timeLabel.textContent = formatTime((savedDur || 60) * 1000);
    ringFg.style.strokeDashoffset = "0";
  }

  function currentDuration() {
    const sel = durationChips.querySelector(".chip.selected");
    return sel ? Number(sel.dataset.value) : 60;
  }
  function currentSpeed() {
    const sel = speedChips.querySelector(".chip.selected");
    return sel ? sel.dataset.value : "medium";
  }

  function startRun() {
    ensureAudio();
    totalMs = currentDuration() * 1000;
    elapsedMs = 0;
    lastTs = null;
    paused = false;
    running = true;
    runCtx = { def, elapsedMs: 0, tickMs: 16, blinkCount: 0, wasFar: undefined };

    prefs.duration[current] = currentDuration();
    if (def.hasSpeed) prefs.speed[current] = currentSpeed();
    savePrefs();

    def.build(playArea);
    if (def.hasSpeed) {
      motionFn = def.startMotion(playArea, currentSpeed());
    } else {
      motionFn = null;
    }

    setupControls.classList.add("hidden");
    doneControls.classList.add("hidden");
    runControls.classList.remove("hidden");
    setPrompt(def.hasSpeed ? "Следите глазами за точкой" : "Начали!");

    rafId = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (!running || paused) return;
    if (lastTs == null) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    elapsedMs += dt;
    runCtx.elapsedMs = elapsedMs;
    runCtx.tickMs = dt || 16;

    const remaining = totalMs - elapsedMs;
    timeLabel.textContent = formatTime(remaining);
    ringFg.style.strokeDashoffset = String(RING_CIRCUMFERENCE * Math.min(1, elapsedMs / totalMs));

    if (motionFn) motionFn(elapsedMs);
    if (def.onTick) def.onTick(runCtx);

    if (remaining <= 0) {
      finishRun();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function finishRun() {
    running = false;
    cancelAnimationFrame(rafId);
    const video = playArea.querySelector("video");
    if (video) video.pause();
    runControls.classList.add("hidden");
    doneControls.classList.remove("hidden");
    beep(880, 0.18);
    buzz(80);
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    pauseBtn.innerHTML = paused
      ? `<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M8 5h3v14H8zM13 5h3v14h-3z"/></svg>`;
    const video = playArea.querySelector("video");
    if (video) {
      if (paused) video.pause();
      else video.play().catch(() => {});
    }
    if (!paused) {
      lastTs = null;
      rafId = requestAnimationFrame(loop);
    }
  }

  function stopRun() {
    running = false;
    paused = false;
    cancelAnimationFrame(rafId);
    setupExercise(current);
  }

  const exerciseInfoData = {
    blink: {
      title: "Моргание",
      desc: "Моргайте каждый раз, когда темнеет экран. Частое моргание помогает равномерно распределить слезную пленку по поверхности глаза, защищая его от пересыхания при работе за экраном."
    },
    updown: {
      title: "Вверх-вниз",
      desc: "Медленно переводите взгляд максимально вверх, а затем максимально вниз. Это снимает утомление с вертикальных прямых мышц глаза."
    },
    leftright: {
      title: "Влево-вправо",
      desc: "Двигайте глазами до упора влево, а затем вправо, не поворачивая голову. Упражнение улучшает подвижность глазных яблок и помогает разгрузить мышцы при монотонной работе с текстом."
    },
    circular: {
      title: "Вращение",
      desc: "Совершайте плавные круговые движения глазами по часовой стрелке. Улучшает общую подвижность."
    },
    focus: {
      title: "Фокус 20-20-20",
      desc: "Следите за точкой, которая плавно меняет размер: переводите взгляд с близкого фокуса на удаленный. Это отлично тренирует аккомодацию и снимает напряжение."
    }
  };

  let currentExId = null;

  function checkAndShowInfo(exId) {
    currentExId = exId;
    const info = exerciseInfoData[exId];
    if (!info) return;

    document.getElementById('infoTitle').textContent = info.title;
    document.getElementById('infoDesc').textContent = info.desc;

    const dontShow = localStorage.getItem(`dontShowInfo_${exId}`) === 'true';
    document.getElementById('dontShowToggle').checked = dontShow;

    if (!dontShow) {
      document.getElementById('infoOverlay').classList.remove('hidden');
    }
  }

  document.getElementById('infoBtn').addEventListener('click', () => {
    const info = exerciseInfoData[currentExId];
    if (info) {
      document.getElementById('infoTitle').textContent = info.title;
      document.getElementById('infoDesc').textContent = info.desc;
      document.getElementById('dontShowToggle').checked = localStorage.getItem(`dontShowInfo_${currentExId}`) === 'true';
      document.getElementById('infoOverlay').classList.remove('hidden');
    }
  });

  document.getElementById('closeInfoBtn').addEventListener('click', () => {
    const dontShow = document.getElementById('dontShowToggle').checked;
    if (currentExId) {
      localStorage.setItem(`dontShowInfo_${currentExId}`, dontShow);
    }
    document.getElementById('infoOverlay').classList.add('hidden');
  });

  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const exId = btn.dataset.goto;
      setupExercise(exId);
      checkAndShowInfo(exId);
    });
  });

  document.getElementById("backBtn").addEventListener("click", () => {
    running = false;
    cancelAnimationFrame(rafId);
    const video = playArea.querySelector("video");
    if (video) video.pause();
    showScreen("home");
  });
  homeBtn.addEventListener("click", () => showScreen("home"));
  repeatBtn.addEventListener("click", () => setupExercise(current));

  durationChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    [...durationChips.children].forEach((c) => c.classList.remove("selected"));
    chip.classList.add("selected");
    timeLabel.textContent = formatTime(Number(chip.dataset.value) * 1000);
  });
  speedChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    [...speedChips.children].forEach((c) => c.classList.remove("selected"));
    chip.classList.add("selected");
  });

  startBtn.addEventListener("click", startRun);
  pauseBtn.addEventListener("click", togglePause);
  stopBtn.addEventListener("click", stopRun);

  // settings sheet
  const settingsOverlay = document.getElementById("settingsOverlay");
  const soundToggle = document.getElementById("soundToggle");
  const vibrateToggle = document.getElementById("vibrateToggle");
  soundToggle.checked = prefs.sound;
  vibrateToggle.checked = prefs.vibrate;
  document.getElementById("settingsBtn").addEventListener("click", () => {
    settingsOverlay.classList.remove("hidden");
  });
  document.getElementById("closeSettings").addEventListener("click", () => {
    settingsOverlay.classList.add("hidden");
  });
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.add("hidden");
  });
  soundToggle.addEventListener("change", () => {
    prefs.sound = soundToggle.checked;
    savePrefs();
    if (prefs.sound) beep(660);
  });
  vibrateToggle.addEventListener("change", () => {
    prefs.vibrate = vibrateToggle.checked;
    savePrefs();
    if (prefs.vibrate) buzz(40);
  });

  // ---------- eye fatigue assessment logic ----------
  const ASSESSMENT_KEY = "eyeTrainer.assessment.v1";
  const ASSESSMENT_QUESTIONS = [
    { id: 'dryness', q: 'Сухость, рези или «песок» в глазах?', options: [{label:'Нет',score:0}, {label:'Иногда',score:1}, {label:'Постоянно',score:2}] },
    { id: 'clarity', q: 'Текст расплывается или двоится?', options: [{label:'Всё чётко',score:0}, {label:'Плывет к концу',score:1}, {label:'Трудно фокус',score:2}] },
    { id: 'light', q: 'Режет ли глаза от яркого света?', options: [{label:'Нет',score:0}, {label:'Жмурюсь',score:1}, {label:'Очень ярко',score:2}] },
    { id: 'weight', q: 'Есть ли напряжение или головная боль в области лба/висков?', options: [{label:'Нет',score:0}, {label:'К концу дня',score:1}, {label:'Да',score:2}] }
  ];
  let assessmentState = JSON.parse(localStorage.getItem(ASSESSMENT_KEY) || "{}");
  let quickExTarget = null;

  function renderAssessmentForm() {
    const container = document.getElementById("assessmentSteps");
    container.innerHTML = ASSESSMENT_QUESTIONS.map(item => `
      <div class="assessment-question" data-qid="${item.id}">
        <span class="assessment-question-text">${item.q}</span>
        <div class="assessment-options">
          ${item.options.map((opt, idx) => `
            <button class="assessment-option ${assessmentState[item.id] === opt.score ? 'selected' : ''}" data-score="${opt.score}" data-idx="${idx}">${opt.label}</button>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function updateAssessmentBanner(score) {
    const dot = document.getElementById("assessmentDot");
    const statusText = document.getElementById("assessmentStatusText");
    if (score === undefined) return;
    if (score <= 2) {
      dot.textContent = "🟢";
      statusText.textContent = "Все хорошо (0–2 балла)";
    } else if (score <= 5) {
      dot.textContent = "🟡";
      statusText.textContent = "Умеренная усталость (3–5 баллов)";
    } else {
      dot.textContent = "🔴";
      statusText.textContent = "Требуется перерыв (6+ баллов)";
    }
  }

  function evaluateAssessment() {
    const score = ASSESSMENT_QUESTIONS.reduce((acc, q) => acc + (assessmentState[q.id] ?? 0), 0);

    const hasLastOptionSelected = ASSESSMENT_QUESTIONS.some(q => assessmentState[q.id] === 2);

    localStorage.setItem(ASSESSMENT_KEY, JSON.stringify(assessmentState));
    updateAssessmentBanner(score);

    const recBlock = document.getElementById("assessmentRecBlock");
    const recBadge = document.getElementById("recBadge");
    const recText = document.getElementById("recText");
    const quickBtn = document.getElementById("quickExBtn");
    recBlock.classList.remove("hidden");

    if (score > 5){
      recBadge.textContent = "🔴 Красная зона";
      recText.textContent = "Аварийный режим: фокус 20-20-20 и уходим от экрана на 5 минут.";
      quickExTarget = "focus";
      quickBtn.classList.remove("hidden");
    } else if (hasLastOptionSelected || (score > 2 && score <= 5)) {
      recBadge.textContent = "🟡 Жёлтая зона";
      recText.textContent = "Лови разминку для глаз (Моргание).";
      quickExTarget = "blink";
      quickBtn.classList.remove("hidden");
    }
    else {
      recBadge.textContent = "🟢 Зелёная зона";
      recText.textContent = "Всё хорошо, просто попей водички.";
      quickBtn.classList.add("hidden");
    }
  }

  document.getElementById("openAssessmentBtn").addEventListener("click", () => {
    document.getElementById("assessmentRecBlock").classList.add("hidden");
    document.getElementById("quickExBtn").classList.add("hidden");
    renderAssessmentForm();
    document.getElementById("assessmentOverlay").classList.remove("hidden");
  });
  document.getElementById("closeAssessment").addEventListener("click", () => {
    document.getElementById("assessmentOverlay").classList.add("hidden");
  });
  document.getElementById("assessmentOverlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("assessmentOverlay")) {
      document.getElementById("assessmentOverlay").classList.add("hidden");
    }
  });
  document.getElementById("assessmentSteps").addEventListener("click", (e) => {
    const btn = e.target.closest(".assessment-option");
    if (!btn) return;
    const qEl = btn.closest(".assessment-question");
    const qid = qEl.dataset.qid;
    qEl.querySelectorAll(".assessment-option").forEach(o => o.classList.remove("selected"));
    btn.classList.add("selected");
    assessmentState[qid] = Number(btn.dataset.score);
  });
  document.getElementById("submitAssessment").addEventListener("click", evaluateAssessment);
  document.getElementById("quickExBtn").addEventListener("click", () => {
    document.getElementById("assessmentOverlay").classList.add("hidden");
    if (quickExTarget) {
      setupExercise(quickExTarget);
      checkAndShowInfo(quickExTarget);
    }
  });

  if (Object.keys(assessmentState).length > 0) {
    const initScore = ASSESSMENT_QUESTIONS.reduce((acc, q) => acc + (assessmentState[q.id] ?? 0), 0);
    updateAssessmentBanner(initScore);
  }

  // ---------- PWA service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  showScreen("home");
})();
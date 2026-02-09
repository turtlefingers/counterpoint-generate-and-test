import { Engine, RULES, TOTAL_STEPS } from './counterpoint.js';
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, GhostNote, Barline } from 'vexflow';
import * as Tone from 'tone';

const engine = new Engine();
const rulesList = document.getElementById('rules-list');
const stepDisplay = document.getElementById('step-display');
const candidateDisplay = document.getElementById('candidate-note');
const statusMessage = document.getElementById('status-message');
const nextBtn = document.getElementById('next-btn');
const autoBtn = document.getElementById('auto-btn');
const speedSelect = document.getElementById('speed-select');
const resetBtn = document.getElementById('reset-btn');
const undoBtn = document.getElementById('undo-btn');
const rhythmToggle = document.getElementById('rhythm-toggle');
const playBtn = document.getElementById('play-btn');

const synth = new Tone.PolySynth(Tone.Synth).toDestination();

let currentCandidate = null;
let isAutoRunning = false;
let autoTimer = null;
let playingTime = -1; // Time in the score (0 to 8)

function midiToNote(midi) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const oct = Math.floor(midi / 12) - 1;
  const name = notes[midi % 12];
  return `${name}${oct}`;
}

function midiToVex(midi) {
  const notes = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const oct = Math.floor(midi / 12) - 1;
  const name = notes[midi % 12];
  return `${name}/${oct}`;
}

function initRulesUI() {
  if (!rulesList) return;
  rulesList.innerHTML = RULES.map(rule => `
    <li class="rule-item pending" id="rule-${rule.id}">
      <div class="rule-icon">?</div>
      <div class="rule-content">
        <span class="rule-name">${rule.name}</span>
        <span class="rule-desc">${rule.description}</span>
      </div>
    </li>
  `).join('');
}

function updateRulesUI(results) {
  RULES.forEach(rule => {
    const el = document.getElementById(`rule-${rule.id}`);
    if (!el) return;
    const icon = el.querySelector('.rule-icon');
    el.classList.remove('pending', 'pass', 'fail');

    const res = results[rule.id];
    const passed = (typeof res === 'object') ? res.passed : res === true;
    const failed = (typeof res === 'object') ? !res.passed : res === false;

    if (passed) {
      el.classList.add('pass');
      icon.innerHTML = '✓';
    } else if (failed) {
      el.classList.add('fail');
      icon.innerHTML = '✗';
    } else {
      el.classList.add('pending');
      icon.innerHTML = '?';
    }

    // Special handling for repetition count
    if (rule.id === 'repetition') {
      const nameEl = el.querySelector('.rule-name');
      if (typeof res === 'object' && res.count > 0) {
        nameEl.innerHTML = `${rule.name} <small style="opacity: 0.7; margin-left: 5px;">(${res.count}/3)</small>`;
      } else {
        nameEl.innerText = rule.name;
      }
    }
  });
}

function drawScore() {
  const container = document.getElementById('score-canvas');
  if (!container) return;

  // Calculate width based on parents or window
  const parentWidth = container.parentElement ? container.parentElement.clientWidth : window.innerWidth;
  // Subtract parent padding (60px) and score-canvas's own padding/border (42px) + buffer
  const w = Math.max(300, Math.min(1200, parentWidth - 50));

  container.innerHTML = '';

  const measuresPerSystem = engine.rhythmMode ? 4 : (w < 600 ? 4 : 8);
  const systemCount = Math.ceil(TOTAL_STEPS / measuresPerSystem);
  const systemGap = 240;

  const h = systemCount > 1 ? 550 : 300;

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(w, h);
  const context = renderer.getContext();

  const measureW = (w - 80) / measuresPerSystem;

  for (let m = 0; m < TOTAL_STEPS; m++) {
    const systemIdx = Math.floor(m / measuresPerSystem);
    const measureIdxInSystem = m % measuresPerSystem;

    const xPos = 60 + measureIdxInSystem * measureW;
    const yBase = 40 + systemIdx * systemGap;

    const tStave = new Stave(xPos, yBase, measureW);
    const bStave = new Stave(xPos, yBase + 100, measureW);

    if (measureIdxInSystem === 0) {
      tStave.addClef('treble');
      bStave.addClef('bass');
    }
    if (m === TOTAL_STEPS - 1) {
      tStave.setEndBarType(Barline.type.DOUBLE);
      bStave.setEndBarType(Barline.type.DOUBLE);
    }

    tStave.setContext(context).draw();
    bStave.setContext(context).draw();

    const measureSlots = engine.slots.filter(s => s.measure === m);
    const trebleSlots = measureSlots.filter(s => s.voice === 0);
    const bassSlots = measureSlots.filter(s => s.voice === 1);

    const renderVoice = (slots, clef) => {
      const vexNotes = [];
      slots.forEach((slot, i) => {
        const slotIdxInEngine = engine.slots.indexOf(slot);
        let midi = engine.score[slotIdxInEngine];
        let color = 'black';

        if (playingTime >= 0) {
          const startTime = m + (i / slots.length);
          const endTime = m + ((i + 1) / slots.length);
          if (playingTime >= startTime && playingTime < endTime) {
            color = '#3f51b5'; // Material Indigo
          }
        }

        if (!midi && currentCandidate && currentCandidate.slotIdx === slotIdxInEngine) {
          midi = currentCandidate.midi;
          color = currentCandidate.passed === true ? '#4caf50' : (currentCandidate.passed === false ? '#f44336' : '#ffc107'); // Material Green, Red, Amber
        }

        if (midi) {
          const key = midiToVex(midi);
          const note = new StaveNote({ clef, keys: [key], duration: slot.duration });
          if (key.includes('#')) note.addModifier(new Accidental('#'), 0);
          note.setStyle({ fillStyle: color, strokeStyle: color });
          vexNotes.push(note);
        } else {
          vexNotes.push(new GhostNote({ duration: slot.duration }));
        }
      });
      return vexNotes;
    };

    const tVexNotes = renderVoice(trebleSlots, 'treble');
    const bVexNotes = renderVoice(bassSlots, 'bass');

    const voiceT = new Voice({ num_beats: 4, beat_value: 4 });
    voiceT.addTickables(tVexNotes);
    new Formatter().joinVoices([voiceT]).format([voiceT], measureW - 30);
    voiceT.draw(context, tStave);

    const voiceB = new Voice({ num_beats: 4, beat_value: 4 });
    voiceB.addTickables(bVexNotes);
    new Formatter().joinVoices([voiceB]).format([voiceB], measureW - 30);
    voiceB.draw(context, bStave);
  }
}

async function handleNext() {
  if (engine.isFinished()) return false;

  await Tone.start();

  const slot = engine.currentSlot;
  const candidate = engine.generateCandidate();
  candidateDisplay.innerText = midiToNote(candidate);
  synth.triggerAttackRelease(midiToNote(candidate), '4n');

  currentCandidate = {
    midi: candidate,
    slotIdx: engine.currentSlotIndex,
    passed: null
  };
  drawScore();

  const results = engine.testCandidate(candidate);
  updateRulesUI(results);

  const passed = Object.values(results).every(res =>
    (typeof res === 'object') ? res.passed : res === true
  );
  currentCandidate.passed = passed;

  drawScore();

  if (passed) {
    statusMessage.innerText = '✅ 규칙 통과! 악보에 고정합니다.';
    statusMessage.style.color = 'var(--success-color)';
    nextBtn.disabled = true;

    engine.fixNote(candidate);

    return new Promise((resolve) => {
      setTimeout(() => {
        currentCandidate = null;
        drawScore();
        if (!engine.isFinished()) {
          const nextSlot = engine.currentSlot;
          stepDisplay.innerText = `마디: ${nextSlot.measure + 1} / 성부: ${nextSlot.voice + 1} (${nextSlot.noteIndex + 1}/${engine.slots.filter(s => s.measure === nextSlot.measure && s.voice === nextSlot.voice).length})`;
          if (!isAutoRunning) nextBtn.disabled = false;
        } else {
          stepDisplay.innerText = '🎉 완성!';
          nextBtn.disabled = true;
          stopAutoRun();
        }
        candidateDisplay.innerText = '-';
        statusMessage.innerText = '';
        initRulesUI();
        resolve(true);
      }, 500);
    });
  } else {
    statusMessage.innerText = '❌ 규칙 위반. 다른 음을 시도합니다.';
    statusMessage.style.color = 'var(--error-color)';
    return false;
  }
}

function handleRhythmToggle() {
  const newState = !engine.rhythmMode;
  engine.setRhythmMode(newState);
  rhythmToggle.innerText = `리듬: ${newState ? 'ON' : 'OFF'}`;
  rhythmToggle.classList.toggle('active', newState);
  handleReset();
}

async function startAutoRun() {
  if (isAutoRunning) return;
  if (engine.isFinished()) return;

  isAutoRunning = true;
  autoBtn.innerText = '중지';
  autoBtn.classList.add('active');
  nextBtn.disabled = true;

  const run = async () => {
    if (!isAutoRunning) return;

    await handleNext();

    const speed = parseInt(speedSelect.value) || 500;
    autoTimer = setTimeout(run, speed);
  };

  run();
}

function stopAutoRun() {
  isAutoRunning = false;
  if (autoBtn) {
    autoBtn.innerText = '자동 실행';
    autoBtn.classList.remove('active');
  }
  if (!engine.isFinished()) {
    nextBtn.disabled = false;
  }
  if (autoTimer) clearTimeout(autoTimer);
}

function handleAutoToggle() {
  if (isAutoRunning) {
    stopAutoRun();
  } else {
    startAutoRun();
  }
}

function handleReset() {
  stopAutoRun();
  engine.reset();
  currentCandidate = null;
  playingTime = -1;
  nextBtn.disabled = false;
  const slot = engine.currentSlot;
  stepDisplay.innerText = `마디: ${slot.measure + 1} / 성부: ${slot.voice + 1}`;
  candidateDisplay.innerText = '-';
  statusMessage.innerText = '';
  initRulesUI();
  drawScore();
}

function handleUndo() {
  if (isAutoRunning) stopAutoRun();

  if (engine.popNote()) {
    currentCandidate = null;
    candidateDisplay.innerText = '-';
    statusMessage.innerText = '⏪ 되돌렸습니다.';
    statusMessage.style.color = 'var(--text-dim)';

    const nextSlot = engine.currentSlot;
    if (nextSlot) {
      stepDisplay.innerText = `마디: ${nextSlot.measure + 1} / 성부: ${nextSlot.voice + 1} (${nextSlot.noteIndex + 1}/${engine.slots.filter(s => s.measure === nextSlot.measure && s.voice === nextSlot.voice).length})`;
      nextBtn.disabled = false;
    }

    initRulesUI();
    drawScore();
  }
}

async function handlePlay() {
  await Tone.start();
  playingTime = -1;
  const now = Tone.now();

  // Schedule everything based on durations
  let currentTime = 0;
  const durationMap = { 'w': 1, 'h': 0.5, 'q': 0.25, '8': 0.125 };

  for (let m = 0; m < TOTAL_STEPS; m++) {
    const measureSlots = engine.slots.filter(s => s.measure === m);
    const trebleSlots = measureSlots.filter(s => s.voice === 0);
    const bassSlots = measureSlots.filter(s => s.voice === 1);

    const count = trebleSlots.length;
    const measureDuration = 1.0;
    const noteDuration = measureDuration / count;

    for (let i = 0; i < count; i++) {
      const tIdx = engine.slots.indexOf(trebleSlots[i]);
      const bIdx = engine.slots.indexOf(bassSlots[i]);
      const tNote = engine.score[tIdx];
      const bNote = engine.score[bIdx];

      const time = now + currentTime;
      const playDur = noteDuration * 0.8;

      if (tNote) synth.triggerAttackRelease(midiToNote(tNote), playDur, time);
      if (bNote) synth.triggerAttackRelease(midiToNote(bNote), playDur, time);

      const highlightTime = currentTime;
      Tone.Draw.schedule(() => {
        playingTime = m + (i / count);
        drawScore();
      }, time);

      currentTime += noteDuration;
    }
  }

  // Clear highlight
  Tone.Draw.schedule(() => {
    playingTime = -1;
    drawScore();
  }, now + currentTime);
}

nextBtn.addEventListener('click', handleNext);
autoBtn.addEventListener('click', handleAutoToggle);
resetBtn.addEventListener('click', handleReset);
undoBtn.addEventListener('click', handleUndo);
rhythmToggle.addEventListener('click', handleRhythmToggle);
playBtn.addEventListener('click', handlePlay);

initRulesUI();

function initApp() {
  drawScore();
  if (window.lucide) {
    lucide.createIcons();
  }
}

window.addEventListener('load', initApp);
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(drawScore, 100);
});

if (document.readyState === 'complete') {
  initApp();
}

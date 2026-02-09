/**
 * Iliac Suite Simulation Engine (Restarted)
 * Species 1 Counterpoint (Note against Note)
 */

export const RULES = [
  { id: 'range', name: '음역 확인', description: '음이 허용 범위 내에 있음' },
  { id: 'leap', name: '도약 제한', description: '6도 이상의 도약 금지' },
  { id: 'consonance', name: '협화음 확인', description: '1, 3, 5, 6, 8도 협화음만 허용' },
  { id: 'parallel', name: '병행 금지', description: '병행 5도/8도 금지' },
  { id: 'repetition', name: '3/6도 제한', description: '3/6도 병행은 3회까지만 허용' },
  { id: 'startEnd', name: '시작과 끝', description: '시작과 끝은 1도 또는 8도' }
];

export const TOTAL_STEPS = 8;
export const VOICES_COUNT = 2;

export class Engine {
  constructor() {
    this.rhythmMode = false;
    this.reset();

    // MIDI Note Scales
    this.scales = [
      [60, 62, 64, 65, 67, 69, 71, 72], // Treble: C4-C5
      [48, 50, 52, 53, 55, 57, 59, 60]  // Bass: C3-C4
    ];
  }

  setRhythmMode(enabled) {
    this.rhythmMode = enabled;
  }

  generateSlots() {
    const slots = [];
    const patterns = ['w', 'h', 'q', '8'];
    const durToBeats = { 'w': 4.0, 'h': 2.0, 'q': 1.0, '8': 0.5 };

    for (let m = 0; m < TOTAL_STEPS; m++) {
      if (!this.rhythmMode || m === TOTAL_STEPS - 1) {
        // Whole note mode or final measure
        slots.push({ measure: m, duration: 'w', voice: 0, noteIndex: 0 });
        slots.push({ measure: m, duration: 'w', voice: 1, noteIndex: 0 });
        continue;
      }

      let beatsFilled = 0;
      let nIdx = 0;
      while (beatsFilled < 4.0) {
        const remaining = 4.0 - beatsFilled;

        // Weights: q (35%), 8 (10%), h (45%), w (10%)
        const candidates = [
          { p: 'q', w: 35 },
          { p: '8', w: 10 },
          { p: 'h', w: 45 },
          { p: 'w', w: 10 }
        ];

        // Filter by what actually fits
        const possible = candidates.filter(c => durToBeats[c.p] <= remaining);

        // Re-calculate weights for available options
        const totalWeight = possible.reduce((sum, c) => sum + c.w, 0);
        let random = Math.random() * totalWeight;

        let pattern = possible[possible.length - 1].p;
        for (const c of possible) {
          if (random < c.w) {
            pattern = c.p;
            break;
          }
          random -= c.w;
        }

        // Add slots for both voices for this duration
        slots.push({ measure: m, duration: pattern, voice: 0, noteIndex: nIdx });
        slots.push({ measure: m, duration: pattern, voice: 1, noteIndex: nIdx });

        beatsFilled += durToBeats[pattern];
        nIdx++;
      }
    }
    return slots;
  }

  reset() {
    this.slots = this.generateSlots();
    this.score = Array(this.slots.length).fill(null);
    this.currentSlotIndex = 0;
  }

  get currentSlot() {
    return this.slots[this.currentSlotIndex];
  }

  findPreviousNote(voice, fromIndex) {
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (this.slots[i].voice === voice && this.score[i] !== null) {
        return this.score[i];
      }
    }
    return null;
  }

  generateCandidate() {
    const slot = this.currentSlot;
    if (!slot) return null;
    const scale = this.scales[slot.voice];
    return scale[Math.floor(Math.random() * scale.length)];
  }

  testCandidate(candidate) {
    const results = {};
    const slot = this.currentSlot;
    const idx = this.currentSlotIndex;

    // 1. Range
    results.range = true;

    // 2. Leap
    const prevInVoice = this.findPreviousNote(slot.voice, idx);
    if (prevInVoice !== null) {
      results.leap = Math.abs(candidate - prevInVoice) <= 9;
    } else {
      results.leap = true;
    }

    // 3. Consonance (Vertical)
    if (slot.voice === 1) {
      const upper = this.score[idx - 1];
      const interval = Math.abs(upper - candidate);

      const isStart = (idx === 0 || idx === 1);
      const isEnd = (idx === this.slots.length - 1 || idx === this.slots.length - 2);

      // Perfect and Imperfect consonances
      let allowed = [3, 4, 7, 8, 9, 12, 15, 16];

      // Allow Unison (0) ONLY at the start or end for better voice independence in the middle
      if (isStart || isEnd) {
        allowed.push(0);
      }

      results.consonance = allowed.includes(interval);
    } else {
      results.consonance = true;
    }

    // 4. Parallel
    if (slot.voice === 1) {
      let prevIdx0 = -1;
      let prevIdx1 = -1;

      for (let i = idx - 2; i >= 1; i -= 2) {
        if (this.score[i] !== null && this.score[i - 1] !== null) {
          prevIdx0 = i - 1;
          prevIdx1 = i;
          break;
        }
      }

      if (prevIdx0 !== -1) {
        const pUpper = this.score[prevIdx0];
        const pLower = this.score[prevIdx1];
        const cUpper = this.score[idx - 1];
        const cLower = candidate;

        const pInt = Math.abs(pUpper - pLower) % 12;
        const cInt = Math.abs(cUpper - cLower) % 12;

        const perfects = [0, 7]; // Unison/Octave (0) and Perfect Fifth (7)
        if (perfects.includes(pInt) && perfects.includes(cInt)) {
          if (pInt === cInt) {
            results.parallel = false;
          } else {
            results.parallel = true;
          }
        } else {
          results.parallel = true;
        }
      } else {
        results.parallel = true;
      }
    } else {
      results.parallel = true;
    }

    // 5. Start/End
    const isStart = (idx === 0 || idx === 1);
    const isEnd = (idx === this.slots.length - 1 || idx === this.slots.length - 2);

    if (isStart || isEnd) {
      if (slot.voice === 0) {
        results.startEnd = (candidate % 12 === 0);
      } else {
        const upper = this.score[idx - 1];
        const interval = Math.abs(upper - candidate);
        results.startEnd = (interval === 0 || interval === 12);
      }
    } else {
      results.startEnd = true;
    }

    // 6. Repetition (3/6 parallel limit)
    if (slot.voice === 1) {
      const cInt = Math.abs(this.score[idx - 1] - candidate) % 12;
      if (cInt === 3 || cInt === 4 || cInt === 8 || cInt === 9) {
        let count = 1;
        // Look back at previous slots
        for (let i = idx - 2; i >= 1; i -= 2) {
          if (this.score[i] !== null && this.score[i - 1] !== null) {
            const pInt = Math.abs(this.score[i - 1] - this.score[i]) % 12;
            if (pInt === cInt) {
              count++;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        results.repetition = { passed: count <= 3, count: count };
      } else {
        results.repetition = { passed: true, count: 0 };
      }
    } else {
      results.repetition = true;
    }

    return results;
  }

  fixNote(note) {
    this.score[this.currentSlotIndex] = note;
    this.currentSlotIndex++;
  }

  popNote() {
    if (this.currentSlotIndex > 0) {
      this.currentSlotIndex--;
      this.score[this.currentSlotIndex] = null;
      return true;
    }
    return false;
  }

  isFinished() {
    return this.currentSlotIndex >= this.slots.length;
  }
}


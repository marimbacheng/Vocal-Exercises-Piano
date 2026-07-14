const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note → 音名(C4 = 60,A4 = 69) */
export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

/** 首調唱名(movable-do):級數 → Do Re Mi …,大調七音循環 */
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'];

/** 複合級數 → 首調唱名(忽略八度,只取音級) */
export function degreeToSolfege(d: number): string {
  return SOLFEGE[(((d - 1) % 7) + 7) % 7];
}

/**
 * 複合級數 → 簡譜數字(1–7);高八度加上點(U+0307)、低八度加下點(U+0323),
 * 每高/低一個八度多一個點。
 */
export function degreeToJianpu(d: number): string {
  const num = String((((d - 1) % 7) + 7) % 7 + 1);
  const octave = Math.floor((d - 1) / 7);
  if (octave > 0) return num + '̇'.repeat(octave);
  if (octave < 0) return num + '̣'.repeat(-octave);
  return num;
}

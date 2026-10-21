const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note → 音名(C4 = 60,A4 = 69) */
export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

/** 首調唱名(movable-do):級數 → Do Re Mi …,大調七音循環 */
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'];

/**
 * 降音唱名(movable-do 半音下行慣例):♭2 Ra、♭3 Me、♭5 Se、♭6 Le、♭7 Te。
 * ♭1 / ♭4 實務上不會出現,仍給可讀寫法以免回傳 undefined。
 */
const SOLFEGE_FLAT = ['Do♭', 'Ra', 'Me', 'Fa♭', 'Se', 'Le', 'Te'];

/** 複合級數 → 首調唱名(忽略八度,只取音級);alter = -1 時回降音唱名 */
export function degreeToSolfege(d: number, alter = 0): string {
  const i = (((d - 1) % 7) + 7) % 7;
  return alter === -1 ? SOLFEGE_FLAT[i] : SOLFEGE[i];
}

/**
 * 複合級數 → 簡譜數字(1–7);高八度加上點(U+0307)、低八度加下點(U+0323),
 * 每高/低一個八度多一個點。
 */
export function degreeToJianpu(d: number, alter = 0): string {
  const num = String((((d - 1) % 7) + 7) % 7 + 1);
  const octave = Math.floor((d - 1) / 7);
  // ♭ 放數字前(簡譜慣例);八度點仍組合在數字上,不會跑到 ♭ 身上
  const flat = alter === -1 ? '♭' : '';
  if (octave > 0) return flat + num + '̇'.repeat(octave);
  if (octave < 0) return flat + num + '̣'.repeat(-octave);
  return flat + num;
}

import { describe, it, expect } from 'vitest';
import { midiToName } from './note-name.ts';

describe('midiToName', () => {
  it.each([
    [60, 'C4'],
    [69, 'A4'],
    [72, 'C5'],
    [61, 'C#4'],
    [59, 'B3'],
    [36, 'C2'],
    [84, 'C6'],
  ])('%i → %s', (midi, name) => {
    expect(midiToName(midi)).toBe(name);
  });
});

import { describe, it, expect } from 'vitest';
import { midiToName, degreeToSolfege, degreeToJianpu } from './note-name.ts';

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

describe('degreeToSolfege — 首調唱名(忽略八度)', () => {
  it.each([
    [1, 'Do'],
    [3, 'Mi'],
    [5, 'Sol'],
    [7, 'Ti'],
    [8, 'Do'], // 高八度第 1 級
    [12, 'Sol'], // 高八度第 5 級
    [0, 'Ti'], // 低八度第 7 級
    [-1, 'La'], // 低八度第 6 級
  ])('%i → %s', (d, s) => {
    expect(degreeToSolfege(d)).toBe(s);
  });
});

describe('degreeToJianpu — 簡譜數字 + 八度點', () => {
  it('基準八度 1–7 無點', () => {
    expect(degreeToJianpu(1)).toBe('1');
    expect(degreeToJianpu(7)).toBe('7');
  });
  it('高八度加上點(U+0307)', () => {
    expect(degreeToJianpu(8)).toBe('1̇');
    expect(degreeToJianpu(12)).toBe('5̇');
    expect(degreeToJianpu(15)).toBe('1̇̇'); // 高兩個八度
  });
  it('低八度加下點(U+0323)', () => {
    expect(degreeToJianpu(0)).toBe('7̣');
    expect(degreeToJianpu(-1)).toBe('6̣');
  });
});

describe('降音顯示(alter = -1)', () => {
  it('唱名用降音慣例:♭3 = Me、♭7 = Te', () => {
    expect(degreeToSolfege(3, -1)).toBe('Me');
    expect(degreeToSolfege(7, -1)).toBe('Te');
    expect(degreeToSolfege(3)).toBe('Mi'); // 預設不變
  });

  it('簡譜 ♭ 放數字前', () => {
    expect(degreeToJianpu(3, -1)).toBe('♭3');
    expect(degreeToJianpu(7, -1)).toBe('♭7');
  });

  it('高八度的降音:♭ 在前、八度點仍組合在數字上', () => {
    expect(degreeToJianpu(10, -1)).toBe('♭3\u0307');
  });
});

// 取樣器涵蓋範圍。獨立成無依賴模組,讓純邏輯層(range 檢查)
// 不必 import Tone.js(node 測試環境跑不了 Web Audio)。
export const SAMPLER_MIN_MIDI = 36; // C2
export const SAMPLER_MAX_MIDI = 84; // C6

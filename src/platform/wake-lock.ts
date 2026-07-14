// Session 進行中保持螢幕喚醒(SPEC 3.4.3)。Wake Lock 在切分頁 / 鎖屏
// (visibilitychange)後會失效,回到前景需重新 request(陷阱 #8)。

type Sentinel = { release: () => Promise<void>; addEventListener: (t: string, cb: () => void) => void };

let sentinel: Sentinel | null = null;
let want = false;
let acquiring = false; // 防止多個 active 狀態變化併發重複 request(否則 sentinel 洩漏)
let listenerBound = false;

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

async function acquire(): Promise<void> {
  if (!want || sentinel || acquiring || !supported()) return;
  acquiring = true;
  try {
    const s = (await navigator.wakeLock.request('screen')) as unknown as Sentinel;
    // await 期間若已不再需要(session 已停),立即釋放,不留洩漏
    if (!want) {
      void s.release().catch(() => {});
      return;
    }
    sentinel = s;
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // 使用者拒絕 / 不支援:靜默
  } finally {
    acquiring = false;
  }
}

function bindVisibilityListener(): void {
  if (listenerBound || typeof document === 'undefined') return;
  listenerBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && want && !sentinel) {
      void acquire();
    }
  });
}

export async function requestWakeLock(): Promise<void> {
  want = true;
  bindVisibilityListener();
  await acquire();
}

export async function releaseWakeLock(): Promise<void> {
  want = false;
  if (sentinel) {
    const s = sentinel;
    sentinel = null;
    try {
      await s.release();
    } catch {
      /* ignore */
    }
  }
}

/* 寿リハ 送迎サポート Service Worker
 * 方針:
 *  - index.html は「ネットワーク優先」→ GitHubで差し替えたら次回起動時に即反映
 *  - オフライン時のみキャッシュ版を表示(ツール自体は開ける)
 *  - フォント等の静的リソースはキャッシュ優先で高速化
 *  - 利用者CSVデータは一切キャッシュ・保存しない(端末メモリ内のみ)
 */
const CACHE_VERSION = 'sougei-v1';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// インストール:アプリ本体を事前キャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting(); // 新しいSWを即座に有効化
});

// 有効化:古いバージョンのキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // GETリクエスト以外・API呼び出し(地理院ジオコーディング等)はキャッシュ対象外
  if (req.method !== 'GET') return;
  if (url.hostname.includes('gsi.go.jp')) return;
  if (url.hostname.includes('google.com') || url.hostname.includes('maps.google.com')) return;

  // HTML(ページ本体)= ネットワーク優先 → 更新が即反映される
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // フォント・アイコン等 = キャッシュ優先(なければ取得してキャッシュ)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});

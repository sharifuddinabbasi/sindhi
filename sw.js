importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

const CACHE_NAME = "sindhi-world-book-v127";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.png",
  "./icon2.png"
];

firebase.initializeApp({
  apiKey: "AIzaSyDCBKKetL3qfC-pwMa9ytWCkfrEMq5yNCM",
  authDomain: "sindhi-world-book.firebaseapp.com",
  projectId: "sindhi-world-book",
  storageBucket: "sindhi-world-book.firebasestorage.app",
  messagingSenderId: "67009619087",
  appId: "1:67009619087:web:2a6578fa389835f9a8fcfa"
});

const messaging = firebase.messaging();

// Background push handler (runs even when app is completely closed)
async function isSignedOut() {
  try {
    const r = await caches.match(new URL("__swb_auth__", self.registration.scope).href, { cacheName: "swb-state" });
    return r ? (await r.text()) === "out" : false;
  } catch (e) { return false; }
}

messaging.onBackgroundMessage(async (payload) => {
  // Nobody is signed in on this phone: show nothing, no badge
  if (await isSignedOut()) {
    if ("clearAppBadge" in self.navigator) self.navigator.clearAppBadge().catch(() => {});
    return;
  }
  const data = payload.data || {};
  const notif = payload.notification || {};
  const title = data.senderName || notif.title || "Sindhi World Book";
  const body = data.messageText || notif.body || "New message received";

  if ("setAppBadge" in self.navigator) {
    self.navigator.setAppBadge(1).catch(() => {});
  }

  return self.registration.showNotification(title, {
    body: body,
    icon: "./icon.png",
    badge: "./icon2.png",
    vibrate: [200, 100, 200],
    tag: "sindhi-world-book-msg",
    renotify: true,
    requireInteraction: false,
    data: { url: "./index.html", msgId: data.msgId || "" }
  });
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== "swb-pending" && k !== "swb-state" && k !== POST_MEDIA && !k.startsWith("swb-media-")).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Post and profile photos: kept on the phone and shown from there
const POST_MEDIA = "swb-post-media";
const POST_MEDIA_LIMIT = 400;
const refreshed = new Set();

async function downloadPhoto(request, cache) {
  let res;
  try {
    // A readable copy uses far less storage than an "opaque" one
    res = await fetch(request.url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error("bad status");
  } catch (e) {
    res = await fetch(request);
  }
  if (res.ok || res.type === "opaque") {
    try {
      await cache.put(request.url, res.clone());
      const keys = await cache.keys();
      for (let i = 0; i < keys.length - POST_MEDIA_LIMIT; i++) await cache.delete(keys[i]);
    } catch (e) {}
  }
  return res;
}

async function photoFromPhone(event) {
  const cache = await caches.open(POST_MEDIA);
  const hit = await cache.match(event.request.url);
  if (hit && !(hit.type === "opaque" && event.request.mode === "cors")) {
    // An opaque copy cannot be verified: refresh it once in the background
    if (hit.type === "opaque" && !refreshed.has(event.request.url)) {
      refreshed.add(event.request.url);
      event.waitUntil(downloadPhoto(event.request, cache).catch(() => {}));
    }
    return hit;
  }
  return downloadPhoto(event.request, cache);
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const host = new URL(event.request.url).hostname;
  // Never intercept Firebase live data (messages, ticks, notifications) - let it go straight to the network
  if (
    (host.endsWith("googleapis.com") && host !== "fonts.googleapis.com") ||
    host.endsWith("firebaseio.com") ||
    host.endsWith("cloudfunctions.net")
  ) return;
  if (
    event.request.destination === "image" &&
    (host === "drive.google.com" || host.endsWith("googleusercontent.com"))
  ) {
    event.respondWith(photoFromPhone(event));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});

async function clearAllMsgNotificationsAndBadge() {
  if ("clearAppBadge" in self.navigator) {
    await self.navigator.clearAppBadge().catch(() => {});
  }
  const notifs = await self.registration.getNotifications();
  notifs.forEach((n) => n.close());
}

self.addEventListener("message", (event) => {
  if (!event.data) return;

  if (event.data.type === "NEW_MSG_BADGE") {
    const { count, sender, text } = event.data;
    if ("setAppBadge" in self.navigator) {
      self.navigator.setAppBadge(count).catch(() => {});
    }
    event.waitUntil(
      self.registration.showNotification(`${sender} (${count})`, {
        body: text,
        icon: "./icon.png",
        badge: "./icon2.png",
        vibrate: [200, 100, 200],
        tag: "sindhi-world-book-msg",
        renotify: true,
        data: { url: "./index.html" }
      })
    );
  } else if (event.data.type === "CLEAR_MSG_BADGE") {
    event.waitUntil(clearAllMsgNotificationsAndBadge());
  }
});

self.addEventListener("notificationclick", (event) => {
  const msgId = (event.notification.data && event.notification.data.msgId) || "";
  event.notification.close();
  // Remember which message was tapped, so the app can open that chat even if the URL/message is lost
  const savePending = caches
    .open("swb-pending")
    .then((c) =>
      c.put(
        new URL("__open_chat__", self.registration.scope).href,
        new Response(JSON.stringify({ msgId: msgId, t: Date.now() }))
      )
    )
    .catch(() => {});
  event.waitUntil(
    clearAllMsgNotificationsAndBadge().then(() => savePending).then(() =>
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            // App already open: tell it to open the chat of this message
            client.postMessage({ type: "OPEN_CHAT", msgId: msgId });
            return client.focus();
          }
        }
        // App closed: start it and let it open the chat
        const target = msgId ? "./index.html?openMsg=" + encodeURIComponent(msgId) : "./index.html";
        if (clients.openWindow) return clients.openWindow(target);
      })
    )
  );
});

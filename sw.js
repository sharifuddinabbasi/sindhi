importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

const CACHE_NAME = "sindhi-world-book-v31";
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
messaging.onBackgroundMessage((payload) => {
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
    data: { url: "./index.html" }
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
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
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
  event.notification.close();
  event.waitUntil(
    clearAllMsgNotificationsAndBadge().then(() =>
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow("./index.html");
      })
    )
  );
});

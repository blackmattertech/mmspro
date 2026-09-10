importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyBrdShKXgpMa5u26_6_ZBtTNHMnzQJrfwY",
  authDomain: "mmspro-c50aa.firebaseapp.com",
  projectId: "mmspro-c50aa",
  storageBucket: "mmspro-c50aa.firebasestorage.app",
  messagingSenderId: "1031010637250",
  appId: "1:1031010637250:web:cd72f68c15ccedfa6a725b"
});
const d = firebase.messaging();
function m(t) {
  var e, o, s, i, a, c, r;
  const n = {
    type: "mmspro-notification",
    title: ((e = t.notification) == null ? void 0 : e.title) || ((o = t.data) == null ? void 0 : o.title) || "MMS PRO",
    body: ((s = t.notification) == null ? void 0 : s.body) || ((i = t.data) == null ? void 0 : i.body) || "",
    url: ((a = t.data) == null ? void 0 : a.url) || "/",
    notificationType: ((c = t.data) == null ? void 0 : c.type) || "",
    sound: ((r = t.data) == null ? void 0 : r.sound) || "https://ik.imagekit.io/w2lf8dznx/notification"
  };
  return self.clients.matchAll({ type: "window", includeUncontrolled: !0 }).then((f) => {
    f.forEach((l) => l.postMessage(n));
  });
}
d.onBackgroundMessage((t) => {
  var s, i, a, c, r, f;
  const n = ((s = t.notification) == null ? void 0 : s.title) || ((i = t.data) == null ? void 0 : i.title) || "MMS PRO", e = ((a = t.notification) == null ? void 0 : a.body) || ((c = t.data) == null ? void 0 : c.body) || "", o = ((r = t.data) == null ? void 0 : r.url) || "/";
  return Promise.all([
    self.registration.showNotification(n, {
      body: e,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      silent: !1,
      sound: ((f = t.data) == null ? void 0 : f.sound) || "https://ik.imagekit.io/w2lf8dznx/notification",
      data: { ...t.data || {}, url: o }
    }),
    m(t)
  ]);
});
self.addEventListener("notificationclick", (t) => {
  var e;
  t.notification.close();
  const n = ((e = t.notification.data) == null ? void 0 : e.url) || "/";
  t.waitUntil((async () => {
    const o = n.startsWith("http") ? n : new URL(n, self.location.origin).href, s = await self.clients.matchAll({ type: "window", includeUncontrolled: !0 });
    for (const i of s)
      if (i.url.startsWith(self.location.origin) && "focus" in i)
        return i.postMessage({ type: "mmspro-notification-click", url: n }), i.focus();
    return self.clients.openWindow(o);
  })());
});

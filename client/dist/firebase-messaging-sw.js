importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "your_firebase_api_key",
  authDomain: "your_project.firebaseapp.com",
  projectId: "your_project_id",
  storageBucket: "your_project.appspot.com",
  messagingSenderId: "your_sender_id",
  appId: "your_app_id"
});
const s = firebase.messaging();
s.onBackgroundMessage((i) => {
  const { title: t, body: o, icon: a } = i.notification || {};
  self.registration.showNotification(t || "MMS PRO", {
    body: o || "",
    icon: a || "/favicon.svg",
    badge: "/favicon.svg",
    data: i.data
  });
});
self.addEventListener("notificationclick", (i) => {
  var o;
  i.notification.close();
  const t = ((o = i.notification.data) == null ? void 0 : o.url) || "/";
  i.waitUntil(clients.openWindow(t));
});

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
const e = firebase.messaging();
e.onBackgroundMessage((i) => {
  const { title: o, body: s, icon: t } = i.notification || {};
  self.registration.showNotification(o || "MMS PRO", {
    body: s || "",
    icon: t || "/Assets/images/logo.svg",
    badge: "/Assets/images/logo.svg",
    data: i.data
  });
});
self.addEventListener("notificationclick", (i) => {
  var s;
  i.notification.close();
  const o = ((s = i.notification.data) == null ? void 0 : s.url) || "/";
  i.waitUntil(clients.openWindow(o));
});

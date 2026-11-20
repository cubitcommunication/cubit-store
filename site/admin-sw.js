/*
 * PRIHIKA admin service worker. Its only job is to show system notifications (new orders and so on) that the server
 * pushes to this device, and to open the right admin page when one is tapped. It does not cache anything.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "PRIHIKA", body: event.data ? event.data.text() : "" };
  }
  // Every push must show a notification (browsers require it), even if an admin tab is open.
  event.waitUntil(
    self.registration.showNotification(data.title || "PRIHIKA", {
      body: data.body || "",
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: data.tag || data.id || "shop-admin",
      renotify: true,
      data: { url: data.url || "/admin/orders" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only pages of this website's admin can be opened from a notification.
  let target = "/admin/orders";
  try {
    const url = new URL((event.notification.data && event.notification.data.url) || target, self.location.origin);
    if (url.origin === self.location.origin && url.pathname.indexOf("/admin") === 0) target = url.pathname + url.search;
  } catch (e) {
    /* keep the default */
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.indexOf("/admin") !== -1 && "focus" in client) {
          if ("navigate" in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

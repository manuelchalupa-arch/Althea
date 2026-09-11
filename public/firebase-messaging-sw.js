/* Firebase Messaging SW (segundo plano).
 * La config pública la sirve Firebase Hosting en /__/firebase/init.json:
 * sin secretos en el repo. Solo tiene efecto desplegado en Firebase Hosting.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

fetch('/__/firebase/init.json')
  .then(function (r) { return r.json() })
  .then(function (cfg) {
    firebase.initializeApp(cfg)
    var messaging = firebase.messaging()
    messaging.onBackgroundMessage(function (payload) {
      var title = (payload.notification && payload.notification.title) || 'Althea'
      var body = (payload.notification && payload.notification.body) || ''
      self.registration.showNotification(title, {
        body: body,
        icon: '/icons/icon-192.png',
        data: payload.data || {},
      })
    })
  })
  .catch(function () { /* fuera de Firebase Hosting: sin push en background */ })

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i]
        if ('focus' in c) return c.focus()
      }
      if (clients.openWindow) return clients.openWindow('/')
    }),
  )
})

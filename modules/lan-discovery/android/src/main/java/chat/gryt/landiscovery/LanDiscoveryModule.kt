package chat.gryt.landiscovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.Inet4Address
import java.util.ArrayDeque
import java.util.concurrent.Executors

/**
 * Gryt servers on this network, on Android.
 *
 * The other half of `modules/lan-discovery`, whose iOS side browses with
 * `NWBrowser`. `requireOptionalNativeModule` returned null here, so Discovery
 * said "Not available on this device" and typing an address was the only way in.
 *
 * The server advertises `_gryt._tcp` with a `server_id` in its TXT record —
 * `packages/server/src/mdns.ts` — and the contract this fills is in `index.ts`:
 * a name, an IPv4 address, a port, and the id or null.
 *
 * ## Browsing finds a name and nothing else
 *
 * That is the difference from iOS, where `NWBrowser.bonjourWithTXTRecord` hands
 * over the TXT record with the result. On Android the address, the port and the
 * TXT record all need a second call, and **there are two of those, split at API
 * 34**:
 *
 * - **34 and up**: `registerServiceInfoCallback`. One per service, they run
 *   concurrently, and it keeps reporting while the service is up.
 * - **Below 34**: `resolveService`, one at a time — a second concurrent one
 *   fails with `FAILURE_ALREADY_ACTIVE` and takes the first one's callback with
 *   it — so that path queues.
 *
 * **Both paths exist because the old one does not work on new Android.** The
 * first version of this file used `resolveService` everywhere, reasoning that
 * one code path was cheaper than two and the deprecation was cosmetic. On an
 * API 36 emulator it found both servers on the network and then never called
 * back at all: no resolve, no failure, nothing. Deprecated there means it stops
 * delivering, not that it warns.
 */
class LanDiscoveryModule : Module() {
  private companion object {
    const val SERVICE_TYPE = "_gryt._tcp."
    /** What the server puts its id under. */
    const val TXT_SERVER_ID = "server_id"
  }

  private val nsd: NsdManager
    get() = requireNotNull(
      appContext.reactContext?.getSystemService(Context.NSD_SERVICE) as? NsdManager,
    ) { "No NsdManager: the module was used before the activity existed." }

  private var discovery: NsdManager.DiscoveryListener? = null

  /** Found and resolved, by service name — the key the iOS side dedupes on. */
  private val found = linkedMapOf<String, Map<String, Any?>>()

  /** API 34+: one live callback per service, so they can be unregistered. */
  private val watching = mutableMapOf<String, NsdManager.ServiceInfoCallback>()

  /** Below 34: names waiting their turn, and whether one is in flight. */
  private val pending = ArrayDeque<NsdServiceInfo>()
  private var resolving = false

  private val executor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("LanDiscovery")

    Events("onServersChanged", "onStateChange")

    Function("start") { start() }

    Function("stop") { stop() }

    /* A reload must not leave a browser running against a dead bridge. */
    OnDestroy { stop() }
  }

  private fun start() {
    if (discovery != null) return
    reset()

    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(serviceType: String?) {
        sendEvent("onStateChange", mapOf("state" to "browsing"))
      }

      override fun onServiceFound(service: NsdServiceInfo?) {
        if (service == null) return
        /* The trailing dot is present on the type this arrives with and absent
         * from the one we asked for, depending on the version. Compared without
         * it rather than trusting either spelling. */
        if (service.serviceType?.trim('.') != SERVICE_TYPE.trim('.')) return
        watch(service)
      }

      override fun onServiceLost(service: NsdServiceInfo?) {
        val name = service?.serviceName ?: return
        unwatch(name)
        if (found.remove(name) != null) publish()
      }

      override fun onDiscoveryStopped(serviceType: String?) {
        sendEvent("onStateChange", mapOf("state" to "stopped"))
      }

      override fun onStartDiscoveryFailed(serviceType: String?, errorCode: Int) {
        discovery = null
        sendEvent(
          "onStateChange",
          mapOf("state" to "failed", "message" to "Could not start looking (code $errorCode)."),
        )
      }

      override fun onStopDiscoveryFailed(serviceType: String?, errorCode: Int) {
        /* Nothing useful to say and nothing to do: the browser is going away
         * either way and the listener is already forgotten. */
        discovery = null
      }
    }

    discovery = listener
    nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
  }

  private fun stop() {
    val listener = discovery
    discovery = null
    if (listener != null) runCatching { nsd.stopServiceDiscovery(listener) }
    reset()
  }

  private fun reset() {
    for (name in watching.keys.toList()) unwatch(name)
    watching.clear()
    pending.clear()
    resolving = false
    found.clear()
  }

  private fun watch(service: NsdServiceInfo) {
    if (Build.VERSION.SDK_INT < 34) {
      pending.addLast(service)
      drain()
      return
    }

    val name = service.serviceName ?: return
    if (watching.containsKey(name)) return

    val callback = object : NsdManager.ServiceInfoCallback {
      override fun onServiceInfoCallbackRegistrationFailed(errorCode: Int) {
        watching.remove(name)
      }

      override fun onServiceUpdated(info: NsdServiceInfo) {
        record(info)
      }

      override fun onServiceLost() {
        if (found.remove(name) != null) publish()
      }

      override fun onServiceInfoCallbackUnregistered() {
        watching.remove(name)
      }
    }

    watching[name] = callback
    runCatching { nsd.registerServiceInfoCallback(service, executor, callback) }
      .onFailure { watching.remove(name) }
  }

  private fun unwatch(name: String) {
    if (Build.VERSION.SDK_INT < 34) return
    val callback = watching.remove(name) ?: return
    runCatching { nsd.unregisterServiceInfoCallback(callback) }
  }

  /** Below 34 only: one `resolveService` at a time, in order. */
  private fun drain() {
    if (resolving) return
    val next = pending.pollFirst() ?: return
    resolving = true

    @Suppress("DEPRECATION")
    nsd.resolveService(
      next,
      object : NsdManager.ResolveListener {
        override fun onServiceResolved(info: NsdServiceInfo?) {
          resolving = false
          if (info != null) record(info)
          drain()
        }

        override fun onResolveFailed(info: NsdServiceInfo?, errorCode: Int) {
          /* One server that would not answer. Dropped rather than reported:
           * discovery is a convenience on top of typing an address, and a
           * notice about a machine that briefly did not reply is noise about
           * something nobody asked for. */
          resolving = false
          drain()
        }
      },
    )
  }

  private fun record(info: NsdServiceInfo) {
    val name = info.serviceName ?: return
    val address = addressOf(info) ?: return

    found[name] = mapOf(
      "name" to name,
      "host" to address,
      "port" to info.port,
      "serverId" to serverId(info),
    )
    publish()
  }

  /**
   * The IPv4 address, which is what the contract promises and what the app
   * dials. A server answering on v4 and v6 is one server.
   */
  private fun addressOf(info: NsdServiceInfo): String? {
    if (Build.VERSION.SDK_INT >= 34) {
      return info.hostAddresses.filterIsInstance<Inet4Address>().firstOrNull()?.hostAddress
    }
    @Suppress("DEPRECATION")
    return (info.host as? Inet4Address)?.hostAddress
  }

  /**
   * The `server_id` from the TXT record, or null.
   *
   * Null rather than absent for a server too old to publish one — `index.ts` is
   * explicit that missing means "cannot tell", not "a different server". The
   * attribute map holds raw bytes, and a value can legitimately be null for a
   * key advertised with no value at all.
   */
  private fun serverId(info: NsdServiceInfo): String? {
    val raw = info.attributes?.get(TXT_SERVER_ID) ?: return null
    return raw.toString(Charsets.UTF_8).takeIf { it.isNotBlank() }
  }

  private fun publish() {
    sendEvent("onServersChanged", mapOf("servers" to found.values.toList()))
  }
}

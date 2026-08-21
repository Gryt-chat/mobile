import ExpoModulesCore
import Network

/**
 Gryt servers on the same network, found over mDNS.

 The server advertises itself as `_gryt._tcp` with a `server_id` in its TXT
 record — that is `packages/server/src/mdns.ts`, and it is either avahi writing
 a service file or `bonjour-service` depending on what the host has. Either way
 the shape on the wire is the same one the desktop client browses for, so this
 is the phone's version of `electron/lanDiscovery.ts`.

 React Native has no browser for this, and neither does Expo. `NWBrowser` is
 the platform's, it is the one Apple wants used on iOS 14 and later, and it
 hands over the TXT record without a second lookup.

 **Browsing finds a name, not an address.** A Bonjour result's endpoint is
 `.service(name:type:domain:)` and there is nothing in it to dial. The only
 supported way to turn one into a host and a port is to open a connection to
 it and read `currentPath.remoteEndpoint` once it is up, which is what
 `resolve` does. The connection is cancelled the moment the path is read — the
 server sees a TCP connect that closes immediately, on the port it already
 serves HTTP from.

 **IPv4 only, on purpose.** A resolved endpoint can come back as a link-local
 IPv6 address with a zone on it, `fe80::…%en0`, and that is not something that
 survives being pasted into a URL and handed to `fetch`. Forcing the protocol
 stack to v4 means an IPv6-only server is not found, which is a trade this can
 afford: everything Gryt runs on a LAN today has a v4 address.

 **Nothing here asks for permission and nothing here can.** iOS decides that
 the first time a browser runs, and a refusal arrives as the browser sitting in
 `.waiting` rather than as an error thrown at a caller — so the state is an
 event, and the JS side is written to say "not allowed" rather than to keep
 spinning.
 */
public final class LanDiscoveryModule: Module {
  /** The Bonjour service the server advertises. Must also be in `NSBonjourServices`. */
  private static let serviceType = "_gryt._tcp"

  private var browser: NWBrowser?

  /** Keyed by the mDNS instance name, which is unique on a network by definition. */
  private var found: [String: LanServer] = [:]

  /** Resolutions in flight, so a second pass over the same name does not start another. */
  private var resolving: [String: NWConnection] = [:]

  private let queue = DispatchQueue(label: "chat.gryt.lan-discovery")

  public func definition() -> ModuleDefinition {
    Name("LanDiscovery")

    Events("onServersChanged", "onStateChange")

    Function("start") {
      self.start()
    }

    Function("stop") {
      self.stop()
    }

    /* Stopping on the last listener rather than on every call to `stop`, so a
       screen that unmounts while another is still watching does not take the
       browser away from it. */
    OnStopObserving {
      self.stop()
    }

    OnDestroy {
      self.stop()
    }
  }

  // MARK: - Browsing

  private func start() {
    queue.async {
      guard self.browser == nil else { return }

      /* `bonjourWithTXTRecord`, not `bonjour`. The plain one reports a result
         with `.none` metadata and the server_id would need a second lookup to
         read — this hands it over with the result. */
      let descriptor = NWBrowser.Descriptor.bonjourWithTXTRecord(
        type: Self.serviceType,
        domain: nil
      )

      let browser = NWBrowser(for: descriptor, using: Self.parameters())

      browser.stateUpdateHandler = { [weak self] state in
        guard let self else { return }
        switch state {
        case .ready:
          self.sendEvent("onStateChange", ["state": "browsing"])
        case .waiting(let error):
          /* Where a refused local-network permission shows up. It is not a
             failure — the browser stays alive and starts working if the
             setting is turned back on — so it is reported as its own state
             rather than as an error. */
          self.sendEvent("onStateChange", [
            "state": "waiting",
            "message": "\(error)",
          ])
        case .failed(let error):
          self.sendEvent("onStateChange", [
            "state": "failed",
            "message": "\(error)",
          ])
          self.stop()
        case .cancelled:
          self.sendEvent("onStateChange", ["state": "stopped"])
        default:
          break
        }
      }

      browser.browseResultsChangedHandler = { [weak self] results, _ in
        self?.handle(results: results)
      }

      self.browser = browser
      browser.start(queue: self.queue)
    }
  }

  private func stop() {
    queue.async {
      self.browser?.cancel()
      self.browser = nil

      for connection in self.resolving.values {
        connection.cancel()
      }
      self.resolving.removeAll()
      self.found.removeAll()
    }
  }

  /**
   The whole current set, every time.

   `NWBrowser` also reports the changes, and using those would mean keeping a
   local model in step with the browser's — two answers to the same question.
   The set is a handful of entries on any real network, so this diffs against
   what is already known and only starts work for names it has not seen.
   */
  private func handle(results: Set<NWBrowser.Result>) {
    var live: Set<String> = []

    for result in results {
      guard case let .service(name, _, _, _) = result.endpoint else { continue }
      live.insert(name)

      let serverId = Self.serverId(from: result.metadata)

      if var existing = found[name] {
        // A TXT record can change under a name that is otherwise the same
        // service — a server restarted with a different instance id.
        if existing.serverId != serverId {
          existing.serverId = serverId
          found[name] = existing
          emit()
        }
        continue
      }

      guard resolving[name] == nil else { continue }
      resolve(name: name, endpoint: result.endpoint, serverId: serverId)
    }

    // Gone from the network: the server stopped, or its `discoverable` setting
    // was turned off, which withdraws the advertisement.
    let departed = Set(found.keys).subtracting(live)
    for name in departed { found.removeValue(forKey: name) }

    for (name, connection) in resolving where !live.contains(name) {
      connection.cancel()
      resolving.removeValue(forKey: name)
    }

    if !departed.isEmpty { emit() }
  }

  /**
   Turn a service name into something dialable.

   A connection is the supported way, and the only one that does not go behind
   `NWBrowser`'s back to `NSNetService`. It is cancelled as soon as the path is
   readable, so nothing is ever sent over it.
   */
  private func resolve(name: String, endpoint: NWEndpoint, serverId: String?) {
    let connection = NWConnection(to: endpoint, using: Self.parameters())
    resolving[name] = connection

    connection.stateUpdateHandler = { [weak self] state in
      guard let self else { return }

      switch state {
      case .ready:
        let remote = connection.currentPath?.remoteEndpoint
        connection.cancel()

        self.queue.async {
          self.resolving.removeValue(forKey: name)
          guard case let .hostPort(host, port) = remote else { return }
          guard let address = Self.address(of: host) else { return }

          self.found[name] = LanServer(
            name: name,
            host: address,
            port: Int(port.rawValue),
            serverId: serverId
          )
          self.emit()
        }

      case .failed, .cancelled:
        /* A server that advertises an address it does not listen on — which
           the dev servers do, by binding loopback while announcing their
           hostname — lands here. It is left out of the list rather than shown
           as something that cannot be joined. */
        connection.cancel()
        self.queue.async { self.resolving.removeValue(forKey: name) }

      default:
        break
      }
    }

    connection.start(queue: queue)
  }

  private func emit() {
    let servers = found.values
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
      .map { $0.payload }

    sendEvent("onServersChanged", ["servers": servers])
  }

  // MARK: - Bits

  /** IPv4, for the reason in the type doc. */
  private static func parameters() -> NWParameters {
    let parameters = NWParameters.tcp
    if let ip = parameters.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
      ip.version = .v4
    }
    return parameters
  }

  private static func serverId(from metadata: NWBrowser.Result.Metadata) -> String? {
    guard case let .bonjour(txt) = metadata else { return nil }
    if case let .string(value)? = txt.getEntry(for: "server_id") { return value }
    return nil
  }

  /**
   The printable address, without the interface zone.

   `NWEndpoint.Host.ipv4` still describes itself with a `%en0` suffix on some
   paths, and that is not a thing an address bar or `fetch` will take.
   */
  private static func address(of host: NWEndpoint.Host) -> String? {
    switch host {
    case .ipv4(let address):
      return "\(address)".split(separator: "%").first.map(String.init)
    case .ipv6(let address):
      return "\(address)".split(separator: "%").first.map(String.init)
    case .name(let name, _):
      return name
    @unknown default:
      return nil
    }
  }
}

private struct LanServer {
  let name: String
  let host: String
  let port: Int
  var serverId: String?

  var payload: [String: Any] {
    [
      "name": name,
      "host": host,
      "port": port,
      "serverId": serverId as Any,
    ]
  }
}

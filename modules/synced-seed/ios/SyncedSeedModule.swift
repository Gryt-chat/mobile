import ExpoModulesCore
import Security

/* The seed as a synchronizable keychain item (GRYT-1879): iCloud Keychain carries it, end to end
   encrypted, to the user's other Apple devices. Synchronizable items can't be ThisDeviceOnly. */
public class SyncedSeedModule: Module {
  private let service = "chat.gryt.identity"
  private let account = "seed"

  private func query() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrSynchronizable as String: kCFBooleanTrue as Any,
    ]
  }

  public func definition() -> ModuleDefinition {
    Name("SyncedSeed")

    AsyncFunction("read") { () -> String? in
      var q = query()
      q[kSecReturnData as String] = kCFBooleanTrue
      q[kSecMatchLimit as String] = kSecMatchLimitOne
      var item: CFTypeRef?
      guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
      return String(data: data, encoding: .utf8)
    }

    AsyncFunction("write") { (value: String) -> Bool in
      let data = Data(value.utf8)
      let attributes: [String: Any] = [
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
      ]
      let updated = SecItemUpdate(query() as CFDictionary, attributes as CFDictionary)
      if updated == errSecSuccess { return true }
      guard updated == errSecItemNotFound else { return false }
      var add = query()
      add.merge(attributes) { _, new in new }
      return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }
  }
}

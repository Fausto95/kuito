import Foundation
import LocalAuthentication
import Security

/// `SecureStore` in native/modules/secure-store/secure-store.ts:
/// generic-password items in the app's Keychain, one per service and key.
final class KuitoSecureStoreModule: SecureStoreSpec {
    init(context: KuitoModuleContext) {}

    // Reads and writes are callbacks for Android's biometric prompt. Here a
    // read that needs Face ID blocks the module's background queue until the
    // user answers, so both settle before they return.
    func getItem(_ request: SecureStoreRequest, _ promise: KuitoPromise<String?>) {
        do {
            let value = try Self.read(request)
            promise.resolve(value)
        } catch {
            promise.reject(error)
        }
    }

    func setItem(_ request: SecureStoreRequest, _ promise: KuitoPromise<Void>) {
        do {
            try Self.write(request)
            promise.resolve()
        } catch {
            promise.reject(error)
        }
    }

    func deleteItem(_ request: SecureStoreRequest) throws {
        try Self.delete(request)
    }

    private static func read(_ request: SecureStoreRequest) throws -> String? {
        var query = request.item

        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        if let prompt = request.prompt {
            let context = LAContext()

            context.localizedReason = prompt
            query[kSecUseAuthenticationContext] = context
        }

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound { return nil }
        try check(status, "read \(request.key)")

        guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            throw KuitoModuleError("ERR_KEYCHAIN", "SecureStore item \(request.key) is not a string")
        }

        return value
    }

    // Replaces the item rather than updating it, so a new accessibility or
    // access control applies; deleting needs no authentication.
    private static func write(_ request: SecureStoreRequest) throws {
        guard let value = request.value else { throw KuitoModuleError("ERR_ARGUMENT", "missing \"value\"") }

        var item = request.item

        item[kSecValueData] = Data(value.utf8)
        if request.requireAuthentication {
            var error: NSError?

            guard LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                throw KuitoModuleError(
                    "ERR_AUTH_UNAVAILABLE",
                    "requireAuthentication needs Face ID or Touch ID enrolled: \(error?.localizedDescription ?? "")")
            }

            var failure: Unmanaged<CFError>?

            guard let control = SecAccessControlCreateWithFlags(
                nil, request.accessible.attribute, .biometryCurrentSet, &failure)
            else {
                throw KuitoModuleError("ERR_KEYCHAIN", "\(failure?.takeRetainedValue().localizedDescription ?? "")")
            }

            item[kSecAttrAccessControl] = control
        } else {
            item[kSecAttrAccessible] = request.accessible.attribute
        }

        try delete(request)
        try check(SecItemAdd(item as CFDictionary, nil), "write \(request.key)")
    }

    private static func delete(_ request: SecureStoreRequest) throws {
        let status = SecItemDelete(request.item as CFDictionary)

        if status != errSecItemNotFound { try check(status, "delete \(request.key)") }
    }

    private static func check(_ status: OSStatus, _ what: String) throws {
        let code: String

        switch status {
        case errSecSuccess: return
        case errSecUserCanceled: code = "ERR_AUTH_CANCELED"
        case errSecAuthFailed: code = "ERR_AUTH_FAILED"
        case errSecInteractionNotAllowed: code = "ERR_UNAVAILABLE"
        default: code = "ERR_KEYCHAIN"
        }

        let message = SecCopyErrorMessageString(status, nil) as String? ?? "OSStatus \(status)"

        throw KuitoModuleError(code, "SecureStore could not \(what): \(message)")
    }
}

private extension SecureStoreRequest {
    var item: [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key]
    }
}

private extension KeychainAccessibility {
    var attribute: CFString {
        switch self {
        case .whenUnlocked: kSecAttrAccessibleWhenUnlocked
        case .afterFirstUnlock: kSecAttrAccessibleAfterFirstUnlock
        case .whenUnlockedThisDeviceOnly: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        case .afterFirstUnlockThisDeviceOnly: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        case .whenPasscodeSetThisDeviceOnly: kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly
        }
    }
}

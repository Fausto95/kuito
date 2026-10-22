import Foundation

/// `Storage` in native/modules/storage/storage.ts.
final class KuitoStorageModule: StorageSpec {
    init(context: KuitoModuleContext) {}

    func getString(_ key: String) throws -> String? {
        try KuitoStorageDatabase.shared().get([key])[0]
    }

    func getItem(_ key: String) throws -> String? {
        try KuitoStorageDatabase.shared().get([key])[0]
    }

    func setItem(_ key: String, _ value: String) throws {
        try KuitoStorageDatabase.shared().set([(key, value)])
    }

    func removeItem(_ key: String) throws {
        try KuitoStorageDatabase.shared().remove([key])
    }

    func getAllKeys() throws -> [String] {
        try KuitoStorageDatabase.shared().keys()
    }

    func multiGet(_ keys: [String]) throws -> [String?] {
        try KuitoStorageDatabase.shared().get(keys)
    }

    func multiSet(_ entries: [[String]]) throws {
        try KuitoStorageDatabase.shared().set(entries.map { entry in
            guard entry.count == 2 else {
                throw KuitoModuleError("ERR_ARGUMENT", "expected [key, value] pairs, got \(entry)")
            }

            return (entry[0], entry[1])
        })
    }

    func multiRemove(_ keys: [String]) throws {
        try KuitoStorageDatabase.shared().remove(keys)
    }

    func clear() throws {
        try KuitoStorageDatabase.shared().clear()
    }

    func select(_ sql: String, _ params: [Any]) throws -> SqlRows {
        try KuitoStorageDatabase.shared().select(sql, params.map(KuitoSQLValue.init))
    }

    func selectAsync(_ sql: String, _ params: [Any]) throws -> SqlRows {
        try select(sql, params)
    }

    func write(_ statements: [SqlStatement]) throws {
        try KuitoStorageDatabase.shared().write(statements)
    }
}

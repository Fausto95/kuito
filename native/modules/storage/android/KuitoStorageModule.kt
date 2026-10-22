package dev.kuito.runtime.modules.storage

import dev.kuito.link.SqlRows
import dev.kuito.link.SqlStatement
import dev.kuito.link.StorageSpec
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError

/** `Storage` in native/modules/storage/storage.ts. */
class KuitoStorageModule(private val context: KuitoModuleContext) : StorageSpec {
    private val database by lazy { KuitoStorageDatabase.shared(context.applicationContext) }

    override fun getString(key: String): String? = database.get(listOf(key))[0]

    override fun getItem(key: String): String? = database.get(listOf(key))[0]

    override fun setItem(key: String, value: String) = database.set(listOf(key to value))

    override fun removeItem(key: String) = database.remove(listOf(key))

    override fun getAllKeys(): List<String> = database.keys()

    override fun multiGet(keys: List<String>): List<String?> = database.get(keys)

    override fun multiSet(entries: List<List<String>>) = database.set(entries.map { entry ->
        if (entry.size != 2) throw KuitoModuleError("ERR_ARGUMENT", "expected [key, value] pairs, got $entry")
        entry[0] to entry[1]
    })

    override fun multiRemove(keys: List<String>) = database.remove(keys)

    override fun clear() = database.clear()

    override fun select(sql: String, params: List<Any?>): SqlRows = database.select(sql, params)

    override fun selectAsync(sql: String, params: List<Any?>): SqlRows = database.select(sql, params)

    override fun write(statements: List<SqlStatement>) = database.write(statements)
}

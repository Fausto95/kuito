package dev.kuito.runtime.modules.storage

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteCursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteDoneException
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteProgram
import dev.kuito.link.SqlRows
import dev.kuito.link.SqlStatement
import dev.kuito.runtime.modules.KuitoModuleError
import org.json.JSONArray
import org.json.JSONException
import java.io.FileNotFoundException

/**
 * The process's one connection pool to the Storage table, in the app's
 * databases directory. SQLiteDatabase is thread-safe, so the JS thread's
 * synchronous reads and the module's background thread share it; a runtime
 * reload reuses it.
 */
class KuitoStorageDatabase private constructor(private val context: Context) :
    SQLiteOpenHelper(context, "kuito-storage.db", null, 1) {

    @Volatile private var migrated = false

    init {
        // WAL with synchronous=NORMAL, Android's WAL default: a committed write
        // survives the app being killed; a power loss may drop the last
        // commits, never corrupt.
        setWriteAheadLoggingEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    // simpleQueryForString reads the value directly, not through a 2 MB
    // CursorWindow, so a large value reads back whole.
    fun get(keys: List<String>): List<String?> = storage("read $keys") {
        readableDatabase.compileStatement("SELECT value FROM storage WHERE key = ?").use { select ->
            keys.map { key ->
                select.bindString(1, key)
                try {
                    select.simpleQueryForString()
                } catch (_: SQLiteDoneException) {
                    null
                }
            }
        }
    }

    fun set(entries: List<Pair<String, String>>) = transaction("write ${entries.map { it.first }}") { db ->
        for ((key, value) in entries)
            db.insertWithOnConflict("storage", null, ContentValues().apply {
                put("key", key)
                put("value", value)
            }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun remove(keys: List<String>) = transaction("remove $keys") { db ->
        for (key in keys) db.delete("storage", "key = ?", arrayOf(key))
    }

    fun keys(): List<String> = storage("list the keys") {
        readableDatabase.rawQuery("SELECT key FROM storage", null).use { cursor ->
            List(cursor.count) { cursor.moveToNext(); cursor.getString(0) }
        }
    }

    fun clear() = transaction("clear") { db -> db.delete("storage", null, null) }

    /** A query's result: column names once, then each row's values in their order. */
    fun select(sql: String, params: List<Any?>): SqlRows = storage("run $sql") {
        migrate()
        readableDatabase.rawQueryWithFactory({ _, driver, table, query ->
            bind(query, params)
            SQLiteCursor(driver, table, query)
        }, sql, null, "").use { cursor ->
            val columns = cursor.columnNames.toList()
            val rows = List(cursor.count) {
                cursor.moveToNext()
                List(columns.size) { column -> value(cursor, column) }
            }

            SqlRows(columns = columns, rows = rows)
        }
    }

    /** One transaction: every statement lands, or none. */
    fun write(statements: List<SqlStatement>) {
        migrate()
        transaction("write") { db ->
            for (statement in statements)
                db.compileStatement(statement.sql).use { compiled ->
                    bind(compiled, statement.params)
                    compiled.execute()
                }
        }
    }

    /**
     * The migrations in kuito.config.ts, which the CLI writes into the
     * assets, applied once each, in order, before the app's first query.
     * `kuito_migrations` keeps each one's SQL, so an edited migration that
     * already ran fails instead of leaving devices with different schemas.
     */
    private fun migrate() {
        if (migrated) return

        synchronized(this) {
            if (migrated) return

            val declared = migrations()
            val db = writableDatabase

            db.execSQL("CREATE TABLE IF NOT EXISTS kuito_migrations (version INTEGER PRIMARY KEY NOT NULL, statements TEXT NOT NULL)")

            val applied = db.rawQuery("SELECT statements FROM kuito_migrations ORDER BY version", null).use { cursor ->
                List(cursor.count) { cursor.moveToNext(); cursor.getString(0) }
            }

            if (applied.size > declared.size)
                throw KuitoModuleError("ERR_STORAGE", "The database ran ${applied.size} migrations, but kuito.config.ts declares ${declared.size}. Migrations are append-only: restore the ones removed.")

            declared.forEachIndexed { version, statements ->
                val sql = statements.joinToString(";\n")

                if (version < applied.size) {
                    if (applied[version] != sql)
                        throw KuitoModuleError("ERR_STORAGE", "migrations[$version] in kuito.config.ts changed after it ran. Restore it, and append a new migration for the change.")
                    return@forEachIndexed
                }

                try {
                    transaction("record migrations[$version]") { tx ->
                        for (statement in statements) tx.execSQL(statement)
                        tx.execSQL("INSERT INTO kuito_migrations (version, statements) VALUES (?, ?)", arrayOf<Any>(version, sql))
                    }
                } catch (error: KuitoModuleError) {
                    throw KuitoModuleError("ERR_STORAGE", "migrations[$version] in kuito.config.ts failed: ${error.message}")
                }
            }

            migrated = true
        }
    }

    private fun migrations(): List<List<String>> {
        val text = try {
            context.assets.open("kuito-migrations.json").bufferedReader().use { it.readText() }
        } catch (_: FileNotFoundException) {
            return emptyList()
        }

        return try {
            val migrations = JSONArray(text)
            List(migrations.length()) { index ->
                val statements = migrations.getJSONArray(index)
                List(statements.length()) { statements.getString(it) }
            }
        } catch (error: JSONException) {
            throw KuitoModuleError("ERR_STORAGE", "Could not read the migrations in kuito-migrations.json: ${error.message}")
        }
    }

    // Typed binds: rawQuery's String[] would bind every number as text. A
    // whole number binds as an INTEGER: a JavaScript number has no integer type.
    private fun bind(program: SQLiteProgram, params: List<Any?>) {
        params.forEachIndexed { offset, value ->
            val index = offset + 1

            when (value) {
                null -> program.bindNull(index)
                is Int, is Long -> program.bindLong(index, (value as Number).toLong())
                is Number -> bind(program, index, value.toDouble())
                is String -> program.bindString(index, value)
                else -> throw KuitoModuleError("ERR_ARGUMENT", "expected a string, number or null to bind, got $value")
            }
        }
    }

    private fun bind(program: SQLiteProgram, index: Int, number: Double) {
        val whole = number.toLong()

        if (whole.toDouble() == number) program.bindLong(index, whole) else program.bindDouble(index, number)
    }

    private fun value(cursor: Cursor, column: Int): Any? = when (cursor.getType(column)) {
        Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(column)
        Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(column)
        Cursor.FIELD_TYPE_STRING -> cursor.getString(column)
        Cursor.FIELD_TYPE_NULL -> null
        else -> throw KuitoModuleError("ERR_STORAGE", "Column ${cursor.getColumnName(column)} holds a BLOB, which has no JSON form; store text or numbers.")
    }

    /** All of [body]'s writes land, or none do. */
    private fun transaction(what: String, body: (SQLiteDatabase) -> Unit) = storage(what) {
        val db = writableDatabase

        db.beginTransaction()
        try {
            body(db)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    private inline fun <T> storage(what: String, body: () -> T): T = try {
        body()
    } catch (error: SQLiteException) {
        throw KuitoModuleError("ERR_STORAGE", "Storage could not $what: ${error.message}")
    }

    companion object {
        @Volatile private var opened: KuitoStorageDatabase? = null

        fun shared(context: Context): KuitoStorageDatabase =
            opened ?: synchronized(this) {
                opened ?: KuitoStorageDatabase(context.applicationContext).also { opened = it }
            }
    }
}

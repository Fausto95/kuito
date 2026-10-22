package dev.kuito.runtime.modules.location

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import dev.kuito.link.LocationAccuracy
import dev.kuito.link.LocationUpdatesRequest
import dev.kuito.runtime.modules.KuitoModuleError
import org.json.JSONObject

/**
 * The location tasks (docs/location.md#background-updates): their options,
 * kept across launches in shared preferences, and the foreground service
 * that locates for them. Defining a task resumes its updates. Main thread only.
 */
object KuitoLocationTasks {
    /** `startLocationUpdates`' request, minus iOS's options, as shared preferences keep it. */
    class Options(
        val name: String,
        val accuracy: LocationAccuracy,
        val timeInterval: Long,
        val distanceInterval: Float,
        val notificationTitle: String?,
        val notificationBody: String?,
    ) {
        fun json(): String = JSONObject()
            .put("name", name).put("accuracy", accuracy.wire)
            .put("timeInterval", timeInterval).put("distanceInterval", distanceInterval.toDouble())
            .put("notificationTitle", notificationTitle ?: JSONObject.NULL)
            .put("notificationBody", notificationBody ?: JSONObject.NULL)
            .toString()

        companion object {
            fun of(request: LocationUpdatesRequest) = Options(
                name = request.name,
                accuracy = request.accuracy,
                timeInterval = request.timeInterval.toLong(),
                distanceInterval = request.distanceInterval.toFloat(),
                notificationTitle = request.notificationTitle,
                notificationBody = request.notificationBody,
            )

            fun of(request: JSONObject) = Options(
                name = request.getString("name"),
                accuracy = locationAccuracy(request.getString("accuracy")),
                timeInterval = request.getLong("timeInterval"),
                distanceInterval = request.getDouble("distanceInterval").toFloat(),
                notificationTitle = request.optString("notificationTitle").takeUnless { request.isNull("notificationTitle") },
                notificationBody = request.optString("notificationBody").takeUnless { request.isNull("notificationBody") },
            )
        }
    }

    private const val STORED = "dev.kuito.location.tasks"

    fun start(context: Context, options: Options) {
        if (!declared(context)) throw KuitoModuleError(
            "ERR_UNDECLARED",
            "Background location is not declared. Add permissions.locationAlways to kuito.config.ts and rebuild the app.")

        preferences(context).edit().putString(options.name, options.json()).apply()

        try {
            context.startForegroundService(service(context))
        } catch (error: IllegalStateException) {
            // Android 12 and later start a foreground service only from the foreground.
            preferences(context).edit().remove(options.name).apply()
            throw KuitoModuleError("ERR_UNAVAILABLE", "Android starts location updates only while the app is in the foreground")
        }
    }

    fun stop(context: Context, name: String) {
        preferences(context).edit().remove(name).apply()

        // The service follows the stored tasks; with none left, it stops itself.
        if (started(context).isEmpty()) context.stopService(service(context))
        else context.startService(service(context))
    }

    fun hasStarted(context: Context, name: String) = preferences(context).contains(name)

    /** Access was revoked: no task resumes. */
    fun forget(context: Context) = preferences(context).edit().clear().apply()

    /** Restarts the service for a stored task, when Android lets it start from here. */
    fun resume(context: Context, name: String) {
        if (!hasStarted(context, name) || KuitoLocationService.running) return

        try {
            context.startForegroundService(service(context))
        } catch (error: IllegalStateException) {
            Log.w("Kuito", "Location task '$name' resumes the next time the app is in the foreground: ${error.message}")
        }
    }

    /** Every stored task, by name. */
    fun started(context: Context): Map<String, Options> =
        preferences(context).all.mapNotNull { (name, value) ->
            (value as? String)?.let { name to Options.of(JSONObject(it)) }
        }.toMap()

    private fun service(context: Context) = Intent(context, KuitoLocationService::class.java)

    /** The service is in the manifest only when kuito.config.ts declares locationAlways. */
    private fun declared(context: Context) = try {
        context.packageManager.getServiceInfo(ComponentName(context, KuitoLocationService::class.java), 0)
        true
    } catch (error: PackageManager.NameNotFoundException) {
        false
    }

    private fun preferences(context: Context) = context.getSharedPreferences(STORED, Context.MODE_PRIVATE)
}

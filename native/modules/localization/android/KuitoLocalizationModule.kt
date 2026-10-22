package dev.kuito.runtime.modules.localization

import android.content.BroadcastReceiver
import android.content.ComponentCallbacks
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.LocaleList
import android.text.TextUtils
import android.text.format.DateFormat
import android.view.View
import androidx.core.content.ContextCompat
import dev.kuito.link.CalendarInfo
import dev.kuito.link.LocaleInfo
import dev.kuito.link.LocalizationSpec
import dev.kuito.link.MeasurementSystem
import dev.kuito.link.TemperatureUnit
import dev.kuito.link.TextDirection
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.modules.KuitoModuleContext
import java.text.DecimalFormatSymbols
import java.util.Calendar
import java.util.Currency
import java.util.Locale
import java.util.TimeZone

/**
 * `Localization` in native/modules/localization/localization.ts. The
 * manifest handles `locale`, so a language change reaches a running app as a
 * configuration change; time zone and 24-hour changes arrive as broadcasts.
 */
class KuitoLocalizationModule(private val context: KuitoModuleContext) : LocalizationSpec {
    private companion object {
        /** Regions that don't measure in metric; CLDR's measurementSystem data. */
        val measurementSystems = mapOf("US" to MeasurementSystem.US, "LR" to MeasurementSystem.US, "MM" to MeasurementSystem.US, "GB" to MeasurementSystem.UK)

        /** Regions that give temperatures in Fahrenheit; CLDR's temperature preferences. */
        val fahrenheit = setOf("US", "BS", "BZ", "KY", "PR", "PW", "LR", "FM", "MH")

        /** CLDR names, which iOS and expo-localization use, for ICU's calendar types. */
        val calendarNames = mapOf("gregorian" to "gregory", "ethiopic-amete-alem" to "ethioaa")
    }

    /** What each live value observes with, by name; UI thread only. */
    private val observers = mutableMapOf<String, Observer<*>>()

    override fun locales(): List<LocaleInfo> {
        val list = LocaleList.getDefault()

        return (0 until list.size()).map { locale(list[it]) }
    }

    override fun calendars(): List<CalendarInfo> {
        val type = android.icu.util.Calendar.getInstance().type

        return listOf(
            CalendarInfo(
                calendar = calendarNames[type] ?: type,
                timeZone = TimeZone.getDefault().id,
                uses24hourClock = DateFormat.is24HourFormat(context.activity),
                firstWeekday = Calendar.getInstance().firstDayOfWeek.toDouble(),
            ),
        )
    }

    override fun startLocales(signal: KuitoSignal<List<LocaleInfo>>) = observe("locales", ::locales, signal::set)

    override fun stopLocales() = stop("locales")

    override fun startCalendars(signal: KuitoSignal<List<CalendarInfo>>) = observe("calendars", ::calendars, signal::set)

    override fun stopCalendars() = stop("calendars")

    private fun <T> observe(key: String, read: () -> T, send: (T) -> Unit) {
        observers[key] = Observer(read, send).also { it.start() }
    }

    private fun stop(key: String) {
        observers.remove(key)?.stop()
    }

    private fun locale(locale: Locale): LocaleInfo {
        val region = locale.country.ifEmpty { null }
        val symbols = DecimalFormatSymbols.getInstance(locale)
        // A locale without a region has no currency.
        val currency = region?.let { runCatching { Currency.getInstance(locale) }.getOrNull() }

        return LocaleInfo(
            languageTag = locale.toLanguageTag(),
            languageCode = locale.language.ifEmpty { null },
            languageScriptCode = locale.script.ifEmpty { null },
            regionCode = region,
            textDirection = if (TextUtils.getLayoutDirectionFromLocale(locale) == View.LAYOUT_DIRECTION_RTL) TextDirection.RTL else TextDirection.LTR,
            decimalSeparator = symbols.decimalSeparator.toString(),
            digitGroupingSeparator = symbols.groupingSeparator.toString(),
            measurementSystem = region?.let { measurementSystems[it] ?: MeasurementSystem.METRIC },
            currencyCode = currency?.currencyCode,
            currencySymbol = currency?.getSymbol(locale),
            temperatureUnit = region?.let { if (it in fahrenheit) TemperatureUnit.FAHRENHEIT else TemperatureUnit.CELSIUS },
        )
    }

    /** A change can arrive as both a configuration change and a broadcast; it is sent once. */
    private inner class Observer<T>(private val read: () -> T, private val send: (T) -> Unit) {
        private var last: T? = null
        private val callbacks = object : ComponentCallbacks {
            override fun onConfigurationChanged(configuration: Configuration) = changed()

            @Deprecated("Superseded by onTrimMemory; nothing to release here.")
            override fun onLowMemory() {}
        }
        private val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) = changed()
        }

        fun start() {
            last = read()
            context.activity.registerComponentCallbacks(callbacks)
            ContextCompat.registerReceiver(
                context.activity,
                receiver,
                IntentFilter().apply {
                    addAction(Intent.ACTION_LOCALE_CHANGED)
                    addAction(Intent.ACTION_TIMEZONE_CHANGED)
                    addAction(Intent.ACTION_TIME_CHANGED)
                },
                // System broadcasts still arrive.
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
        }

        fun stop() {
            context.activity.unregisterComponentCallbacks(callbacks)
            context.activity.unregisterReceiver(receiver)
        }

        // Records are data classes, so equal snapshots compare equal.
        private fun changed() {
            val next = read()

            if (next == last) return

            last = next
            send(next)
        }
    }
}

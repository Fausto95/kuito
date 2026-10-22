package dev.kuito.runtime.modules.intl

import android.icu.text.DisplayContext
import android.icu.text.ListFormatter
import android.icu.text.LocaleDisplayNames
import android.icu.text.RelativeDateTimeFormatter
import android.icu.util.Currency
import android.icu.util.ULocale
import android.os.Build
import dev.kuito.link.DisplayNameStyle
import dev.kuito.link.DisplayNameType
import dev.kuito.link.IntlFormatsSpec
import dev.kuito.link.LanguageDisplay
import dev.kuito.link.ListStyle
import dev.kuito.link.ListType
import dev.kuito.link.RelativeTimeNumeric
import dev.kuito.link.RelativeTimeStyle
import dev.kuito.link.RelativeTimeUnit
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import kotlin.math.abs

/**
 * `IntlFormats` in native/modules/intl/intl.ts: android.icu's locale data
 * behind Intl.RelativeTimeFormat, ListFormat and DisplayNames. The newer
 * ICU classes are named only behind their API level, so older devices never
 * load them.
 */
class KuitoIntlFormatsModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : IntlFormatsSpec {
    override fun relativeTime(
        locale: String,
        style: RelativeTimeStyle,
        numeric: RelativeTimeNumeric,
        value: Double,
        unit: RelativeTimeUnit,
    ): String {
        val formatter = RelativeDateTimeFormatter.getInstance(
            ULocale.forLanguageTag(locale),
            null,
            relativeStyles.getValue(style),
            DisplayContext.CAPITALIZATION_NONE,
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val icuUnit = relativeUnit(unit)

            return if (numeric == RelativeTimeNumeric.AUTO) formatter.format(value, icuUnit) else formatter.formatNumeric(value, icuUnit)
        }

        // Android 8 (API 26, 27) formats numerically only, and has no quarter: three months.
        val (legacy, scale) = legacyUnits.getValue(unit)
        val direction = if (value < 0 || 1 / value < 0) RelativeDateTimeFormatter.Direction.LAST else RelativeDateTimeFormatter.Direction.NEXT

        return formatter.format(abs(value) * scale, direction, legacy)
    }

    override fun list(locale: String, type: ListType, style: ListStyle, items: List<String>): String {
        val uLocale = ULocale.forLanguageTag(locale)
        val formatter = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> ListFormatter.getInstance(uLocale, listType(type), listWidth(style))
            type == ListType.CONJUNCTION -> ListFormatter.getInstance(uLocale)
            else -> throw KuitoModuleError(
                "ERR_UNSUPPORTED",
                "Android joins with \"or\" and as units from Android 13 (API 33); type \"${type.wire}\" has no formatter here",
            )
        }

        return formatter.format(items)
    }

    override fun displayName(
        locale: String,
        type: DisplayNameType,
        style: DisplayNameStyle,
        languageDisplay: LanguageDisplay,
        code: String,
    ): String? {
        val uLocale = ULocale.forLanguageTag(locale)
        val names = LocaleDisplayNames.getInstance(
            uLocale,
            if (languageDisplay == LanguageDisplay.DIALECT) DisplayContext.DIALECT_NAMES else DisplayContext.STANDARD_NAMES,
            if (style == DisplayNameStyle.LONG) DisplayContext.LENGTH_FULL else DisplayContext.LENGTH_SHORT,
        )
        val name = when (type) {
            DisplayNameType.LANGUAGE -> names.localeDisplayName(ULocale.forLanguageTag(code))
            DisplayNameType.REGION -> names.regionDisplayName(code)
            DisplayNameType.SCRIPT -> names.scriptDisplayName(code)
            DisplayNameType.CALENDAR -> names.keyValueDisplayName("calendar", ULocale.toLegacyType("calendar", code) ?: code)
            DisplayNameType.CURRENCY -> currency(code)?.let { if (style == DisplayNameStyle.LONG) it.getDisplayName(uLocale.toLocale()) else it.getSymbol(uLocale) }
        }

        // ICU answers a code it has no name for with the code itself.
        return name?.takeUnless { it.isEmpty() || it.equals(code, ignoreCase = true) || it == code.replace('-', '_') }
    }

    private fun currency(code: String): Currency? =
        try {
            Currency.getInstance(code)
        } catch (_: IllegalArgumentException) {
            null
        }

    private companion object {
        val relativeStyles = mapOf(
            RelativeTimeStyle.LONG to RelativeDateTimeFormatter.Style.LONG,
            RelativeTimeStyle.SHORT to RelativeDateTimeFormatter.Style.SHORT,
            RelativeTimeStyle.NARROW to RelativeDateTimeFormatter.Style.NARROW,
        )

        val legacyUnits = mapOf(
            RelativeTimeUnit.YEAR to (RelativeDateTimeFormatter.RelativeUnit.YEARS to 1.0),
            RelativeTimeUnit.QUARTER to (RelativeDateTimeFormatter.RelativeUnit.MONTHS to 3.0),
            RelativeTimeUnit.MONTH to (RelativeDateTimeFormatter.RelativeUnit.MONTHS to 1.0),
            RelativeTimeUnit.WEEK to (RelativeDateTimeFormatter.RelativeUnit.WEEKS to 1.0),
            RelativeTimeUnit.DAY to (RelativeDateTimeFormatter.RelativeUnit.DAYS to 1.0),
            RelativeTimeUnit.HOUR to (RelativeDateTimeFormatter.RelativeUnit.HOURS to 1.0),
            RelativeTimeUnit.MINUTE to (RelativeDateTimeFormatter.RelativeUnit.MINUTES to 1.0),
            RelativeTimeUnit.SECOND to (RelativeDateTimeFormatter.RelativeUnit.SECONDS to 1.0),
        )

        @androidx.annotation.RequiresApi(Build.VERSION_CODES.P)
        fun relativeUnit(unit: RelativeTimeUnit) = when (unit) {
            RelativeTimeUnit.YEAR -> RelativeDateTimeFormatter.RelativeDateTimeUnit.YEAR
            RelativeTimeUnit.QUARTER -> RelativeDateTimeFormatter.RelativeDateTimeUnit.QUARTER
            RelativeTimeUnit.MONTH -> RelativeDateTimeFormatter.RelativeDateTimeUnit.MONTH
            RelativeTimeUnit.WEEK -> RelativeDateTimeFormatter.RelativeDateTimeUnit.WEEK
            RelativeTimeUnit.DAY -> RelativeDateTimeFormatter.RelativeDateTimeUnit.DAY
            RelativeTimeUnit.HOUR -> RelativeDateTimeFormatter.RelativeDateTimeUnit.HOUR
            RelativeTimeUnit.MINUTE -> RelativeDateTimeFormatter.RelativeDateTimeUnit.MINUTE
            RelativeTimeUnit.SECOND -> RelativeDateTimeFormatter.RelativeDateTimeUnit.SECOND
        }

        @androidx.annotation.RequiresApi(Build.VERSION_CODES.TIRAMISU)
        fun listType(type: ListType) = when (type) {
            ListType.CONJUNCTION -> ListFormatter.Type.AND
            ListType.DISJUNCTION -> ListFormatter.Type.OR
            ListType.UNIT -> ListFormatter.Type.UNITS
        }

        @androidx.annotation.RequiresApi(Build.VERSION_CODES.TIRAMISU)
        fun listWidth(style: ListStyle) = when (style) {
            ListStyle.LONG -> ListFormatter.Width.WIDE
            ListStyle.SHORT -> ListFormatter.Width.SHORT
            ListStyle.NARROW -> ListFormatter.Width.NARROW
        }
    }
}

package dev.kuito.runtime.renderer.styling

import android.icu.text.BreakIterator
import android.text.Layout
import android.text.TextPaint
import android.widget.TextView
import java.util.Locale
import kotlin.math.ceil

/**
 * A text's min-content width: its widest run between two places a line may
 * break. A shrinking row asks for it several times a pass, and it stays the
 * same until the text or its font changes, so it is measured once and kept.
 * The layout node forgets it whenever it is marked dirty, which every text,
 * typography and font scale change, and typing, does.
 */
internal class KuitoMinContent {
    private var width = UNMEASURED

    /** How many times the width was measured rather than reused. */
    var measurements = 0
        private set

    /** In pixels; null for text without a run, which has no narrower form. */
    fun width(view: TextView): Int? {
        if (width == UNMEASURED) {
            measurements++
            width = widest(view.text, view.paint) ?: NONE
        }

        return width.takeIf { it != NONE }
    }

    fun forget() {
        width = UNMEASURED
    }

    companion object {
        private const val UNMEASURED = -1
        private const val NONE = -2

        // Runs are only measured on the main thread, so one iterator serves
        // every text. Its rules follow the default language: a new one replaces it.
        private var locale = Locale.getDefault()
        private var lines = BreakIterator.getLineInstance(locale)

        /**
         * The widest run, without its trailing whitespace, measured in place.
         * A run ends where the line breaker may wrap: punctuation stays with
         * its word, a hyphen ends one, and each CJK ideograph is a run of its
         * own, as TextView wraps them.
         */
        fun widest(text: CharSequence, paint: TextPaint): Int? {
            if (Locale.getDefault() != locale) {
                locale = Locale.getDefault()
                lines = BreakIterator.getLineInstance(locale)
            }

            lines.setText(text.toString())

            var widest = 0f
            var start = lines.first()
            var end = lines.next()

            while (end != BreakIterator.DONE) {
                var last = end

                while (last > start && Character.isWhitespace(text[last - 1])) last--
                if (last > start) widest = maxOf(widest, Layout.getDesiredWidth(text, start, last, paint))
                start = end
                end = lines.next()
            }

            return if (widest > 0f) ceil(widest).toInt() else null
        }
    }
}

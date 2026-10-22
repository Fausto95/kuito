package dev.kuito.runtime.renderer.keyboard

import android.icu.text.BreakIterator
import android.text.InputFilter
import android.text.Spanned

/**
 * HTML's `maxlength` for what the user enters: an edit that would pass the
 * limit keeps the whole characters that fit, counted in UTF-16 units as HTML
 * counts them. Unlike InputFilter.LengthFilter it leaves the app's own text
 * whole, and never splits an emoji or a flag.
 */
internal class KuitoMaxLength(private val field: KuitoEditText) : InputFilter {
    override fun filter(source: CharSequence, start: Int, end: Int, dest: Spanned, dstart: Int, dend: Int): CharSequence? {
        val limit = field.maxLength ?: return null

        // Deleting is always allowed, even from app text past the limit.
        if (field.settingText || start == end) return null

        val room = limit - (dest.length - (dend - dstart))

        if (end - start <= room) return null

        return source.subSequence(start, start + fitting(source.subSequence(start, end), room))
    }

    /** The length of the longest run of whole characters from the start of `text` within `room` units. */
    private fun fitting(text: CharSequence, room: Int): Int {
        val breaks = BreakIterator.getCharacterInstance().apply { setText(text.toString()) }
        var fit = 0
        var next = breaks.next()

        while (next != BreakIterator.DONE && next <= room) {
            fit = next
            next = breaks.next()
        }

        return fit
    }
}

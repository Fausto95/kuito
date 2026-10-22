package dev.kuito.runtime.renderer.keyboard

import android.text.InputType
import android.view.View

/**
 * A field's HTML input attributes, and the input type they make together:
 * the keyboard comes from `inputMode` or else `type`, and capitalization and
 * suggestions follow the type unless the app sets them.
 */
internal data class KuitoInputTraits(
    val type: String = "text",
    val mode: String? = null,
    val capitalize: String? = null,
    val spellCheck: Boolean? = null,
    val autoComplete: String? = null,
    /** A field with `lines`: its text wraps. */
    val multiline: Boolean = false,
) {
    /** EditText's inputType: one class, its variation, and the text flags. */
    val inputType: Int
        get() {
            val keyboard = mode?.let(MODES::get) ?: TYPES.getValue(type)
            val inputClass = keyboard and InputType.TYPE_MASK_CLASS
            val prose = type in PROSE
            val secure = when {
                type != "password" -> keyboard
                inputClass == InputType.TYPE_CLASS_TEXT -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                inputClass == InputType.TYPE_CLASS_NUMBER -> keyboard or InputType.TYPE_NUMBER_VARIATION_PASSWORD
                else -> keyboard
            }

            if (inputClass != InputType.TYPE_CLASS_TEXT) return secure

            val capitals = capitalize?.let(CAPITALIZATIONS::getValue) ?: if (prose) InputType.TYPE_TEXT_FLAG_CAP_SENTENCES else 0
            val suggestions = when (spellCheck ?: if (prose) null else false) {
                true -> InputType.TYPE_TEXT_FLAG_AUTO_CORRECT
                false -> InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                null -> 0
            }

            val wraps = if (multiline) InputType.TYPE_TEXT_FLAG_MULTI_LINE else 0

            return secure or capitals or suggestions or wraps
        }

    /** Autofill's hint for the field's content, or null for none. */
    val autofillHint: String? get() = autoComplete?.let(HINTS::get)

    val importantForAutofill: Int
        get() = if (autoComplete == "off") View.IMPORTANT_FOR_AUTOFILL_NO else View.IMPORTANT_FOR_AUTOFILL_AUTO

    /** `none` shows no keyboard at all. */
    val showsKeyboard: Boolean get() = mode != "none"

    companion object {
        val TYPES = mapOf(
            "text" to InputType.TYPE_CLASS_TEXT,
            "password" to InputType.TYPE_CLASS_TEXT,
            "email" to (InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS),
            "number" to (InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED),
            "tel" to InputType.TYPE_CLASS_PHONE,
            "url" to (InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI),
            "search" to InputType.TYPE_CLASS_TEXT,
        )

        /** `none` maps to null: the type's keyboard stays, and none shows. */
        val MODES = mapOf(
            "none" to null,
            "text" to InputType.TYPE_CLASS_TEXT,
            "decimal" to (InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL),
            "numeric" to InputType.TYPE_CLASS_NUMBER,
            "tel" to InputType.TYPE_CLASS_PHONE,
            "search" to InputType.TYPE_CLASS_TEXT,
            "email" to (InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS),
            "url" to (InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI),
        )

        val CAPITALIZATIONS = mapOf(
            "none" to 0,
            "sentences" to InputType.TYPE_TEXT_FLAG_CAP_SENTENCES,
            "words" to InputType.TYPE_TEXT_FLAG_CAP_WORDS,
            "characters" to InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS,
        )

        /**
         * View's autofill hints, and androidx's HintConstants for the ones
         * View lacks (`newPassword`, `smsOTPCode`). `off` has none: it opts
         * the field out of autofill instead.
         */
        val HINTS = mapOf(
            "off" to null,
            "username" to View.AUTOFILL_HINT_USERNAME,
            "current-password" to View.AUTOFILL_HINT_PASSWORD,
            "new-password" to "newPassword",
            "one-time-code" to "smsOTPCode",
            "email" to View.AUTOFILL_HINT_EMAIL_ADDRESS,
            "name" to View.AUTOFILL_HINT_NAME,
            "given-name" to "personGivenName",
            "family-name" to "personFamilyName",
            "tel" to View.AUTOFILL_HINT_PHONE,
            "street-address" to View.AUTOFILL_HINT_POSTAL_ADDRESS,
            "postal-code" to View.AUTOFILL_HINT_POSTAL_CODE,
            "country-name" to "addressCountry",
            "cc-number" to View.AUTOFILL_HINT_CREDIT_CARD_NUMBER,
        )

        /** The types and keyboards a field with `lines` takes: text ones, which can enter a new line. */
        val MULTILINE_TYPES = setOf("text", "email", "url", "search")
        val MULTILINE_MODES = setOf("none", "text", "search", "email", "url")

        /** Types whose text is prose: capitalized and spell-checked unless the app says otherwise. */
        private val PROSE = setOf("text", "search")
    }
}

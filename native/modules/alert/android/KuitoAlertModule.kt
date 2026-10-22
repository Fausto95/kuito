package dev.kuito.runtime.modules.alert

import android.app.Dialog
import android.content.DialogInterface
import android.graphics.Color
import android.text.InputType
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.LinearLayout
import android.widget.ScrollView
import com.google.android.material.color.MaterialColors
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import dev.kuito.link.AlertAnswer
import dev.kuito.link.AlertButtonStyle
import dev.kuito.link.AlertInputMode
import dev.kuito.link.AlertPrompt
import dev.kuito.link.AlertPromptType
import dev.kuito.link.AlertRequest
import dev.kuito.link.AlertSpec
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.renderer.views.materialThemed

/**
 * `Alert` in native/modules/alert/alert.ts: a Material dialog, with text
 * fields for a prompt. Its buttons take React Native's places: the last is positive, the
 * one before negative, a third neutral. A reload closes the dialogs still open.
 */
class KuitoAlertModule(private val context: KuitoModuleContext) : AlertSpec {
    // UI thread only.
    private val open = mutableSetOf<Dialog>()

    override fun alert(request: AlertRequest, promise: KuitoPromise<AlertAnswer>) {
        val buttons = request.buttons

        if (buttons.size > SLOTS.size)
            throw KuitoModuleError("ERR_ARGUMENT", "An Android alert shows at most ${SLOTS.size} buttons, got ${buttons.size}")

        val themed = context.activity.materialThemed()
        val fields = request.prompt?.let { prompt -> Fields(themed, prompt) }
        var picked: Int? = null
        val builder = MaterialAlertDialogBuilder(themed)
            .setTitle(request.title)
            .setCancelable(request.cancelable)

        request.message?.let(builder::setMessage)
        // Scrolls, so the keyboard on a short screen shrinks the fields, not the buttons.
        fields?.let { builder.setView(ScrollView(themed).apply { addView(it.layout) }) }

        // The last button is positive, then negative, then neutral.
        val slots = SLOTS.take(buttons.size).reversed()

        buttons.forEachIndexed { index, button ->
            val listener = DialogInterface.OnClickListener { _, _ -> picked = index }

            when (slots[index]) {
                DialogInterface.BUTTON_POSITIVE -> builder.setPositiveButton(button.text, listener)
                DialogInterface.BUTTON_NEGATIVE -> builder.setNegativeButton(button.text, listener)
                else -> builder.setNeutralButton(button.text, listener)
            }
        }

        val dialog = builder.create()

        // One answer, whichever way the dialog closes: a button, Back, or a tap outside.
        dialog.setOnDismissListener {
            open.remove(dialog)
            promise.resolve(
                AlertAnswer(
                    index = picked?.toDouble(),
                    text = fields?.login?.text?.toString(),
                    password = fields?.password?.text?.toString(),
                ),
            )
        }
        open.add(dialog)

        if (fields != null) dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)

        dialog.show()
        fields?.login?.requestFocus()
        // Done on the last field presses the last button, which a short screen's keyboard may cover.
        (fields?.password ?: fields?.login)?.apply {
            imeOptions = EditorInfo.IME_ACTION_DONE
            setOnEditorActionListener { _, action, _ ->
                (action == EditorInfo.IME_ACTION_DONE).also { done ->
                    if (done) dialog.getButton(slots.last())?.performClick()
                }
            }
        }

        buttons.forEachIndexed { index, button ->
            if (button.style == AlertButtonStyle.DESTRUCTIVE)
                dialog.getButton(slots[index])?.setTextColor(
                    MaterialColors.getColor(themed, com.google.android.material.R.attr.colorError, Color.RED),
                )
        }
    }

    override fun destroy() {
        open.toList().forEach(Dialog::dismiss)
        open.clear()
    }

    /** A prompt's text fields: one, or a username and a password. */
    private class Fields(themed: android.content.Context, prompt: AlertPrompt) {
        private val type = prompt.type
        val layout = LinearLayout(themed).apply { orientation = LinearLayout.VERTICAL }
        val login: TextInputEditText?
        val password: TextInputEditText?

        init {
            val density = themed.resources.displayMetrics.density
            val inset = (24 * density).toInt()

            layout.setPadding(inset, (8 * density).toInt(), inset, 0)

            val first = field(themed, if (type == AlertPromptType.LOGIN) "Username" else null)
            val keyboard = KEYBOARDS.getValue(prompt.inputMode)

            first.setText(prompt.value)
            first.inputType = if (type == AlertPromptType.PASSWORD) secure(keyboard) else keyboard
            login = first
            password = if (type == AlertPromptType.LOGIN) field(themed, "Password").apply { inputType = SECURE } else null

            // A login's fields name what they hold, so autofill offers the saved account.
            if (type == AlertPromptType.LOGIN) {
                first.setAutofillHints(View.AUTOFILL_HINT_USERNAME)
                password?.setAutofillHints(View.AUTOFILL_HINT_PASSWORD)
            }
        }

        private fun field(themed: android.content.Context, hint: String?): TextInputEditText {
            val box = TextInputLayout(themed)
            val field = TextInputEditText(box.context)

            box.hint = hint
            if (hint == "Password") box.endIconMode = TextInputLayout.END_ICON_PASSWORD_TOGGLE
            box.addView(field)
            layout.addView(box)

            return field
        }
    }

    private companion object {
        val SLOTS = listOf(DialogInterface.BUTTON_POSITIVE, DialogInterface.BUTTON_NEGATIVE, DialogInterface.BUTTON_NEUTRAL)
        const val SECURE = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD

        /** The keyboards TextField's `inputMode` shows (KuitoInputTraits), as input types. */
        val KEYBOARDS = mapOf(
            AlertInputMode.TEXT to InputType.TYPE_CLASS_TEXT,
            AlertInputMode.DECIMAL to (InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL),
            AlertInputMode.NUMERIC to InputType.TYPE_CLASS_NUMBER,
            AlertInputMode.TEL to InputType.TYPE_CLASS_PHONE,
            AlertInputMode.SEARCH to InputType.TYPE_CLASS_TEXT,
            AlertInputMode.EMAIL to (InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS),
            AlertInputMode.URL to (InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI),
        )

        /** A password on the keyboard's class: a numeric one is a PIN pad. */
        fun secure(keyboard: Int) = when (keyboard and InputType.TYPE_MASK_CLASS) {
            InputType.TYPE_CLASS_NUMBER -> InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            else -> SECURE
        }
    }
}

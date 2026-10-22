package dev.kuito.runtime.modules.clipboard

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import dev.kuito.link.ClipboardSpec
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.modules.KuitoModuleContext

/** `Clipboard` in native/modules/clipboard/clipboard.ts. */
class KuitoClipboardModule(private val context: KuitoModuleContext) : ClipboardSpec {
    // ClipboardManager is a binder proxy and safe on any thread.
    private val clipboard by lazy { context.activity.getSystemService(ClipboardManager::class.java) }
    private var listener: ClipboardManager.OnPrimaryClipChangedListener? = null

    override fun hasText(): Boolean =
        clipboard.primaryClipDescription?.let {
            it.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN) || it.hasMimeType(ClipDescription.MIMETYPE_TEXT_HTML)
        } ?: false

    override fun readText(): String =
        clipboard.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context.activity)?.toString() ?: ""

    override fun writeText(text: String) {
        clipboard.setPrimaryClip(ClipData.newPlainText("Kuito", text))
    }

    override fun startHasText(signal: KuitoSignal<Boolean>) {
        val changed = ClipboardManager.OnPrimaryClipChangedListener { signal.set(hasText()) }

        listener = changed
        clipboard.addPrimaryClipChangedListener(changed)
    }

    override fun stopHasText() {
        listener?.let(clipboard::removePrimaryClipChangedListener)
        listener = null
    }
}

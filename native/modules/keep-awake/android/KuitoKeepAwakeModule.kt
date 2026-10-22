package dev.kuito.runtime.modules.keepawake

import android.view.WindowManager
import dev.kuito.link.KeepAwakeSpec
import dev.kuito.runtime.modules.KuitoModuleContext

/** `KeepAwake` in native/modules/keep-awake/keep-awake.ts. The window keeps the screen on while any tag holds it; a reload gives it back. */
class KuitoKeepAwakeModule(private val context: KuitoModuleContext) : KeepAwakeSpec {
    // UI thread only.
    private val tags = mutableSetOf<String>()

    override fun activate(tag: String) {
        tags.add(tag)
        apply()
    }

    override fun deactivate(tag: String) {
        tags.remove(tag)
        apply()
    }

    override fun destroy() {
        tags.clear()
        apply()
    }

    private fun apply() {
        val window = context.activity.window
        val flag = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON

        if (tags.isEmpty()) window.clearFlags(flag) else window.addFlags(flag)
    }
}

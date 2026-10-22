package dev.kuito.runtime.shell

import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The app window's size, the insets the system bars and display cutout take
 * from it, and its orientation, in dp. The shell has its root view report them
 * after every layout pass, which a resize, a rotation or new insets each
 * cause; `Window` reads them on the JS thread, so [current] is volatile.
 * Observers run on the UI thread.
 */
object KuitoWindowMetrics {
    data class Metrics(val width: Double, val height: Double, val insets: List<Double>, val orientation: String)

    @Volatile
    var current = Metrics(0.0, 0.0, listOf(0.0, 0.0, 0.0, 0.0), "portrait")
        private set

    private val observers = CopyOnWriteArrayList<(Metrics) -> Unit>()

    /** Follows [root]'s size and window insets. Other code owns its insets listener, so this listens to layout. */
    fun follow(root: View) {
        root.viewTreeObserver.addOnGlobalLayoutListener { update(root) }
    }

    private fun update(root: View) {
        val density = root.resources.displayMetrics.density.toDouble()
        val insets = ViewCompat.getRootWindowInsets(root)
            ?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val sides = insets?.let { listOf(it.top, it.left, it.bottom, it.right) } ?: listOf(0, 0, 0, 0)
        val next = Metrics(
            root.width / density,
            root.height / density,
            sides.map { it / density },
            if (root.width > root.height) "landscape" else "portrait",
        )

        if (next == current) return

        current = next
        observers.forEach { it(next) }
    }

    /** Calls [observer] with each change until the returned function is called. */
    fun observe(observer: (Metrics) -> Unit): () -> Unit {
        observers.add(observer)

        return { observers.remove(observer) }
    }
}

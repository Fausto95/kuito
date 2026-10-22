package dev.kuito.runtime.shell

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.res.Resources
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import dev.kuito.runtime.modules.KuitoModuleError
import org.json.JSONObject
import kotlin.math.max

/**
 * The launch screen, kept over the app until it hides (docs/splash.md). The
 * system draws the splash theme src/cli/splash-screens.ts generates while the
 * activity starts; the shell keeps it there until the app's first frame, then
 * draws the same layer list over its root, so the system's splash hands over
 * with no gap, and that goes in the frame that shows the app's first screen
 * unless the app keeps it. `Splash` reads and hides it; what JavaScript reads
 * synchronously is volatile, the rest is main-thread only.
 */
// Variants are resources named at run time.
@SuppressLint("DiscouragedApi")
object KuitoSplash {
    private const val PREFERENCES = "dev.kuito.splash"
    private const val VARIANT = "variant"
    private const val FADE_MS = 250L

    /** A frame in the window, in dp. */
    data class Frame(val x: Double, val y: Double, val width: Double, val height: Double)

    data class Layout(val logo: Frame, val brand: Frame?)

    /** A look's layout in dp, from `raw/kuito_splash.json`. */
    private class Look(val prefix: String, entry: JSONObject) {
        val logo: JSONObject = entry.getJSONObject("logo")
        val brand: JSONObject? = entry.optJSONObject("brand")
    }

    @Volatile
    var isVisible = false
        private set

    /** The logo's and brand's frames in dp, for `Splash.layout`. */
    @Volatile
    var layout: Layout? = null
        private set

    /** The variant this launch shows; null for the default look. */
    @Volatile
    var variant: String? = null
        private set

    /** Names in `raw/kuito_splash.json`'s variants; empty without a splash. */
    @Volatile
    var variants: Set<String> = emptySet()
        private set

    @Volatile
    private var keep = false

    private var look: Look? = null
    private var overlay: View? = null
    private var drawing = true
    private var fading = false
    private val waiting = mutableListOf<Pair<Boolean, () -> Unit>>()
    private var hasPendingFrames: () -> Boolean = { false }
    private val observers = mutableMapOf<Int, () -> Unit>()
    private var serial = 0

    fun preventAutoHide() {
        keep = true
    }

    /** The resource named after this launch's look: `kuito_splash_logo`, or a variant's. */
    fun resource(context: Context, part: String, type: String): Int {
        val prefix = checkNotNull(look?.prefix) { "The app has no splash: add one to kuito.config.ts (docs/splash.md)" }

        return context.resources.getIdentifier("${prefix}_$part", type, context.packageName)
    }

    /**
     * Covers `root` with the launch screen, when the app has one, and keeps
     * the system's splash up until the first frame. `hasPendingFrames` says
     * whether batches the app sent wait for a frame.
     */
    fun install(activity: Activity, root: FrameLayout, hasPendingFrames: () -> Boolean) {
        val resources = activity.resources
        val raw = resources.getIdentifier("kuito_splash", "raw", activity.packageName)

        if (raw == 0) return

        val json = JSONObject(resources.openRawResource(raw).bufferedReader().use { it.readText() })
        val declared = json.getJSONObject("variants")
        // Before Android 13 the system cannot show a variant, so neither does the overlay.
        val chosen = if (Build.VERSION.SDK_INT >= 33) {
            preferences(activity).getString(VARIANT, null)?.takeIf(declared::has)
        } else {
            null
        }
        val current = Look(chosen?.let { "kuito_splash_$it" } ?: "kuito_splash", chosen?.let(declared::getJSONObject) ?: json)
        val view = View(activity).apply {
            background = activity.getDrawable(resources.getIdentifier(current.prefix, "drawable", activity.packageName))
        }

        variants = declared.keys().asSequence().toSet()
        variant = chosen
        look = current
        attach(view, root, hasPendingFrames)
        drawing = false
        measure(resources, windowSize(activity))
        view.addOnLayoutChangeListener { changed, _, _, _, _, _, _, _, _ -> measure(resources, changed.width to changed.height) }
        keepSystemSplash(activity)
    }

    /** Covers `root` with `view`, the launch screen's drawing. */
    fun attach(view: View, root: FrameLayout, hasPendingFrames: () -> Boolean) {
        keep = false
        overlay = view
        isVisible = true
        this.hasPendingFrames = hasPendingFrames
        root.addView(view, FrameLayout.LayoutParams(-1, -1))
    }

    private fun windowSize(activity: Activity): Pair<Int, Int> =
        if (Build.VERSION.SDK_INT >= 30) {
            activity.windowManager.currentWindowMetrics.bounds.let { it.width() to it.height() }
        } else {
            @Suppress("DEPRECATION")
            android.util.DisplayMetrics().also { activity.windowManager.defaultDisplay.getRealMetrics(it) }
                .let { it.widthPixels to it.heightPixels }
        }

    /**
     * Where the layer list draws the logo and brand in a window this size:
     * the same pixel arithmetic as `LayerDrawable` (sizes rounded as
     * `getDimensionPixelSize` does, then `Gravity.apply`), reported in dp.
     */
    private fun measure(resources: Resources, size: Pair<Int, Int>) {
        val current = look ?: return
        val (width, height) = size
        val density = resources.displayMetrics.density
        val px = { dp: Double -> (dp * density + 0.5).toInt() }
        val dp = { pixels: Int -> pixels / density.toDouble() }
        val frame = { left: Int, top: Int, w: Int, h: Int -> Frame(x = dp(left), y = dp(top), width = dp(w), height = dp(h)) }
        val logoWidth = px(current.logo.getDouble("width"))
        val logoHeight = px(current.logo.getDouble("height"))
        val brand = current.brand?.let {
            val w = px(it.getDouble("width"))
            val h = px(it.getDouble("height"))

            frame((width - w) / 2, height - px(it.getDouble("bottom")) - h, w, h)
        }

        if (width > 0 && height > 0)
            layout = Layout(logo = frame((width - logoWidth) / 2, (height - logoHeight) / 2, logoWidth, logoHeight), brand = brand)
    }

    /**
     * The system's splash stays until the window draws: drawing waits for the
     * first frame. On Android 12 and later its view then comes to the app,
     * which lets its icon animation end over the identical overlay.
     */
    private fun keepSystemSplash(activity: Activity) {
        val content = activity.findViewById<View>(android.R.id.content)

        content.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                if (!drawing) return false

                content.viewTreeObserver.removeOnPreDrawListener(this)

                return true
            }
        })

        if (Build.VERSION.SDK_INT >= 31)
            activity.splashScreen.setOnExitAnimationListener { splash ->
                val end = splash.iconAnimationStart?.let { start ->
                    start.toEpochMilli() + (splash.iconAnimationDuration?.toMillis() ?: 0L)
                } ?: 0L

                splash.postDelayed(splash::remove, max(0L, end - System.currentTimeMillis()))
            }
    }

    /**
     * The app's first frame with content arrived: the first batch in which
     * the renderer created a view, or set a prop of one (its `onUpdate`).
     * The window draws, and the splash hides with it unless the app keeps it.
     */
    fun firstFrame() {
        drawing = true

        if (!keep) hide(false) {}
    }

    /** Hides once the batches sent before this call are on screen; `done` runs when it is gone. */
    fun hide(fade: Boolean, done: () -> Unit) {
        if (overlay == null) return done()

        drawing = true
        waiting.add(fade to done)

        if (!hasPendingFrames()) framesCommitted()
    }

    /** The shell applied every batch it had: a waiting hide goes in this frame. */
    fun framesCommitted() {
        val view = overlay ?: return

        if (waiting.isEmpty() || fading) return

        if (waiting.none { it.first }) return remove(view)

        fading = true
        view.animate().alpha(0f).setDuration(FADE_MS).withEndAction { remove(view) }
    }

    /**
     * Removes it at once: the app failed before its first screen, or waits
     * for a dev server, and what the shell shows instead must not stay hidden.
     */
    fun dismiss() {
        drawing = true
        overlay?.let(::remove)
    }

    private fun remove(view: View) {
        (view.parent as? FrameLayout)?.removeView(view)
        overlay = null
        fading = false
        isVisible = false

        val done = waiting.toList()

        waiting.clear()
        done.forEach { it.second() }
        observers.values.toList().forEach { it() }
    }

    /** Calls `observer` once the splash is gone, at once when it already is; returns a token for [cancel]. */
    fun observe(observer: () -> Unit): Int {
        val token = ++serial

        if (overlay == null) observer() else observers[token] = observer

        return token
    }

    fun cancel(token: Int) {
        observers.remove(token)
    }

    /**
     * The look the next launch shows, where Android 13's
     * `setSplashScreenTheme` lets the app pick the system splash's theme.
     */
    fun choose(activity: Activity, name: String?) {
        if (Build.VERSION.SDK_INT < 33)
            throw KuitoModuleError(
                "ERR_UNSUPPORTED",
                "Android ${Build.VERSION.RELEASE} draws the splash its manifest names; splash variants need Android 13",
            )

        if (name != null && name !in variants)
            throw KuitoModuleError(
                "ERR_ARGUMENT",
                "No splash variant '$name' in kuito.config.ts; declared: ${variants.joinToString().ifEmpty { "none" }}",
            )

        val theme = name?.let { activity.resources.getIdentifier("Theme.Kuito.Splash.$it", "style", activity.packageName) }

        activity.splashScreen.setSplashScreenTheme(theme ?: Resources.ID_NULL)
        preferences(activity).edit().putString(VARIANT, name).apply()
    }

    private fun preferences(context: Context) = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}

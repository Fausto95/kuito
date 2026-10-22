package dev.kuito.runtime

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import dev.kuito.runtime.shell.KuitoAppLifecycle
import dev.kuito.runtime.shell.KuitoLinks
import dev.kuito.runtime.shell.KuitoSplash
import dev.kuito.runtime.shell.KuitoWindowMetrics
import dev.kuito.runtime.renderer.KuitoAndroidRenderer

/**
 * Native Android Views shell: Hermes on the device ([KuitoEngine]), its
 * views in [renderer], under the Android lifecycle. Each build type's
 * `KuitoActivity` adds what it shows around the app: debug's the dev
 * link, devtools and LogBox (src/debug), release's none of them
 * (src/release).
 */
abstract class KuitoHostActivity : ComponentActivity() {
    protected lateinit var root: FrameLayout
        private set
    protected lateinit var renderer: KuitoAndroidRenderer
        private set
    protected lateinit var engine: KuitoEngine
        private set
    @Suppress("DEPRECATION") // Android 14 stops sending the running levels; older versions still do.
    private val memoryWarnings = setOf(TRIM_MEMORY_RUNNING_LOW, TRIM_MEMORY_RUNNING_CRITICAL, TRIM_MEMORY_COMPLETE)

    private val settings by lazy { KuitoAppSettings.of(this) }

    /** The inspector's handle the runtimes attach to (docs/devtools.md); 0 for none. */
    protected open val inspector: Long get() = 0L

    /** The window's color when the app sets none; null keeps the theme's. */
    protected open val blankBackground: Int? get() = null

    /** Draws what the build type shows over the app in [root], before the splash covers it. */
    protected open fun install(root: FrameLayout) = Unit

    /** A view the app updated. */
    protected open fun rendered(view: View) = Unit

    /** console output: every entry prints in logcat. */
    protected abstract fun log(level: String, message: String, stack: String)

    /** A failure of `what`; a JavaScript error brings its own message and stack. Code that failed to run is fatal. */
    protected abstract fun failed(what: String, cause: String? = null, stack: String = "", fatal: Boolean = false)

    // Before any resources exist: a forced light or dark style is part of the configuration.
    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(base)
        KuitoAppSettings.of(base).configurationOverride()?.let(::applyOverrideConfiguration)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // The splash theme (docs/splash.md) is for the system's starting window; the activity runs in the app's.
        setTheme(applicationInfo.theme)
        super.onCreate(savedInstanceState)
        KuitoLinks.launched(intent)
        lifecycle.addObserver(KuitoAppLifecycle)
        // Edge to edge, as in React Native: SafeAreaView opts content back in.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        // The commit benchmark's log (scripts/benchmark-commits.ts), in either build type.
        KuitoCommitStats.logging = intent.getBooleanExtra("kuito_commit_log", false)
        root = FrameLayout(this)
        val surface = FrameLayout(this)
        root.addView(surface, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        KuitoWindowMetrics.follow(root)
        // On the window, not the root: SystemUI.setBackgroundColorAsync replaces it there.
        (settings.backgroundColor ?: blankBackground)?.let(window.decorView::setBackgroundColor)
        renderer = KuitoAndroidRenderer(this, surface) { id, event, payload -> engine.event(id, event, payload) }
        renderer.onUpdate = ::rendered
        engine = KuitoEngine(this, renderer, inspector, onLog = ::log, onFailure = ::failed)
        install(root)
        // Over everything, so the system's splash hands over to the same drawing;
        // only at launch, when the system showed one.
        if (savedInstanceState == null) KuitoSplash.install(this, root) { engine.hasPendingFrames }
        engine.start()
    }

    // singleTask: a link that arrives while the app runs comes here, not to a new activity.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        KuitoLinks.received(intent)
    }

    // The manifest's configChanges: rotation, resizing and font scale keep the runtime.
    override fun onConfigurationChanged(configuration: Configuration) {
        super.onConfigurationChanged(configuration)
        renderer.configurationChanged()
    }

    // Every touch, before any view sees it: the touch-to-applied latency (KuitoCommitStats).
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN || event.actionMasked == MotionEvent.ACTION_UP)
            KuitoCommitStats.touched(event.eventTime)

        return super.dispatchTouchEvent(event)
    }

    // Memory warnings for AppState: pressure while the app runs, not trimming after it was hidden.
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)

        if (level in memoryWarnings) KuitoAppLifecycle.receivedMemoryWarning()
    }

    override fun onDestroy() {
        engine.close()
        renderer.close()
        super.onDestroy()
    }
}

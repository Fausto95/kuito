package dev.kuito.runtime.modules.splash

import android.content.Context
import android.widget.ImageView
import dev.kuito.link.SplashFrame
import dev.kuito.link.SplashLayout
import dev.kuito.link.SplashSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.link.resolve
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.shell.KuitoSplash

/** `Splash` in native/modules/splash/splash.ts, and the view that draws its parts. */
class KuitoSplashModule(private val context: KuitoModuleContext) : SplashSpec {
    private var observation: Int? = null

    override fun layout() = KuitoSplash.layout?.let { SplashLayout(logo = frame(it.logo), brand = it.brand?.let(::frame)) }

    private fun frame(frame: KuitoSplash.Frame) = SplashFrame(x = frame.x, y = frame.y, width = frame.width, height = frame.height)

    override fun visible() = KuitoSplash.isVisible

    // The splash goes once per launch: observing a splash already gone sets false at once.
    override fun startVisible(signal: KuitoSignal<Boolean>) {
        observation = KuitoSplash.observe { signal.set(false) }
    }

    override fun stopVisible() {
        observation?.let(KuitoSplash::cancel)
        observation = null
    }

    override fun preventAutoHide() = KuitoSplash.preventAutoHide()

    override fun hide(fade: Boolean, promise: KuitoPromise<Unit>) = KuitoSplash.hide(fade) { promise.resolve() }

    override fun getVariant() = KuitoSplash.variant

    override fun setVariant(name: String?) = KuitoSplash.choose(context.activity, name)

    override fun view(): KuitoModuleView<*> = KuitoModuleView(::KuitoSplashPartView) { view ->
        view.prop("part", KuitoType.optional(KuitoType.enum(KuitoSplashPartView.Part.entries.toTypedArray()))) { part, value ->
            part.part = value
        }
    }
}

/**
 * One part of the launch screen, drawn from the same resources as this
 * launch's look, so it follows dark mode the way the launch screen does.
 */
class KuitoSplashPartView(context: Context, @Suppress("UNUSED_PARAMETER") events: KuitoViewEvents) : ImageView(context) {
    enum class Part { BACKGROUND, LOGO, BRAND }

    var part: Part? = null
        set(value) {
            field = value
            setImageDrawable(null)
            background = null

            when (value) {
                Part.BACKGROUND -> setBackgroundColor(context.getColor(KuitoSplash.resource(context, "background", "color")))
                Part.LOGO -> setImageResource(KuitoSplash.resource(context, "logo", "drawable"))
                Part.BRAND -> setImageResource(KuitoSplash.resource(context, "brand", "drawable"))
                null -> {}
            }
        }

    init {
        scaleType = ScaleType.FIT_XY
    }
}

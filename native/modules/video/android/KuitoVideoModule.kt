package dev.kuito.runtime.modules.video

import dev.kuito.link.VideoSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.link.resolve
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.audio.KuitoAudioSession
import org.json.JSONObject

/**
 * `Video` in native/modules/video/video.ts: a view and the methods a ref to
 * it calls. Each view owns its player and releases it when
 * Kuito removes the view or the runtime reloads.
 */
class KuitoVideoModule(private val context: KuitoModuleContext) : VideoSpec {
    private val session by lazy { KuitoAudioSession.of(context.applicationContext) }

    override fun view(): KuitoModuleView<*> {
        val flag = KuitoType.optional(KuitoType.boolean)

        return KuitoModuleView({ viewContext, events -> KuitoVideoView(viewContext, events, session) }) { view ->
            view.prop("src", KuitoType.optional(source)) { video, uri -> video.player.load(uri) }
            view.prop("paused", flag) { video, paused -> video.player.setPaused(paused ?: false) }
            view.prop("muted", flag) { video, muted -> video.player.muted = muted ?: false }
            view.prop("volume", KuitoType.optional(volume)) { video, volume -> video.player.volume = volume ?: 1f }
            view.prop("rate", KuitoType.optional(rate)) { video, rate -> video.player.rate = rate ?: 1f }
            view.prop("loop", flag) { video, loop -> video.player.loop = loop ?: false }
            view.prop("objectFit", KuitoType.optional(KuitoType.enum(KuitoVideoResizeMode.values()))) { video, mode ->
                video.resizeMode = mode ?: KuitoVideoResizeMode.CONTAIN
            }
            view.prop("controls", flag) { video, controls -> video.controls = controls ?: false }
            view.prop("progressInterval", KuitoType.optional(interval)) { video, milliseconds ->
                video.player.progressInterval = milliseconds ?: KuitoVideoPlayer.PROGRESS_INTERVAL
            }
        }
    }

    override fun seek(view: android.view.View, seconds: Double, promise: KuitoPromise<Unit>) {
        video(view).player.seek(seconds)
        promise.resolve()
    }

    override fun play(view: android.view.View) = video(view).player.setPaused(false)

    override fun pause(view: android.view.View) = video(view).player.setPaused(true)

    override fun enterFullscreen(view: android.view.View, promise: KuitoPromise<Unit>) =
        video(view).fullscreen.enter { promise.resolve() }

    override fun exitFullscreen(view: android.view.View, promise: KuitoPromise<Unit>) =
        video(view).fullscreen.exit { promise.resolve() }

    override fun startPictureInPicture(view: android.view.View, promise: KuitoPromise<Unit>) {
        throw pictureInPicture()
    }

    override fun stopPictureInPicture(view: android.view.View, promise: KuitoPromise<Unit>) {
        throw pictureInPicture()
    }

    private fun video(view: android.view.View) =
        view as? KuitoVideoView ?: throw KuitoModuleError(KuitoErrorCode.VIEW_NOT_FOUND, "The view is not a Video")

    private companion object {
        /** `{ uri }`: an http(s) or file:// URL. */
        val source = KuitoType { value ->
            val uri = KuitoType.obj.decode(value).optString("uri")

            if (!Regex("^(https?|file)://", RegexOption.IGNORE_CASE).containsMatchIn(uri))
                throw KuitoModuleError("ERR_ARGUMENT", "source.uri must be an http(s) or file:// URL, got ${if (value is JSONObject) uri else value}")
            uri
        }
        val volume = KuitoType { value ->
            KuitoType.double.decode(value).takeIf { it in 0.0..1.0 }?.toFloat()
                ?: throw KuitoModuleError("ERR_ARGUMENT", "volume must be between 0 and 1, got $value")
        }
        val rate = KuitoType { value ->
            KuitoType.double.decode(value).takeIf { it > 0 }?.toFloat()
                ?: throw KuitoModuleError("ERR_ARGUMENT", "rate must be above 0, got $value")
        }
        val interval = KuitoType { value ->
            KuitoType.double.decode(value).takeIf { it >= 0 }?.toLong()
                ?: throw KuitoModuleError("ERR_ARGUMENT", "progressUpdateInterval must be 0 or more, got $value")
        }

        /** Android's picture in picture is the whole activity's, not one view's (docs/video.md). */
        fun pictureInPicture() =
            KuitoModuleError("ERR_UNSUPPORTED", "Picture in picture is iOS only: on Android it shrinks the whole activity")
    }
}

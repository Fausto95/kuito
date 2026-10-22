package dev.kuito.runtime.modules.video

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.LayoutInflater
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import dev.kuito.runtime.R
import dev.kuito.runtime.modules.KuitoNativeView
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.shell.KuitoAppLifecycle
import dev.kuito.runtime.modules.audio.KuitoAudioFocus
import dev.kuito.runtime.modules.audio.KuitoAudioSession

/** How the picture fills the view, as Media3's resize modes. */
@SuppressLint("UnsafeOptInUsageError")
enum class KuitoVideoResizeMode(val media3: Int) {
    CONTAIN(AspectRatioFrameLayout.RESIZE_MODE_FIT),
    COVER(AspectRatioFrameLayout.RESIZE_MODE_ZOOM),
    FILL(AspectRatioFrameLayout.RESIZE_MODE_FILL),
}

/**
 * `Video` (src/native/video.tsx): a Media3 PlayerView showing the view's own
 * ExoPlayer. Fullscreen moves the picture to a dialog's PlayerView; the app
 * going to the background pauses it unless the audio mode keeps it playing.
 * See docs/video.md.
 */
@UnstableApi
class KuitoVideoView(context: Context, events: KuitoViewEvents, session: KuitoAudioSession) :
    FrameLayout(context), KuitoNativeView {
    val player = KuitoVideoPlayer(context, events, session)
    private val surface = (LayoutInflater.from(context).inflate(R.layout.video_player_view, this, false) as PlayerView).apply {
        player = this@KuitoVideoView.player.exo
        // Kuito unclips the views it makes (overflow is visible by default), so
        // the picture clips itself: `cover` zooms it past the view's bounds.
        outlineProvider = ViewOutlineProvider.BOUNDS
        clipToOutline = true
    }
    val fullscreen = KuitoVideoFullscreen(surface) { presented ->
        events.emit("fullscreenChange", mapOf("fullscreen" to presented))
    }

    var resizeMode = KuitoVideoResizeMode.CONTAIN
        set(next) {
            field = next
            surface.resizeMode = next.media3
            fullscreen.resizeMode = next.media3
        }

    var controls = false
        set(next) {
            field = next
            surface.useController = next
        }

    private var lifecycle: (() -> Unit)? = KuitoAppLifecycle.observe { event ->
        val background = event == KuitoAppLifecycle.Event.Changed(KuitoAppLifecycle.State.BACKGROUND)

        // As Audio's players: only the audio mode keeps a video playing in the background.
        if (background && !KuitoAudioFocus.appMode.staysActiveInBackground) post { player.pause() }
    }

    init {
        // The controls' fullscreen button opens the same fullscreen as enterFullscreen().
        surface.setFullscreenButtonClickListener { fullscreen.enter {} }
        setBackgroundColor(Color.BLACK)
        addView(surface)
    }

    /** Kuito removed the view, or the runtime is reloading. */
    override fun unmount() {
        lifecycle?.invoke()
        lifecycle = null
        fullscreen.exit {}
        surface.player = null
        player.release()
    }
}

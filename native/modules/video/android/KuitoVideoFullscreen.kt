package dev.kuito.runtime.modules.video

import android.app.Dialog
import android.graphics.Color
import android.os.Build
import android.view.ViewGroup
import android.view.WindowInsets
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/**
 * A Video's fullscreen: a dialog over the activity whose PlayerView, with
 * the platform's controls, takes the player from [inline] and gives it back
 * when the user goes back. [changed] hears both ways.
 */
@UnstableApi
class KuitoVideoFullscreen(private val inline: PlayerView, private val changed: (Boolean) -> Unit) {
    private var dialog: Dialog? = null
    private var leaving: (() -> Unit)? = null

    var resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT

    fun enter(done: () -> Unit) {
        if (dialog != null) return done()

        val context = inline.context
        val surface = PlayerView(context).apply {
            setShutterBackgroundColor(Color.BLACK)
            setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
            resizeMode = this@KuitoVideoFullscreen.resizeMode
            setFullscreenButtonState(true)
            setFullscreenButtonClickListener { exit {} }
        }
        val dialog = Dialog(context, android.R.style.Theme_Black_NoTitleBar_Fullscreen).apply {
            setContentView(surface, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            setOnDismissListener { left(surface) }
        }

        this.dialog = dialog
        dialog.show()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) dialog.window?.insetsController?.hide(WindowInsets.Type.systemBars())

        PlayerView.switchTargetView(inline.player ?: return done(), inline, surface)
        changed(true)
        done()
    }

    fun exit(done: () -> Unit) {
        val dialog = dialog ?: return done()

        leaving = done
        dialog.dismiss()
    }

    private fun left(surface: PlayerView) {
        surface.player?.let { PlayerView.switchTargetView(it, surface, inline) }
        dialog = null
        changed(false)
        leaving?.invoke()
        leaving = null
    }
}

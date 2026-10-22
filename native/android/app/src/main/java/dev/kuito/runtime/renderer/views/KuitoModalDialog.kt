package dev.kuito.runtime.renderer.views

import android.graphics.Color
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.setViewTreeOnBackPressedDispatcherOwner
import androidx.appcompat.app.AppCompatDialog
import androidx.core.view.WindowCompat
import com.google.android.material.color.MaterialColors

/**
 * A modal or full-screen route's surface: a dialog that fills the window,
 * edge to edge, and slides up over the app as Material's bottom sheet does.
 * The window slides, not a view in it, so the stack inside measures where
 * the status bar is from where it rests. The dialog is the back dispatcher
 * the NavigationStack inside takes back from; back on the stack's first
 * screen cancels the dialog, which reports `close`.
 */
internal class KuitoModalDialog(content: KuitoSheetLayout) :
    AppCompatDialog(content.context, com.google.android.material.R.style.Theme_Material3_DayNight_NoActionBar) {
    init {
        val frame = FrameLayout(context).apply {
            setBackgroundColor(MaterialColors.getColor(context, com.google.android.material.R.attr.colorSurface, Color.WHITE))
        }

        (content.parent as? ViewGroup)?.removeView(content)
        frame.addView(content, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(frame)
        // AppCompatDialog's setContentView goes through its delegate, which
        // skips ComponentDialog's: it publishes the dialog's dispatcher to the
        // views in its window only once it is set here.
        window?.decorView?.setViewTreeOnBackPressedDispatcherOwner(this)
        setCancelable(content.dismissible)
        window?.let { window ->
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            window.setWindowAnimations(com.google.android.material.R.style.Animation_Material3_BottomSheetDialog)
            window.statusBarColor = Color.TRANSPARENT
            window.navigationBarColor = Color.TRANSPARENT
            WindowCompat.setDecorFitsSystemWindows(window, false)
        }
    }
}

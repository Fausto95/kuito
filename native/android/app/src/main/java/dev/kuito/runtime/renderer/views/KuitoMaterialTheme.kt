package dev.kuito.runtime.renderer.views

import android.content.Context
import android.view.ContextThemeWrapper

/**
 * Material components check their theme at construction, and the shell runs
 * on a platform theme; native chrome (headers, tab bars) gets Material 3's.
 */
internal fun Context.materialThemed(): Context =
    ContextThemeWrapper(this, com.google.android.material.R.style.Theme_Material3_DayNight_NoActionBar)

package dev.kuito.runtime.modules.share

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import dev.kuito.link.ShareAction
import dev.kuito.link.ShareRequest
import dev.kuito.link.ShareResult
import dev.kuito.link.ShareSpec
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import java.util.UUID

/** `Share` in native/modules/share/share.ts. */
class KuitoShareModule(private val context: KuitoModuleContext) : ShareSpec {
    /**
     * The Sharesheet reports the app the user picks through an IntentSender,
     * before that app starts. This activity resuming without that report means
     * the sheet was dismissed.
     */
    override fun share(request: ShareRequest, promise: KuitoPromise<ShareResult>) {
        val activity = context.activity
        val owner = activity as? LifecycleOwner ?: throw KuitoModuleError("ERR_NATIVE", "The activity has no lifecycle")
        val text = listOfNotNull(request.message, request.url).joinToString(" ")
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        val chosenAction = "${activity.packageName}.SHARE_CHOSEN.${UUID.randomUUID()}"
        var chosen: ComponentName? = null
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) {
                chosen = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_CHOSEN_COMPONENT, ComponentName::class.java)
            }
        }
        // Mutable so the system can add the chosen component; explicit, as Android 14 requires of mutable ones.
        val sender = PendingIntent.getBroadcast(
            activity, 0, Intent(chosenAction).setPackage(activity.packageName),
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        ).intentSender

        request.title?.let { send.putExtra(Intent.EXTRA_SUBJECT, it) }
        ContextCompat.registerReceiver(activity, receiver, IntentFilter(chosenAction), ContextCompat.RECEIVER_NOT_EXPORTED)

        val closed = object : DefaultLifecycleObserver {
            private var left = false

            override fun onPause(owner: LifecycleOwner) {
                left = true
            }

            // Adding the observer replays onResume at once; only a resume after the sheet counts.
            override fun onResume(owner: LifecycleOwner) {
                if (!left) return

                owner.lifecycle.removeObserver(this)
                // A pick's broadcast already queued is handled before this runs.
                Handler(Looper.getMainLooper()).post {
                    activity.unregisterReceiver(receiver)
                    promise.resolve(
                        chosen?.let { ShareResult(action = ShareAction.SHARED, activityType = it.flattenToShortString()) }
                            ?: ShareResult(action = ShareAction.DISMISSED),
                    )
                }
            }
        }

        try {
            activity.startActivity(Intent.createChooser(send, request.dialogTitle, sender))
        } catch (error: Exception) {
            activity.unregisterReceiver(receiver)
            throw error
        }

        owner.lifecycle.addObserver(closed)
    }
}

package dev.kuito.runtime.shell

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The links that open the app, and the way out to other apps. The shell
 * reports its activity's intents; the Linking module reads the latest and
 * forwards the rest. It outlives runtimes, so a reload still sees the last link.
 */
object KuitoLinks {
    /** The link that last opened the app, starting with the launch link: read from the JS thread. */
    @Volatile
    var latest: String? = null
        private set

    private val observers = CopyOnWriteArrayList<(String) -> Unit>()

    /** The activity was created: with the link that launched the app, if any. */
    fun launched(intent: Intent) {
        latest = link(intent)
    }

    /** An intent arrived while the app runs: `onNewIntent`. */
    fun received(intent: Intent) {
        link(intent)?.let { url ->
            latest = url
            observers.forEach { it(url) }
        }
    }

    /** Calls [observer] with each link received until the returned function is called. */
    fun observe(observer: (String) -> Unit): () -> Unit {
        observers.add(observer)

        return { observers.remove(observer) }
    }

    /**
     * Opens [url] in the app that handles it: `linking.open`, and a
     * WebView's links outside its whitelist. False when no app does.
     */
    fun open(activity: Activity, url: Uri): Boolean = try {
        activity.startActivity(Intent(Intent.ACTION_VIEW, url))
        true
    } catch (_: ActivityNotFoundException) {
        false
    }

    private fun link(intent: Intent) = intent.data?.takeIf { intent.action == Intent.ACTION_VIEW }?.toString()
}

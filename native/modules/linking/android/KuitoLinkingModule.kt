package dev.kuito.runtime.modules.linking

import android.content.Intent
import android.net.Uri
import dev.kuito.link.LinkingSpec
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.link.resolve
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.shell.KuitoLinks

/** `Linking` in native/modules/linking/linking.ts. */
class KuitoLinkingModule(private val context: KuitoModuleContext) : LinkingSpec {
    private var observation: (() -> Unit)? = null

    override fun openURL(url: String, promise: KuitoPromise<Unit>) {
        if (!KuitoLinks.open(context.activity, uri(url))) throw KuitoModuleError("ERR_URL", "No app opens $url")
        promise.resolve()
    }

    override fun canOpenURL(url: String): Boolean =
        Intent(Intent.ACTION_VIEW, uri(url)).resolveActivity(context.activity.packageManager) != null

    override fun url(): String? = KuitoLinks.latest

    // Starting sends the latest link: JavaScript read it before this ran on
    // the UI thread, and drops it unless a link arrived in between.
    override fun startUrl(signal: KuitoSignal<String?>) {
        observation = KuitoLinks.observe { url -> signal.set(url) }
        signal.set(url())
    }

    override fun stopUrl() {
        observation?.invoke()
        observation = null
    }

    private fun uri(url: String): Uri {
        val uri = Uri.parse(url)

        if (uri.scheme == null) throw KuitoModuleError("ERR_URL", "$url is not a URL")

        return uri
    }
}

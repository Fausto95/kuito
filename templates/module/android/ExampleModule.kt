package {{package}}

import android.os.Build
import dev.kuito.link.ExampleEcho
import dev.kuito.link.ExampleSpec
import dev.kuito.runtime.link.KuitoEmitter
import dev.kuito.runtime.modules.KuitoModuleContext

/**
 * The Android half of `Example` (example.ts). A mismatch with the spec's
 * generated `ExampleSpec` fails the build.
 */
class ExampleModule(private val context: KuitoModuleContext) : ExampleSpec {
    private var echoed: KuitoEmitter<ExampleEcho>? = null

    override fun platform() = "Android ${Build.VERSION.RELEASE}"

    override fun echo(message: String): String {
        echoed?.send(ExampleEcho(message = message))
        return message
    }

    override fun startEchoed(emitter: KuitoEmitter<ExampleEcho>) {
        echoed = emitter
    }

    override fun stopEchoed() {
        echoed = null
    }
}

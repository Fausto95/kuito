package dev.kuito.runtime.renderer

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Every event payload reaches the runtimes in its layout (docs/events.md#typed-events):
 * a view's in the generated record, a module view's as JSON, where a number
 * JSON cannot hold is sent as null, as iOS's emitter sends it.
 */
@RunWith(AndroidJUnit4::class)
class KuitoEventEmitterTest {
    /** The emitter reuses its record on the main thread, where views send events. */
    private fun <T> onMain(block: () -> T): T {
        var result: Result<T>? = null

        InstrumentationRegistry.getInstrumentation().runOnMainSync { result = runCatching(block) }

        return checkNotNull(result).getOrThrow()
    }

    private fun sent(emit: (KuitoEventEmitter) -> Unit): List<String> = onMain {
        val messages = mutableListOf<String>()

        emit(
            KuitoEventEmitter { id, event, record ->
                messages.add(record.describe("$id.$event"))
                false
            },
        )
        messages
    }

    @Test
    fun aPayloadSendsItsNumbersAndStringsInItsLayout() {
        val payload = KuitoKeyboardFramePayload(
            screenX = 0.0, screenY = 500.0, width = 400.0, height = 300.0, duration = 250.0, easing = "keyboard",
        )
        var layout: Int? = null
        val messages = onMain {
            val messages = mutableListOf<String>()

            KuitoEventEmitter { id, event, record ->
                layout = record.layout
                messages.add(record.describe("$id.$event"))
                false
            }.emit(0, "keyboard.willshow", payload)
            messages
        }

        assertEquals(listOf("0.keyboard.willshow 0.0 500.0 400.0 300.0 250.0 keyboard"), messages)
        assertEquals(KuitoEventRecord().also(payload::write).layout, layout)
        assertNotEquals(0, layout)
    }

    @Test
    fun anEventWithoutAPayloadSendsAnEmptyRecord() {
        var record: Triple<Int, Int, String?>? = null

        onMain {
            KuitoEventEmitter { _, _, sent ->
                record = Triple(sent.layout, sent.count + sent.strings.size, sent.json)
                false
            }.emit(3, "press")
        }

        assertEquals(Triple(0, 0, null), record)
    }

    @Test
    fun anEventSentWhileAnotherIsSentGetsItsOwnRecord() {
        val messages = onMain {
            val messages = mutableListOf<String>()
            lateinit var emitter: KuitoEventEmitter

            emitter = KuitoEventEmitter { id, event, record ->
                if (event == "pressin") emitter.emit(id, "snap", KuitoIndexPayload(2.0))
                messages.add(record.describe("$id.$event"))
                false
            }
            emitter.emit(7, "pressin", KuitoTouchPayload(1.0, 2.0, 3.0, 4.0))
            messages
        }

        assertEquals(listOf("7.snap 2.0", "7.pressin 1.0 2.0 3.0 4.0"), messages)
    }

    @Test
    fun aModulePayloadSendsJSON() {
        var numbers: Int? = null
        val messages = onMain {
            val messages = mutableListOf<String>()

            KuitoEventEmitter { id, event, record ->
                numbers = record.count
                messages.add(record.describe("$id.$event"))
                false
            }.emitJson(7, "change", mapOf("y" to 12))
            messages
        }

        assertEquals(listOf("""7.change {"y":12}"""), messages)
        assertEquals(0, numbers)
    }

    @Test
    fun aModulePayloadSendsNaNAsNull() = assertEquals(
        listOf("""7.change {"y":null}"""),
        sent { it.emitJson(7, "change", mapOf("y" to Double.NaN)) },
    )

    @Test
    fun aModulePayloadSendsInfinityAsNull() = assertEquals(
        listOf("""7.change {"y":null}"""),
        sent { it.emitJson(7, "change", mapOf("y" to Float.POSITIVE_INFINITY)) },
    )

    @Test
    fun aModulePayloadSendsANestedNaNAsNull() = assertEquals(
        listOf("""7.change {"offset":{"y":null},"items":[null]}"""),
        sent { it.emitJson(7, "change", mapOf("offset" to mapOf("y" to Double.NaN), "items" to listOf(Double.NEGATIVE_INFINITY))) },
    )

    @Test
    fun aModuleEventWithoutAPayloadSendsEmptyJSON() {
        var json: String? = null

        onMain {
            KuitoEventEmitter { _, _, record ->
                json = record.json
                false
            }.emitJson(7, "changeEnd", null)
        }

        // JSON, not a record: the manifest has no layout for a module view's own event.
        assertEquals("", json)
    }

    @Test
    fun aModulePayloadRejectsAValueJSONCannotHold() {
        assertThrows(IllegalArgumentException::class.java) { sent { it.emitJson(7, "change", mapOf("view" to Any())) } }
    }
}

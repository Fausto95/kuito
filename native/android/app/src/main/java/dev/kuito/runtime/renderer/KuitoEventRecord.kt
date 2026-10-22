package dev.kuito.runtime.renderer

/**
 * A native event's payload in its fixed layout (docs/events.md#typed-events):
 * numbers and booleans by slot, then strings, as KuitoEvents.generated.kt
 * writes them; or, for a module view's own event, JSON text. The emitter
 * reuses one while no other event is being sent.
 */
internal class KuitoEventRecord {
    /** The layout's id (native/shared/EventLayouts.generated.h): 0 for no payload. */
    var layout = 0
        private set
    val numbers = DoubleArray(KUITO_EVENT_NUMBERS)
    /** How many of [numbers] this event filled. */
    var count = 0
        private set
    val strings = ArrayList<String>(2)
    /** A module view's payload, which the manifest does not lay out. */
    var json: String? = null
        private set

    fun begin(layout: Int) {
        this.layout = layout
        count = 0
        strings.clear()
        json = null
    }

    fun number(value: Double) {
        numbers[count++] = value
    }

    fun string(value: String) {
        strings.add(value)
    }

    fun json(text: String) {
        begin(0)
        json = text
    }

    /** The strings as JNI takes them: null for none. */
    fun stringArray(): Array<String>? = if (strings.isEmpty()) null else strings.toTypedArray()

    /** A copy of its own, for a JS-thread post that runs after the emitter reused this one. */
    fun copy(): KuitoEventRecord = KuitoEventRecord().also { copy ->
        copy.layout = layout
        numbers.copyInto(copy.numbers, 0, 0, count)
        copy.count = count
        copy.strings.addAll(strings)
        copy.json = json
    }
}

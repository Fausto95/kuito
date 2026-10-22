package dev.kuito.runtime.renderer.gestures

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The registry answers which gesture waits for or runs alongside which from
 * the shared relations (native/shared/gestures/GestureRelations.h).
 */
@RunWith(AndroidJUnit4::class)
class GestureRelationsTest {
    private fun registry(test: (GestureHandlerRegistry) -> Unit) {
        val registry = GestureHandlerRegistry()

        try {
            test(registry)
        } finally {
            registry.close()
        }
    }

    private fun GestureHandlerRegistry.add(tag: Int, waitFor: IntArray = intArrayOf(), simultaneous: IntArray = intArrayOf(), blocks: IntArray = intArrayOf()) {
        registerHandler(TapGestureHandler().also { it.tag = tag })
        relations.set(tag, waitFor, simultaneous, blocks)
    }

    @Test
    fun waitForAndBlocksMakeTheSameGestureWait() = registry { registry ->
        registry.add(1, waitFor = intArrayOf(2))
        registry.add(2)
        registry.add(3, blocks = intArrayOf(2))

        assertTrue(registry.relations.waitsFor(1, 2))
        assertFalse(registry.relations.waitsFor(2, 1))
        assertTrue(registry.relations.waitsFor(2, 3))
        assertFalse(registry.relations.waitsFor(3, 2))
    }

    @Test
    fun simultaneousGoesBothWays() = registry { registry ->
        registry.add(1, simultaneous = intArrayOf(2))
        registry.add(2)

        assertTrue(registry.relations.simultaneous(1, 2))
        assertTrue(registry.relations.simultaneous(2, 1))
    }

    @Test
    fun aDroppedGestureTakesItsRelationsWithIt() = registry { registry ->
        registry.add(1, waitFor = intArrayOf(2), simultaneous = intArrayOf(3))
        registry.dropHandler(1)

        assertFalse(registry.relations.waitsFor(1, 2))
        assertFalse(registry.relations.simultaneous(1, 3))
    }
}

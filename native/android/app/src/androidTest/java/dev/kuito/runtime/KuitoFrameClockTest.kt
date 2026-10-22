package dev.kuito.runtime

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The input drain's clock: Choreographer's latest frame at or before now,
 * so the frame after a touch never runs the UI kernel at an earlier time
 * (docs/native-scheduling.md#input).
 */
@RunWith(AndroidJUnit4::class)
class KuitoFrameClockTest {
    @Test
    fun drainsAtTheLatestFrameAtOrBeforeNow() {
        val clock = KuitoFrameClock { 100f }

        clock.frame(ms(100))

        assertEquals(120.0, clock.latest(ms(125)), 0.0)
        assertEquals(130.0, clock.latest(ms(130)), 0.0)
    }

    @Test
    fun followsTheLatestFrame() {
        val clock = KuitoFrameClock { 100f }

        clock.frame(ms(100))
        clock.frame(ms(117))

        assertEquals(137.0, clock.latest(ms(139)), 0.0)
    }

    @Test
    fun drainsAtNowBeforeAFirstFrame() {
        assertEquals(125.0, KuitoFrameClock { 100f }.latest(ms(125)), 0.0)
    }

    @Test
    fun drainsAtNowWithoutADisplay() {
        val clock = KuitoFrameClock { 0f }

        clock.frame(ms(100))

        assertEquals(125.0, clock.latest(ms(125)), 0.0)
    }

    private fun ms(value: Long) = value * 1_000_000L
}

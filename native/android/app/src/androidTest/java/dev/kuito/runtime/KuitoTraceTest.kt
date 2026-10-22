package dev.kuito.runtime

import android.os.Trace
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assume.assumeFalse
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class KuitoTraceTest {
    /** A commit names its section with its size: that string is made only for a trace that records it. */
    @Test
    fun aNameIsNotBuiltWhileNothingTraces() {
        assumeFalse(Trace.isEnabled())
        var built = false

        assertEquals(7, traced({ built = true; "Kuito commit 7" }) { 7 })
        assertFalse(built)
    }
}

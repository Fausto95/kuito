package dev.kuito.runtime.renderer

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith

/** A batch's records as Kotlin reads them (KuitoMutations). */
@RunWith(AndroidJUnit4::class)
class KuitoMutationsTest {
    /** An enum crosses as its index alone: its value comes from the generated tables, made once. */
    @Test
    fun anEnumReadsItsValueFromItsIndexOnce() {
        val key = kuitoKey("alignItems")
        val batch = KuitoMutations(
            ops = intArrayOf(KuitoOp.PROP, KuitoOp.PROP),
            kinds = intArrayOf(5, 5),
            keys = intArrayOf(key, key),
            ids = intArrayOf(1, 2),
            parents = IntArray(2),
            ints = intArrayOf(5, 5),
            numbers = DoubleArray(2),
            texts = arrayOfNulls(2),
            names = arrayOfNulls(2),
            edits = arrayOfNulls(2),
            editKeys = arrayOfNulls(2),
            recordNumbers = arrayOfNulls(2),
            recordStrings = arrayOfNulls(2),
        )

        assertEquals(KuitoValue.Enum(5, "center"), batch.value(0))
        assertSame(batch.value(0), batch.value(1))
    }
}

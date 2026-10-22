package dev.kuito.runtime.modules.filesystem

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/** `write` replaces a file atomically (docs/file-system.md): readers see the old file or the new one, never neither. */
@RunWith(AndroidJUnit4::class)
class KuitoAtomicallyTest {
    private lateinit var directory: File

    @Before
    fun makeDirectory() {
        directory = File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "atomically-${System.nanoTime()}")
        directory.mkdirs()
    }

    @After
    fun deleteDirectory() {
        directory.deleteRecursively()
    }

    @Test
    fun replacesAFile() {
        val target = File(directory, "notes.txt").apply { writeText("old") }

        atomically(target) { it.writeText("new") }

        assertEquals("new", target.readText())
        assertEquals(listOf("notes.txt"), directory.list()?.toList())
    }

    @Test
    fun replacesADirectory() {
        val target = File(directory, "notes").apply { mkdir() }
        File(target, "inside.txt").writeText("old")

        atomically(target) { it.writeText("new") }

        assertEquals("new", target.readText())
    }

    @Test
    fun keepsTheOldFileWhenTheSwapFails() {
        val target = File(directory, "notes.txt").apply { writeText("old") }

        // Nothing staged, so the swap has nothing to move in.
        assertThrows(Exception::class.java) { atomically(target) {} }

        assertEquals("old", target.readText())
        assertEquals(listOf("notes.txt"), directory.list()?.toList())
    }

    @Test
    fun neverLeavesTheFileMissing() {
        val target = File(directory, "notes.txt").apply { writeText("0") }
        val writing = AtomicBoolean(true)
        val missing = AtomicBoolean(false)
        val reader = Thread {
            while (writing.get()) if (!target.exists()) missing.set(true)
        }.apply { start() }

        try {
            repeat(2_000) { index -> atomically(target) { it.writeText("$index") } }
        } finally {
            writing.set(false)
            reader.join()
        }

        assertFalse("A reader found no file while it was replaced", missing.get())
    }
}

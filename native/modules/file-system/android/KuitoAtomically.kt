package dev.kuito.runtime.modules.filesystem

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption.ATOMIC_MOVE
import java.nio.file.StandardCopyOption.REPLACE_EXISTING

/**
 * Writes beside `target`, then swaps it in with rename(2): a reader finds the
 * old file or the new one, and a failed write or swap leaves the old one.
 */
internal fun atomically(target: File, write: (File) -> Unit) {
    val staged = File(target.parentFile, ".kuito-${System.nanoTime()}-${target.name}")

    try {
        write(staged)
        // On disk before the rename, so a crash can't swap in an empty file.
        if (staged.isFile) FileOutputStream(staged, true).use { it.fd.sync() }
        // rename(2) replaces a file, but not a directory with files in it, nor one kind with the other.
        if (target.isDirectory || staged.isDirectory) target.deleteRecursively()
        Files.move(staged.toPath(), target.toPath(), ATOMIC_MOVE, REPLACE_EXISTING)
    } finally {
        staged.deleteRecursively()
    }
}

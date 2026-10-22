package dev.kuito.runtime.devtools

import dev.kuito.runtime.renderer.KuitoMutations

/**
 * A recording's batch as a shell with no JS applies it: native/shared/Recording.h's
 * `ReplayBatch`, sent [ms] milliseconds after the recording's runtime started.
 */
class KuitoReplayBatch(val ms: Double, val batch: KuitoMutations) {
    companion object {
        init {
            System.loadLibrary("kuito_mobile")
        }

        /**
         * The batches of [file], a `.krec`, decoded and checked in order against
         * one view table. Throws, naming what is wrong with the file. Main thread.
         */
        fun of(file: ByteArray): List<KuitoReplayBatch> = Batches().also { decode(file, it) }.list

        @JvmStatic private external fun decode(file: ByteArray, into: Batches)
    }

    private class Batches {
        val list = mutableListOf<KuitoReplayBatch>()

        @Suppress("unused")
        fun onNativeBatch(
            ops: IntArray, kinds: IntArray, keys: IntArray, ids: IntArray, parents: IntArray, ints: IntArray,
            numbers: DoubleArray, texts: Array<String?>, names: Array<String?>,
            edits: Array<IntArray?>, editKeys: Array<Array<String>?>,
            recordNumbers: Array<DoubleArray?>, recordStrings: Array<Array<String>?>, hostCalls: Int, sentAt: Double,
        ) {
            list += KuitoReplayBatch(
                sentAt,
                KuitoMutations(
                    ops, kinds, keys, ids, parents, ints, numbers, texts, names, edits, editKeys, recordNumbers,
                    recordStrings,
                ),
            )
        }
    }
}

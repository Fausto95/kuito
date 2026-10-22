package dev.kuito.runtime

import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec

/**
 * Over-the-air updates (docs/updates.md#on-the-device): a shell takes only
 * an update signed with its key, for its app, platform and fingerprint,
 * newer than what it runs, and rolls back to the bytecode it shipped with
 * after a crash loop.
 */
@RunWith(AndroidJUnit4::class)
class KuitoUpdatesTest {
    private val key: KeyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    private val fingerprint = "ab".repeat(32)
    private val base = "https://updates.example.com/reel"
    private val manifestUrl = "$base/android/$fingerprint/update.json"
    private lateinit var directory: File
    /** What the host serves, by URL. */
    private val served = mutableMapOf<String, ByteArray>()

    @Before
    fun makeDirectory() {
        directory = File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "updates-${System.nanoTime()}")
    }

    @After
    fun deleteDirectory() {
        directory.deleteRecursively()
    }

    private fun shell(builtAt: Long = 1_000, fingerprint: String = this.fingerprint, publicKey: java.security.PublicKey = key.public) =
        KuitoUpdateShell("com.example.reel", base, publicKey, fingerprint, builtAt)

    /** A new process: the shell as it starts again, reading what the last one left. */
    private fun updates(shell: KuitoUpdateShell = shell()): KuitoUpdates {
        val served = served.toMap()

        return KuitoUpdates(shell, directory) { url, _ -> served[url] }
    }

    private fun hex(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    /** Publishes an update of one script; returns its id. */
    private fun publish(
        script: String,
        createdAt: Long,
        path: String = "app.hbc",
        app: String = "com.example.reel",
        platform: String = "android",
        url: String = base,
        fingerprint: String = this.fingerprint,
        tamper: (String) -> String = { it },
    ): String {
        val bytes = script.encodeToByteArray()
        val id = hex("$path ${hex(bytes)}\n".encodeToByteArray()).take(16)
        val manifest = JSONObject()
            .put("format", 1).put("id", id).put("app", app).put("platform", platform).put("url", url).put("fingerprint", fingerprint)
            .put("createdAt", createdAt)
            .put("files", JSONArray().put(JSONObject().put("path", path).put("sha256", hex(bytes)).put("size", bytes.size)))
            .toString()
        val signature = Signature.getInstance("SHA256withECDSA").run {
            initSign(key.private)
            update(manifest.encodeToByteArray())
            Base64.encodeToString(sign(), Base64.NO_WRAP)
        }

        served[manifestUrl] = JSONObject().put("manifest", tamper(manifest)).put("signature", signature).toString().encodeToByteArray()
        served["$base/android/$fingerprint/$id/$path"] = bytes

        return id
    }

    private fun script(updates: KuitoUpdates) = updates.bundle?.let { File(it, "app.hbc").readText() }

    private fun assertRefused(expected: KuitoUpdateError.Reason, updates: KuitoUpdates) {
        try {
            updates.check()
            fail("the update was taken")
        } catch (error: KuitoUpdateError) {
            assertEquals(expected, error.reason)
        }
    }

    // Applied on the next start

    @Test
    fun aVerifiedUpdateIsStagedAndRunsFromTheNextStart() {
        val id = publish("one", 2_000)
        val first = updates()

        assertNull("nothing to run yet but the embedded bundle", first.launch())
        assertEquals(id, first.check()?.id)
        assertNull("the running process keeps what it started with", first.bundle)

        val second = updates()

        assertEquals(id, second.launch()?.id)
        assertEquals("one", script(second))
    }

    @Test
    fun anUpdateShipsTheUIKernelBesideTheKernel() {
        val id = publish("ui kernel", 2_000, path = "ui.hbc")

        updates().check()
        val next = updates()

        assertEquals(id, next.launch()?.id)
        assertEquals("ui kernel", File(checkNotNull(next.bundle), "ui.hbc").readText())
    }

    @Test
    fun anUpdateShipsTheAppUIBundleBesideTheApp() {
        val id = publish("ui bundle", 2_000, path = "app-ui.hbc")

        updates().check()
        val next = updates()

        assertEquals(id, next.launch()?.id)
        assertEquals("ui bundle", File(checkNotNull(next.bundle), "app-ui.hbc").readText())
    }

    @Test
    fun theUpdateAShellRunsServedAgainIsNothingNew() {
        publish("one", 2_000)
        updates().launch()
        updates().check()

        val running = updates()

        running.launch()
        assertNull(running.check())
    }

    @Test
    fun noPublishedUpdateIsNothingNew() {
        val updates = updates()

        updates.launch()
        assertNull(updates.check())
    }

    // Refused

    @Test
    fun aTamperedManifestIsRefused() {
        publish("one", 2_000) { it.replace("2000", "9000") }

        assertRefused(KuitoUpdateError.Reason.SIGNATURE, updates())
    }

    @Test
    fun aManifestSignedWithAnotherKeyIsRefused() {
        publish("one", 2_000)

        val other = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()

        assertRefused(KuitoUpdateError.Reason.SIGNATURE, updates(shell(publicKey = other.public)))
    }

    @Test
    fun aTamperedScriptIsRefused() {
        val id = publish("one", 2_000)

        served["$base/android/$fingerprint/$id/app.hbc"] = "two".encodeToByteArray()

        assertRefused(KuitoUpdateError.Reason.FILE, updates())
        assertNull("nothing was staged", updates().launch())
    }

    @Test
    fun anOlderUpdateServedAgainIsRefused() {
        publish("new", 3_000)
        updates().check()
        publish("old", 2_000)

        assertRefused(KuitoUpdateError.Reason.STALE, updates())
    }

    @Test
    fun anUpdateOlderThanTheEmbeddedBytecodeIsRefused() {
        publish("old", 900)

        assertRefused(KuitoUpdateError.Reason.STALE, updates(shell(builtAt = 1_000)))
    }

    @Test
    fun anUpdateForAnotherAppOrPlatformIsRefused() {
        publish("one", 2_000, app = "com.example.other")
        assertRefused(KuitoUpdateError.Reason.OTHER_APP, updates())

        publish("one", 2_000, platform = "ios")
        assertRefused(KuitoUpdateError.Reason.OTHER_PLATFORM, updates())
    }

    @Test
    fun anUpdateForAnotherHostIsRefused() {
        // A staging update, signed with the same key, served where production looks.
        publish("one", 2_000, url = "$base-staging")

        assertRefused(KuitoUpdateError.Reason.OTHER_HOST, updates())
    }

    @Test
    fun aChunkNameNeverLeavesTheBundle() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        assertNull(KuitoAppBundle.chunk(context, "../../shared_prefs/x"))
        assertNull(KuitoAppBundle.chunk(context, "/data/local/tmp/x"))
    }

    @Test
    fun anUpdateForAnotherShellIsRefused() {
        // Served where this shell looks, as a host that mixed up its directories would.
        publish("one", 2_000, fingerprint = "cd".repeat(32))

        assertRefused(KuitoUpdateError.Reason.INCOMPATIBLE, updates())
    }

    @Test
    fun anUpdateTheCliSignedVerifies() {
        val fixture = InstrumentationRegistry.getInstrumentation().context.assets.open("android.json")
            .use { JSONObject(it.readBytes().decodeToString()) }
        val publicKey = KeyFactory.getInstance("EC")
            .generatePublic(X509EncodedKeySpec(Base64.decode(fixture.getString("publicKey"), Base64.DEFAULT)))
        val manifest = KuitoUpdates.verify(
            fixture.getJSONObject("envelope").toString().encodeToByteArray(),
            shell(builtAt = 0, publicKey = publicKey),
        )

        assertEquals(listOf("app.hbc"), manifest.files.map { it.path })
        assertEquals(1_761_134_400_000L, manifest.createdAt)
    }

    // Rollback

    @Test
    fun aCrashLoopRollsBackToTheEmbeddedBytecode() {
        val id = publish("bad", 2_000)

        updates().launch()
        updates().check()

        repeat(KuitoUpdates.CRASH_LOOP) {
            val crashing = updates()

            assertEquals(id, crashing.launch()?.id)
            crashing.drew()
            crashing.crashed()
        }

        val recovered = updates()

        assertNull("back to the embedded bytecode", recovered.launch())
        assertRefused(KuitoUpdateError.Reason.ROLLED_BACK, recovered)
    }

    @Test
    fun aLaunchThatNeverDrawsCountsAsACrash() {
        publish("hangs", 2_000)
        updates().launch()
        updates().check()

        repeat(KuitoUpdates.CRASH_LOOP) { assertNotNull(updates().launch()) }

        assertNull(updates().launch())
    }

    @Test
    fun aHealthyLaunchClearsTheCount() {
        val id = publish("flaky", 2_000)

        updates().launch()
        updates().check()

        for (crashes in listOf(true, false, true)) {
            val launched = updates()

            assertEquals(id, launched.launch()?.id)
            launched.drew()
            if (crashes) launched.crashed()
        }

        assertEquals(id, updates().launch()?.id)
    }

    @Test
    fun aScriptChangedOnDiskFallsBackToTheEmbeddedBytecode() {
        publish("one", 2_000)
        updates().launch()
        updates().check()

        val running = updates()

        running.launch()
        File(checkNotNull(running.bundle), "app.hbc").writeText("evil")

        assertNull(updates().launch())
    }

    @Test
    fun aNewShellStartsFromItsOwnBytecode() {
        publish("one", 2_000)
        updates().launch()
        updates().check()

        assertNull("a store build replaced the shell", updates(shell(builtAt = 1_500)).launch())
    }
}

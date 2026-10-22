package dev.kuito.runtime.modules.securestore

import android.app.KeyguardManager
import android.content.Context
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.UserNotAuthenticatedException
import android.util.Base64
import dev.kuito.link.KeychainAccessibility
import dev.kuito.link.SecureStoreRequest
import dev.kuito.link.SecureStoreSpec
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.link.resolve
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import org.json.JSONObject
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher

/**
 * `SecureStore` in native/modules/secure-store/secure-store.ts: each secret
 * encrypted with an Android Keystore key (AES-256-GCM, see
 * [KuitoSecureStoreKeys]) and kept, with its IV and the key's alias, in a
 * private SharedPreferences file.
 */
class KuitoSecureStoreModule(private val context: KuitoModuleContext) : SecureStoreSpec {
    private val activity = context.activity
    private val items by lazy {
        activity.applicationContext.getSharedPreferences("kuito.securestore", Context.MODE_PRIVATE)
    }

    // Callbacks: a key that needs a biometric settles once the prompt answers.
    override fun getItem(request: SecureStoreRequest, promise: KuitoPromise<String?>) {
        val stored = items.getString(request.entry, null)?.let(::JSONObject) ?: return promise.resolve(null)
        val alias = stored.getString("alias")
        val sealed = Base64.decode(stored.getString("data"), Base64.NO_WRAP)
        val cipher = KuitoSecureStoreKeys.existing(alias)?.let { key ->
            unlock(request) {
                Cipher.getInstance(KuitoSecureStoreKeys.TRANSFORMATION).apply {
                    init(Cipher.DECRYPT_MODE, key, KuitoSecureStoreKeys.iv(stored.getString("iv")))
                    updateAAD(request.entry.toByteArray())
                }
            }
        }

        // No key (restored from a backup, or the app's keys were wiped) or one
        // invalidated by a new fingerprint: nothing can decrypt this again.
        if (cipher == null) return forget(request, promise)

        authorize(cipher, request, promise, needed = alias == KuitoSecureStoreKeys.AUTHENTICATED) { ready ->
            try {
                promise.resolve(String(ready.doFinal(sealed)))
            } catch (_: AEADBadTagException) {
                forget(request, promise)
            }
        }
    }

    override fun setItem(request: SecureStoreRequest, promise: KuitoPromise<Unit>) {
        val value = request.value ?: throw KuitoModuleError("ERR_ARGUMENT", "missing \"value\"")

        check(request)
        val alias = KuitoSecureStoreKeys.alias(request)
        val cipher = unlock(request) {
            Cipher.getInstance(KuitoSecureStoreKeys.TRANSFORMATION).apply {
                init(Cipher.ENCRYPT_MODE, KuitoSecureStoreKeys.key(alias))
                updateAAD(request.entry.toByteArray())
            }
        } ?: throw KuitoModuleError("ERR_KEYSTORE", "SecureStore's key for ${request.key} was invalidated; try again")

        authorize(cipher, request, promise, needed = request.requireAuthentication) { ready ->
            val stored = JSONObject()
                .put("alias", alias)
                .put("iv", Base64.encodeToString(ready.iv, Base64.NO_WRAP))
                .put("data", Base64.encodeToString(ready.doFinal(value.toByteArray()), Base64.NO_WRAP))

            if (!items.edit().putString(request.entry, stored.toString()).commit())
                throw KuitoModuleError("ERR_KEYSTORE", "SecureStore could not write ${request.key}")
            promise.resolve()
        }
    }

    override fun deleteItem(request: SecureStoreRequest) = delete(request.entry)

    /** Fails when the device can't honor the request's accessibility or authentication. */
    private fun check(request: SecureStoreRequest) {
        if (request.accessible == KeychainAccessibility.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY &&
            !activity.getSystemService(KeyguardManager::class.java).isDeviceSecure
        ) throw KuitoModuleError("ERR_UNAVAILABLE", "whenPasscodeSetThisDeviceOnly needs a screen lock set")

        if (!request.requireAuthentication) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R)
            throw KuitoModuleError("ERR_AUTH_UNAVAILABLE", "requireAuthentication needs Android 11 or later")

        val status = activity.getSystemService(BiometricManager::class.java)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)

        if (status != BiometricManager.BIOMETRIC_SUCCESS)
            throw KuitoModuleError("ERR_AUTH_UNAVAILABLE", "requireAuthentication needs a strong biometric enrolled (status $status)")
    }

    private fun delete(entry: String) {
        if (!items.edit().remove(entry).commit()) throw KuitoModuleError("ERR_KEYSTORE", "SecureStore could not delete $entry")
    }

    private fun forget(request: SecureStoreRequest, promise: KuitoPromise<String?>) {
        delete(request.entry)
        promise.resolve(null)
    }

    /** The initialized cipher, or null when its key can never be used again. */
    private fun unlock(request: SecureStoreRequest, initialize: () -> Cipher): Cipher? = try {
        initialize()
    } catch (_: KeyPermanentlyInvalidatedException) {
        KuitoSecureStoreKeys.discard(KuitoSecureStoreKeys.alias(request))
        null
    } catch (_: UserNotAuthenticatedException) {
        throw KuitoModuleError("ERR_UNAVAILABLE", "SecureStore can't use ${request.key} while the device is locked")
    }

    /** Runs [then] with [cipher] once the user authenticates, or straight away when no one has to. */
    private fun authorize(
        cipher: Cipher, request: SecureStoreRequest, promise: KuitoPromise<*>, needed: Boolean, then: (Cipher) -> Unit,
    ) {
        val settle = { ready: Cipher ->
            try {
                then(ready)
            } catch (error: Exception) {
                promise.reject(error)
            }
        }

        if (!needed) return settle(cipher)

        activity.runOnUiThread {
            val executor = activity.mainExecutor
            val prompt = BiometricPrompt.Builder(activity)
                .setTitle(request.prompt ?: "Authenticate")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setNegativeButton("Cancel", executor) { _, _ ->
                    promise.reject("ERR_AUTH_CANCELED", "The user canceled authentication for ${request.key}")
                }
                .build()

            prompt.authenticate(BiometricPrompt.CryptoObject(cipher), CancellationSignal(), executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        settle(cipher) // the CryptoObject wraps this cipher, now authorized
                    }

                    override fun onAuthenticationError(code: Int, message: CharSequence) {
                        promise.reject(if (code in CANCELED) "ERR_AUTH_CANCELED" else "ERR_AUTH_FAILED", message.toString())
                    }
                })
        }
    }

    private companion object {
        val CANCELED = setOf(
            BiometricPrompt.BIOMETRIC_ERROR_CANCELED,
            BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED,
        )
    }
}

/** Keys and services never contain ":" (src/native/secure-store.ts), so entries don't collide. */
internal val SecureStoreRequest.entry get() = "$service:$key"

/** Keystore keys never leave the device, so iOS's ThisDeviceOnly classes change nothing here. */
internal val KeychainAccessibility.unlockedDeviceRequired get() = when (this) {
    KeychainAccessibility.WHEN_UNLOCKED,
    KeychainAccessibility.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    KeychainAccessibility.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    -> true
    KeychainAccessibility.AFTER_FIRST_UNLOCK,
    KeychainAccessibility.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    -> false
}

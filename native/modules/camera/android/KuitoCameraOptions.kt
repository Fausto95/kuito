package dev.kuito.runtime.modules.camera

import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import com.google.mlkit.vision.barcode.common.Barcode
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoType

/** The values CameraView's props take (src/native/camera.ts), and what each means to CameraX. */
enum class KuitoCameraFacing(val selector: CameraSelector) {
    BACK(CameraSelector.DEFAULT_BACK_CAMERA),
    FRONT(CameraSelector.DEFAULT_FRONT_CAMERA),
}

enum class KuitoCameraMode { PICTURE, VIDEO }

enum class KuitoCameraFlash(val mode: Int) {
    OFF(ImageCapture.FLASH_MODE_OFF),
    ON(ImageCapture.FLASH_MODE_ON),
    AUTO(ImageCapture.FLASH_MODE_AUTO),
}

/** BarcodeType's names, and the ML Kit formats each scans. */
enum class KuitoBarcodeType(val wire: String, vararg val formats: Int) {
    QR("qr", Barcode.FORMAT_QR_CODE),
    AZTEC("aztec", Barcode.FORMAT_AZTEC),
    DATAMATRIX("datamatrix", Barcode.FORMAT_DATA_MATRIX),
    PDF417("pdf417", Barcode.FORMAT_PDF417),
    // UPC-A is an EAN-13 with a leading zero; iOS reports it as one.
    EAN13("ean13", Barcode.FORMAT_EAN_13, Barcode.FORMAT_UPC_A),
    EAN8("ean8", Barcode.FORMAT_EAN_8),
    UPC_E("upc_e", Barcode.FORMAT_UPC_E),
    CODE39("code39", Barcode.FORMAT_CODE_39),
    CODE93("code93", Barcode.FORMAT_CODE_93),
    CODE128("code128", Barcode.FORMAT_CODE_128),
    ITF14("itf14", Barcode.FORMAT_ITF),
    ;

    companion object {
        val type = KuitoType { value ->
            values().firstOrNull { it.wire == value }
                ?: throw KuitoModuleError("ERR_ARGUMENT",
                    "expected a BarcodeType (${values().joinToString(", ") { "\"${it.wire}\"" }}), got $value")
        }

        fun of(format: Int) = values().firstOrNull { format in it.formats }
    }
}

/** What the view asks for; the view applies only what changed. */
data class KuitoCameraConfiguration(
    val facing: KuitoCameraFacing = KuitoCameraFacing.BACK,
    val mode: KuitoCameraMode = KuitoCameraMode.PICTURE,
    val mute: Boolean = false,
    val flash: KuitoCameraFlash = KuitoCameraFlash.OFF,
    val torch: Boolean = false,
    val zoom: Double = 0.0,
    val barcodeTypes: List<KuitoBarcodeType> = emptyList(),
) {
    val scanning get() = barcodeTypes.isNotEmpty()
}

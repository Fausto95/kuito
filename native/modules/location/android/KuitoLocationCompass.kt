package dev.kuito.runtime.modules.location

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import dev.kuito.link.LocationHeading

// Smaller turns aren't worth an event: the rotation vector reports at ~60 Hz
// and jitters by fractions of a degree at rest.
private const val MIN_TURN_DEGREES = 0.5

/**
 * The compass, from the rotation vector sensor, running only while `heading`
 * has a listener. True north needs the magnetic declination where the device
 * is, so `trueHeading` is null until a fix is known.
 */
class KuitoLocationCompass(
    context: Context,
    private val where: () -> Location?,
    private val onHeading: (LocationHeading) -> Unit,
) : SensorEventListener {
    private val sensors = context.getSystemService(SensorManager::class.java)
    private val rotation = FloatArray(9)
    private val orientation = FloatArray(3)
    private var accuracy = SensorManager.SENSOR_STATUS_UNRELIABLE
    private var last: Double? = null

    val available: Boolean get() = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null

    fun start() {
        sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)?.let {
            sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
    }

    fun stop() {
        sensors.unregisterListener(this)
        last = null
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        this.accuracy = accuracy
    }

    override fun onSensorChanged(event: SensorEvent) {
        SensorManager.getRotationMatrixFromVector(rotation, event.values)
        SensorManager.getOrientation(rotation, orientation)

        val magnetic = (Math.toDegrees(orientation[0].toDouble()) + 360) % 360
        val previous = last

        if (previous != null && turn(previous, magnetic) < MIN_TURN_DEGREES) return
        last = magnetic

        onHeading(
            LocationHeading(
                trueHeading = where()?.let { (magnetic + declination(it) + 360) % 360 },
                magHeading = magnetic,
                accuracy = accuracy.coerceIn(0, 3).toDouble(),
            ),
        )
    }

    private fun turn(from: Double, to: Double) = Math.abs(((to - from + 540) % 360) - 180)

    private fun declination(at: Location) =
        GeomagneticField(at.latitude.toFloat(), at.longitude.toFloat(), at.altitude.toFloat(), at.time).declination.toDouble()
}
